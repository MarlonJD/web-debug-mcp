import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import type {
  ActionResult,
  BrowserAction,
  BrowserLocator,
  BrowserSnapshot,
  BrowserTarget,
  ConsoleEntry,
  DebuggerBreakpoint,
  DebuggerSnapshot,
  DomSnapshot,
  NetworkEntry,
  OperationContext,
  LocatorProbeResult,
  LocatorProperty,
} from "../domain/types.js";
import { MAX_LOCATOR_CHARS, MAX_PROPERTIES_PER_PROBE, MAX_RESULT_BYTES } from "../domain/types.js";
import { WebDebugError } from "../core/errors.js";
import { boundItems, boundText, redactValue, safeUrl } from "../core/redaction.js";
import { MAX_SCREENSHOT_RESPONSE_BYTES, MAX_WEBDRIVER_RESPONSE_BYTES, readResponseTextBounded } from "../core/http.js";
import { assertTopLevelOrigin, navigationOriginError, originOf } from "../core/origin-policy.js";
import type {
  BrowserAdapter,
  BrowserStartOptions,
  EvaluationResult,
  SnapshotOptions,
} from "./browser.js";

const DEFAULT_DRIVER_ENDPOINT = "http://127.0.0.1:4444";
const MAX_REQUEST_MS = 5_000;
const MAX_BIDI_MESSAGE_BYTES = 256 * 1024;

interface WebDriverEnvelope {
  value?: unknown;
  sessionId?: string;
}

interface WebDriverRect {
  width?: number;
  height?: number;
}

interface WebDriverElement {
  [key: string]: unknown;
}

interface CreatedWebDriverSession {
  id: string;
  webSocketUrl?: string;
  browserVersion?: string;
}

interface BidiEvent {
  method?: string;
  params?: Record<string, any>;
}

/**
 * Safari transport through the macOS safaridriver W3C WebDriver endpoint.
 * WebDriver provides browser actions, DOM, screenshots, and explicit JS
 * evaluation, but it does not expose Chromium's CDP debugger domains.
 */
export class SafariAdapter implements BrowserAdapter {
  private client: WebDriverClient | null = null;
  private sessionId: string | null = null;
  private driverProcess: ChildProcess | null = null;
  private allowRemote = false;
  private baseOrigin: string | null = null;
  private remoteTarget = false;
  private bidi: SafariBidiClient | null = null;
  private bidiWarning: string | null = null;
  private performanceNetworkFallbackUsed = false;
  private readonly consoleEntries: ConsoleEntry[] = [];
  private readonly networkEntries = new Map<string, NetworkEntry>();
  private headlessRequested = true;
  private lastKnownTitle = "";
  private lastKnownDom: DomSnapshot = { bodyText: "", elements: [] };
  private browserVersionValue: string | null = null;
  private selectedWindowHandle: string | null = null;

  constructor(private readonly configuredEndpoint?: string) {}

  async start(options: BrowserStartOptions, context: OperationContext = {}): Promise<BrowserTarget> {
    assertContext(context);
    if (options.tls === "allow-insecure-loopback") throw new WebDebugError("SAFARI_TLS_UNAVAILABLE", "Safari WebDriver does not support the guarded loopback TLS bypass.");
    if (options.authState || options.authFixture === "seeded-disposable") throw new WebDebugError("SAFARI_AUTH_UNAVAILABLE", "Safari WebDriver does not support disposable auth-state seeding.");
    if (options.cdpEndpoint) {
      throw new WebDebugError("SAFARI_CDP_UNSUPPORTED", "Safari sessions use webdriverEndpoint, not cdpEndpoint.");
    }
    this.allowRemote = options.allowRemote ?? false;
    this.headlessRequested = options.headless ?? true;
    assertAllowedUrl(options.url, this.allowRemote);
    this.baseOrigin = originOf(options.url);

    const configured = options.webdriverEndpoint
      ?? this.configuredEndpoint
      ?? process.env.WEB_DEBUG_SAFARI_WEBDRIVER_ENDPOINT;
    const endpoint = configured ?? DEFAULT_DRIVER_ENDPOINT;
    assertAllowedEndpoint(endpoint, this.allowRemote);
    this.remoteTarget = !isLoopback(new URL(endpoint).hostname);
    this.client = new WebDriverClient(endpoint);

    if (!configured) await this.ensureDriver(endpoint, context);
    try {
      const created = await this.client.createSession(context);
      this.sessionId = created.id;
      this.selectedWindowHandle = await this.command<string>("/window", "GET", undefined, context);
      if (created.webSocketUrl) {
        assertAllowedBidiEndpoint(created.webSocketUrl, this.allowRemote);
        try {
          this.bidi = await SafariBidiClient.connect(created.webSocketUrl, (event) => this.recordBidiEvent(event));
        } catch (error) {
          this.bidiWarning = `Safari WebDriver BiDi unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)} Console events are unavailable; network evidence will use Performance Resource Timing when available.`;
        }
      } else {
        this.bidiWarning = "Safari WebDriver did not return a BiDi WebSocket URL; console events are unavailable; network evidence will use Performance Resource Timing when available.";
      }
      await this.navigate(options.url, context);
      await this.enforceOwnedTopLevelState(context);
      this.lastKnownTitle = await this.readTitle(context);
      this.lastKnownDom = await this.readDom(context);
      this.browserVersionValue = created.browserVersion ?? null;
      return await this.target(context);
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.bidi?.close();
    this.bidi = null;
    await this.client?.deleteSession().catch(() => undefined);
    this.client = null;
    this.sessionId = null;
    this.baseOrigin = null;
    this.remoteTarget = false;
    this.bidiWarning = null;
    this.performanceNetworkFallbackUsed = false;
    this.browserVersionValue = null;
    this.selectedWindowHandle = null;
    this.consoleEntries.length = 0;
    this.networkEntries.clear();
    if (this.driverProcess) {
      this.driverProcess.kill("SIGTERM");
      this.driverProcess = null;
    }
  }

  async resetObservers(_context: OperationContext = {}): Promise<void> {
    this.consoleEntries.length = 0;
    this.networkEntries.clear();
    this.performanceNetworkFallbackUsed = false;
  }

  targetIdentity(): string | null { return this.sessionId; }
  browserVersion(): string | null { return this.browserVersionValue; }

  async act(action: BrowserAction, context: OperationContext = {}): Promise<ActionResult> {
    assertContext(context);
    this.requireClient();
    await this.enforceOwnedTopLevelState(context);
    switch (action.kind) {
      case "navigate":
        assertAllowedUrl(action.url, this.allowRemote);
        this.assertSameOrigin(action.url);
        await this.navigate(action.url, context);
        break;
      case "click":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari WebDriver supports CSS locators only.");
        await this.click(action.locator.value, context);
        break;
      case "fill":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari WebDriver supports CSS locators only.");
        await this.fill(action.locator.value, action.value, context);
        break;
      case "press":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari WebDriver supports CSS locators only.");
        await this.press(action.locator.value, action.key, context);
        break;
      case "select":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari WebDriver supports CSS locators only.");
        await this.select(action.locator.value, action.value, context);
        break;
      case "check":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari WebDriver supports CSS locators only.");
        await this.setChecked(action.locator.value, action.checked, context);
        break;
      case "hover":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari WebDriver supports CSS locators only.");
        await this.hover(action.locator.value, context);
        break;
      case "scroll":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari WebDriver supports CSS locators only.");
        await this.scroll(action.locator.value, context);
        break;
      case "wait":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari WebDriver supports CSS locators only.");
        await this.waitForProbe(action, context);
        break;
      case "reload":
        await this.command("/refresh", "POST", undefined, context);
        break;
    }
    const url = await this.enforceOwnedTopLevelState(context);
    const title = await this.readTitle(context);
    return { kind: action.kind, url: safeUrl(url), title };
  }

  async probe(locator: BrowserLocator, properties: LocatorProperty[], context: OperationContext = {}): Promise<LocatorProbeResult> {
    assertContext(context);
    const unique = [...new Set(properties)];
    if (unique.length === 0) throw new WebDebugError("PROBE_PROPERTIES_REQUIRED", "A locator probe must request at least one property.");
    if (unique.length > MAX_PROPERTIES_PER_PROBE) throw new WebDebugError("PROBE_PROPERTIES_LIMIT", `A locator probe may request at most ${MAX_PROPERTIES_PER_PROBE} properties.`);
    if (locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari WebDriver supports CSS locators only; computed semantic locators are unavailable.");
    if (!locator.value || locator.value.length > MAX_LOCATOR_CHARS) throw new WebDebugError("LOCATOR_INVALID", `Locator values are limited to ${MAX_LOCATOR_CHARS} characters.`);
    await this.enforceOwnedTopLevelState(context);
    const values = await this.executeSync<Record<string, unknown>>(
      `const css = arguments[0];
       const elements = Array.from(document.querySelectorAll(css));
       const element = elements[0];
       const style = element ? getComputedStyle(element) : null;
       return {
         count: elements.length,
         visible: Boolean(element && style && style.visibility !== "hidden" && style.display !== "none" && element.getClientRects().length),
         enabled: Boolean(element && !(element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || (element && element.disabled !== true)),
         checked: Boolean(element && element.checked === true),
         text: element ? (element.textContent || "").slice(0, ${MAX_LOCATOR_CHARS}) : null,
       };`,
      [locator.value],
      context,
    );
    const result: LocatorProbeResult = { locator: { ...locator }, properties: unique, observedAt: new Date().toISOString(), provenance: "webdriver", warnings: [] };
    for (const property of unique) {
      const value = values?.[property];
      if (property === "count") result.count = typeof value === "number" ? value : 0;
      if (property === "visible") result.visible = value === true;
      if (property === "enabled") result.enabled = value === true;
      if (property === "checked") result.checked = value === true;
      if (property === "text") result.text = typeof value === "string" ? boundText(value, MAX_LOCATOR_CHARS) : null;
    }
    return result;
  }

  private async waitForProbe(action: Extract<BrowserAction, { kind: "wait" }>, context: OperationContext): Promise<void> {
    const timeout = boundedTimeout(action.timeoutMs);
    const deadline = Math.min(performance.now() + timeout, context.deadline ?? Number.POSITIVE_INFINITY);
    while (performance.now() <= deadline) {
      assertContext(context);
      const probe = await this.probe(action.locator, [action.property], context);
      const actual = probe[action.property];
      if (actual === action.expected || (typeof action.expected === "string" && typeof actual === "string" && actual.includes(action.expected))) return;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, Math.min(50, Math.max(1, deadline - performance.now())));
        context.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new WebDebugError("REQUEST_CANCELLED", "The request was cancelled.")); }, { once: true });
      });
    }
    throw new WebDebugError("WAIT_TIMEOUT", `Safari wait condition exceeded ${timeout}ms.`);
  }

  async snapshot(options: SnapshotOptions, context: OperationContext = {}): Promise<BrowserSnapshot> {
    assertContext(context);
    await this.enforceOwnedTopLevelState(context);
    const warnings = [
      "Safari WebDriver does not expose Chromium CDP JavaScript debugger domains; breakpoint and step controls remain unavailable.",
      "Safari WebDriver computed accessibility diagnostics and semantic locator suggestions are unavailable; use exact CSS locators and live CSS probes.",
    ];
    if (this.bidiWarning) warnings.push(this.bidiWarning);
    if (this.headlessRequested) warnings.push("Safari WebDriver does not support headless mode; the session uses a visible Safari window.");
    warnings.push("Safari WebDriver uses a visible Safari browser profile; profile isolation is not guaranteed.");

    let url = "";
    let urlAvailable = true;
    try {
      url = await this.currentUrl(context);
    } catch (error) {
      urlAvailable = false;
      warnings.push(`Safari URL snapshot unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
    }

    let dom = this.lastKnownDom;
    let domAvailable = true;
    try {
      dom = await this.readDom(context);
      this.lastKnownDom = dom;
    } catch (error) {
      domAvailable = false;
      warnings.push(`Safari DOM snapshot unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
    }

    let title = this.lastKnownTitle;
    try {
      title = await this.readTitle(context);
    } catch (error) {
      warnings.push(`Safari title snapshot unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
    }

    let screenshotPath: string | null = null;
    if (options.captureScreenshot && !options.checksOnly) {
      try {
        await mkdir(options.artifactDir, { recursive: true });
        screenshotPath = join(options.artifactDir, `safari-screenshot-${Date.now()}.png`);
        const data = await this.screenshot(context);
        await writeFile(screenshotPath, Buffer.from(data, "base64"));
      } catch (error) {
        warnings.push(`Safari screenshot unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
      }
    }

    if (!options.checksOnly && this.networkEntries.size === 0) {
      try {
        const performanceEntries = await this.readPerformanceNetwork(context);
        for (const entry of performanceEntries) this.networkEntries.set(entry.requestId, entry);
        if (performanceEntries.length > 0) this.performanceNetworkFallbackUsed = true;
      } catch (error) {
        warnings.push(`Safari network evidence unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
      }
    }
    if (this.performanceNetworkFallbackUsed) {
      warnings.push("Safari WebDriver BiDi did not emit network events; network evidence uses bounded Performance Resource Timing metadata.");
    }

    const consoleBound = boundItems(this.consoleEntries, 100);
    const networkBound = options.checksOnly ? { items: [] as NetworkEntry[], truncated: false } : boundItems([...this.networkEntries.values()], 100);
    if (consoleBound.truncated) warnings.push("Safari console entries were truncated to 100 items.");
    if (networkBound.truncated) warnings.push("Safari network entries were truncated to 100 items.");

    const snapshot: BrowserSnapshot = {
      url: safeUrl(url),
      title,
      viewport: await this.viewport(),
      dom,
      console: consoleBound.items,
      network: networkBound.items,
      screenshotPath,
      debugger: { paused: false, reason: null, callFrames: [], breakpoints: [] },
      react: null,
      angular: null,
      vue: null,
      next: null,
      vite: null,
      accessibility: null,
      warnings,
      observations: {
        url: { state: urlAvailable ? "pass" : "unavailable", freshness: urlAvailable ? "fresh" : "unknown", provenance: urlAvailable ? "browser" : "cached", observed: safeUrl(url) },
        dom: { state: domAvailable ? "pass" : "unavailable", freshness: domAvailable ? "fresh" : "stale", provenance: domAvailable ? "browser" : "cached" },
        console: this.bidi ? { state: "pass", freshness: "fresh", provenance: "webdriver-bidi" } : { state: "unavailable", freshness: "unknown", provenance: "unknown", warning: "Safari WebDriver BiDi console collection is unavailable." },
      },
    };
    if (options.checksOnly && !options.retainNetwork) this.networkEntries.clear();
    return snapshot;
  }

  async setBreakpoint(_input: { sourceUrl: string; line: number; column?: number }, _context: OperationContext = {}): Promise<DebuggerBreakpoint> {
    throw new WebDebugError(
      "DEBUGGER_UNAVAILABLE",
      "Safari WebDriver does not expose the JavaScript debugger breakpoint domain.",
    );
  }

  async control(_action: "resume" | "stepOver" | "stepInto" | "stepOut", _context: OperationContext = {}): Promise<DebuggerSnapshot> {
    throw new WebDebugError(
      "DEBUGGER_UNAVAILABLE",
      "Safari WebDriver does not expose Chromium-style pause and step controls.",
    );
  }

  async evaluate(expression: string, allowSideEffects: boolean, context: OperationContext = {}): Promise<EvaluationResult> {
    assertContext(context);
    if (!expression.trim()) throw new WebDebugError("EXPRESSION_EMPTY", "Evaluation expression cannot be empty.");
    if (!allowSideEffects) {
      throw new WebDebugError(
        "EVALUATION_SIDE_EFFECTS_BLOCKED",
        "Safari WebDriver cannot prove that an expression is side-effect free; set allowSideEffects=true explicitly.",
      );
    }
    await this.enforceOwnedTopLevelState(context);
    const result = await this.executeAsync(expression, context);
    if (!isRecord(result) || result.ok !== true) {
      throw new WebDebugError("EVALUATION_FAILED", boundText(isRecord(result) && typeof result.error === "string" ? result.error : "Safari evaluation failed.", 500));
    }
    const value = redactValue(result.value);
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_RESULT_BYTES) throw new WebDebugError("EVALUATION_RESULT_LIMIT", `Evaluation result exceeded the ${MAX_RESULT_BYTES}-byte limit.`);
    return {
      value,
      type: result.value === null ? "object" : typeof result.value,
      description: null,
    };
  }

  private recordBidiEvent(event: BidiEvent): void {
    const params = event.params ?? {};
    if (event.method === "log.entryAdded") {
      const callFrame = params.stackTrace?.callFrames?.[0];
      let text = typeof params.text === "string" ? params.text : "";
      if (!text) {
        try { text = JSON.stringify(redactValue(params.args ?? "")); }
        catch { text = "[UNSERIALIZABLE_BIDI_ARGUMENTS]"; }
      }
      this.consoleEntries.push({
        level: mapBidiLogLevel(params.level),
        text: boundText(text ?? "", 2_000),
        ...(typeof callFrame?.url === "string" && callFrame.url ? { url: safeUrl(callFrame.url) } : {}),
        ...(Number.isInteger(callFrame?.lineNumber) ? { line: callFrame.lineNumber + 1 } : {}),
        ...(Number.isInteger(callFrame?.columnNumber) ? { column: callFrame.columnNumber + 1 } : {}),
      });
      this.trimConsole();
      return;
    }
    if (event.method === "network.beforeRequestSent") {
      const request = params.request;
      if (!isRecord(request) || typeof request.request !== "string" || typeof request.url !== "string") return;
      this.networkEntries.set(request.request, {
        requestId: request.request,
        method: typeof request.method === "string" ? request.method : "GET",
        url: safeUrl(request.url),
        resourceType: typeof params.initiator?.type === "string" ? params.initiator.type : "other",
        status: null,
        ok: null,
      });
      this.trimNetwork();
      return;
    }
    if (event.method === "network.responseCompleted") {
      const response = params.response;
      if (!isRecord(response) || typeof response.request !== "string") return;
      const entry = this.networkEntries.get(response.request);
      if (!entry) return;
      entry.status = typeof response.status === "number" ? response.status : null;
      entry.ok = typeof entry.status === "number" ? entry.status >= 200 && entry.status < 400 : null;
      return;
    }
    if (event.method === "network.fetchError") {
      const request = params.request;
      if (!isRecord(request) || typeof request.request !== "string") return;
      const entry = this.networkEntries.get(request.request);
      if (!entry) return;
      entry.ok = false;
      entry.failure = typeof params.errorText === "string" ? boundText(params.errorText, 500) : "fetch error";
    }
  }

  private trimConsole(): void {
    if (this.consoleEntries.length > 200) this.consoleEntries.splice(0, this.consoleEntries.length - 200);
  }

  private trimNetwork(): void {
    if (this.networkEntries.size <= 200) return;
    const first = this.networkEntries.keys().next().value;
    if (first) this.networkEntries.delete(first);
  }

  private async readPerformanceNetwork(context: OperationContext = {}): Promise<NetworkEntry[]> {
    const value = await this.executeSync<unknown>(
      `return performance.getEntriesByType("resource").slice(-200).map((entry, index) => ({
        requestId: "performance-" + index + "-" + entry.startTime,
        method: "GET",
        url: entry.name,
        resourceType: entry.initiatorType || "other",
        status: typeof entry.responseStatus === "number" ? entry.responseStatus : null,
      }));`,
      [],
      context,
    );
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.requestId !== "string" || typeof entry.url !== "string") return [];
      const status = typeof entry.status === "number" ? entry.status : null;
      return [{
        requestId: entry.requestId,
        method: typeof entry.method === "string" ? entry.method : "GET",
        url: safeUrl(entry.url),
        resourceType: typeof entry.resourceType === "string" ? entry.resourceType : "other",
        status,
        ok: status === null ? null : status >= 200 && status < 400,
      }];
    });
  }

  private async ensureDriver(endpoint: string, context: OperationContext = {}): Promise<void> {
    this.client = this.requireClient();
    try {
      await this.client.status(context);
      return;
    } catch {
      const port = Number(process.env.WEB_DEBUG_SAFARI_PORT ?? (new URL(endpoint).port || "4444"));
      const driverPath = process.env.WEB_DEBUG_SAFARIDRIVER_PATH ?? "safaridriver";
      const bidiPort = Number(process.env.WEB_DEBUG_SAFARI_BIDI_PORT ?? "4446");
      this.driverProcess = spawn(driverPath, ["--port", String(port), "--bidi", String(bidiPort)], {
        stdio: ["ignore", "ignore", "ignore"],
      });
      await this.waitForDriver(endpoint, context);
    }
  }

  private async waitForDriver(endpoint: string, context: OperationContext = {}): Promise<void> {
    const deadline = Math.min(performance.now() + 10_000, context.deadline ?? Number.POSITIVE_INFINITY);
    let lastError = "not attempted";
    while (performance.now() < deadline) {
      if (this.driverProcess?.exitCode !== null && this.driverProcess?.exitCode !== undefined) {
        throw new WebDebugError("SAFARI_WEBDRIVER_UNAVAILABLE", `safaridriver exited with code ${this.driverProcess.exitCode}.`);
      }
      try {
        await new WebDriverClient(endpoint).status(context);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      assertContext(context);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        context.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new WebDebugError("REQUEST_CANCELLED", "The request was cancelled.")); }, { once: true });
      });
    }
    throw new WebDebugError("SAFARI_WEBDRIVER_UNAVAILABLE", `Safari WebDriver did not become ready: ${boundText(lastError, 500)}`);
  }

  private async navigate(url: string, context: OperationContext = {}): Promise<void> {
    await this.command("/url", "POST", { url }, context);
  }

  private async click(css: string, context: OperationContext = {}): Promise<void> {
    const element = await this.findElement(css, context);
    await this.command(`/element/${encodeURIComponent(element)}/click`, "POST", undefined, context);
  }

  private async fill(css: string, value: string, context: OperationContext = {}): Promise<void> {
    const element = await this.findElement(css, context);
    await this.command(`/element/${encodeURIComponent(element)}/clear`, "POST", undefined, context);
    await this.command(`/element/${encodeURIComponent(element)}/value`, "POST", { text: value, value: [...value] }, context);
  }

  private async press(css: string, key: Extract<BrowserAction, { kind: "press" }>["key"], context: OperationContext = {}): Promise<void> {
    const element = await this.findElement(css, context);
    const value = webdriverKey(key);
    await this.command(`/element/${encodeURIComponent(element)}/value`, "POST", { text: value, value: [value] }, context);
  }

  private async select(css: string, value: string, context: OperationContext = {}): Promise<void> {
    const changed = await this.executeSync<boolean>(
      `const element = document.querySelector(arguments[0]);
       if (!(element instanceof HTMLSelectElement)) return false;
       const option = Array.from(element.options).find((candidate) => candidate.value === arguments[1]);
       if (!option) return false;
       element.value = option.value;
       element.dispatchEvent(new Event("input", { bubbles: true }));
       element.dispatchEvent(new Event("change", { bubbles: true }));
       return true;`,
      [css, value],
      context,
    );
    if (!changed) throw new WebDebugError("SELECT_OPTION_NOT_FOUND", "Safari could not select the exact option value.");
  }

  private async setChecked(css: string, checked: boolean, context: OperationContext = {}): Promise<void> {
    const changed = await this.executeSync<boolean>(
      `const element = document.querySelector(arguments[0]);
       if (!(element instanceof HTMLInputElement) || (element.type !== "checkbox" && element.type !== "radio")) return false;
       if (element.checked !== arguments[1]) element.click();
       return element.checked === arguments[1];`,
      [css, checked],
      context,
    );
    if (!changed) throw new WebDebugError("CHECK_STATE_UNAVAILABLE", "Safari could not apply the requested checked state.");
  }

  private async hover(css: string, context: OperationContext = {}): Promise<void> {
    const element = await this.findElement(css, context);
    const origin = { "element-6066-11e4-a52e-4f735466cecf": element };
    try {
      await this.command("/actions", "POST", {
        actions: [{
          type: "pointer",
          id: "web-debug-mouse",
          parameters: { pointerType: "mouse" },
          actions: [{ type: "pointerMove", duration: 0, origin, x: 0, y: 0 }],
        }],
      }, context);
    } finally {
      await this.command("/actions", "DELETE", undefined, context).catch(() => undefined);
    }
  }

  private async scroll(css: string, context: OperationContext = {}): Promise<void> {
    const found = await this.executeSync<boolean>(
      `const element = document.querySelector(arguments[0]);
       if (!element) return false;
       element.scrollIntoView({ block: "center", inline: "nearest" });
       return true;`,
      [css],
      context,
    );
    if (!found) throw new WebDebugError("ELEMENT_NOT_FOUND", "Safari could not resolve the CSS locator for scrolling.");
  }

  private async findElement(css: string, context: OperationContext = {}): Promise<string> {
    const value = await this.command<WebDriverElement>("/element", "POST", { using: "css selector", value: css }, context);
    const elementId = value["element-6066-11e4-a52e-4f735466cecf"] ?? value.ELEMENT;
    if (typeof elementId !== "string") throw new WebDebugError("ELEMENT_NOT_FOUND", "Safari could not resolve the CSS locator.");
    return elementId;
  }

  private async readDom(context: OperationContext = {}): Promise<DomSnapshot> {
    const value = await this.executeSync<DomSnapshot>(
      `return {
        bodyText: (document.body?.innerText || "").slice(0, 4000),
        elements: Array.from(document.body?.querySelectorAll("*") || []).slice(0, 50).map((element) => ({
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          role: element.getAttribute("role"),
          text: (element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 240),
        })),
      };`,
      [],
      context,
    );
    return isDomSnapshot(value) ? value : this.lastKnownDom;
  }

  private async readTitle(context: OperationContext = {}): Promise<string> {
    const title = await this.command<string>("/title", "GET", undefined, context);
    this.lastKnownTitle = boundText(title, 300);
    return this.lastKnownTitle;
  }

  private async currentUrl(context: OperationContext = {}): Promise<string> {
    return this.command<string>("/url", "GET", undefined, context);
  }

  private async viewport(context: OperationContext = {}): Promise<{ width: number; height: number } | null> {
    try {
      const rect = await this.command<WebDriverRect>("/window/rect", "GET", undefined, context);
      if (Number.isFinite(rect.width) && Number.isFinite(rect.height)) return { width: rect.width!, height: rect.height! };
    } catch {
      // Safari versions without window rect support return no viewport metadata.
    }
    return null;
  }

  private async screenshot(context: OperationContext = {}): Promise<string> {
    return this.command<string>("/screenshot", "GET", undefined, context);
  }

  private async executeSync<T>(body: string, args: unknown[], context: OperationContext = {}): Promise<T> {
    return this.command<T>("/execute/sync", "POST", { script: body, args }, context);
  }

  private async executeAsync(expression: string, context: OperationContext = {}): Promise<unknown> {
    return this.command("/execute/async", "POST", {
      script: `const done = arguments[arguments.length - 1]; Promise.resolve().then(() => (${expression})).then((value) => done({ ok: true, value }), (error) => done({ ok: false, error: String(error) }));`,
      args: [],
    }, context);
  }

  private async command<T>(path: string, method: "GET" | "POST" | "DELETE", body?: unknown, context: OperationContext = {}): Promise<T> {
    const client = this.requireClient();
    return client.command<T>(this.sessionId, path, method, body, context);
  }

  private requireClient(): WebDriverClient {
    if (!this.client) throw new WebDebugError("SESSION_NOT_READY", "The Safari WebDriver session is not ready.");
    return this.client;
  }

  private assertSameOrigin(url: string): void {
    if (this.baseOrigin) assertTopLevelOrigin(url, this.baseOrigin);
  }

  private async enforceOwnedTopLevelState(context: OperationContext = {}): Promise<string> {
    try {
      const handles = await this.command<string[]>("/window/handles", "GET", undefined, context);
      const selected = this.selectedWindowHandle;
      if (!selected || !Array.isArray(handles) || !handles.includes(selected)) {
        throw navigationOriginError("The selected Safari window is no longer available.");
      }
      const secondaryHandles = handles.filter((handle) => handle !== selected);
      if (secondaryHandles.length > 0) {
        for (const handle of secondaryHandles.slice(0, 8)) {
          await this.command("/window", "POST", { handle }, context).catch(() => undefined);
          await this.command("/window", "DELETE", undefined, context).catch(() => undefined);
        }
        await this.command("/window", "POST", { handle: selected }, context).catch(() => undefined);
        throw navigationOriginError("Secondary Safari windows are outside the selected single-window session boundary.");
      }
      const url = await this.currentUrl(context);
      this.assertSameOrigin(url);
      return url;
    } catch (error) {
      if (error instanceof WebDebugError && error.code === "NAVIGATION_ORIGIN_BLOCKED") {
        await this.close().catch(() => undefined);
      }
      throw error;
    }
  }

  private async target(context: OperationContext = {}): Promise<BrowserTarget> {
    return {
      browser: "safari",
      remote: this.remoteTarget,
      url: safeUrl(await this.currentUrl(context)),
      title: await this.readTitle(context),
      viewport: await this.viewport(context),
      isolated: false,
      targetId: this.sessionId ?? undefined,
      mode: "webdriver",
      isolation: {
        browserProcess: false,
        context: false,
        profile: false,
        storage: false,
        cache: false,
        serviceWorkers: false,
        navigation: false,
        serverState: false,
      },
    };
  }
}

class WebDriverClient {
  constructor(private readonly endpoint: string) {}

  async status(context: OperationContext = {}): Promise<void> {
    await this.send("/status", "GET", undefined, context);
  }

  async createSession(context: OperationContext = {}): Promise<CreatedWebDriverSession> {
    const response = await this.send("/session", "POST", {
      capabilities: {
        alwaysMatch: {
          browserName: "safari",
          acceptInsecureCerts: false,
          webSocketUrl: true,
          "safari:experimentalWebSocketUrl": true,
        },
      },
    }, context);
    const value = isRecord(response.value) ? response.value : {};
    const capabilities = isRecord(value.capabilities) ? value.capabilities : {};
    const sessionId = typeof response.sessionId === "string"
      ? response.sessionId
      : typeof value.sessionId === "string" ? value.sessionId : null;
    if (!sessionId) throw new WebDebugError("SAFARI_SESSION_CREATE_FAILED", "Safari WebDriver returned no session ID.");
    this.sessionId = sessionId;
    return {
      id: sessionId,
      ...(typeof capabilities.browserVersion === "string" ? { browserVersion: boundText(capabilities.browserVersion, 100) } : {}),
      ...(typeof capabilities.webSocketUrl === "string"
        ? { webSocketUrl: capabilities.webSocketUrl }
        : typeof value.webSocketUrl === "string" ? { webSocketUrl: value.webSocketUrl } : {}),
    };
  }

  async deleteSession(): Promise<void> {
    if (!this.sessionId) return;
    await this.send(`/session/${encodeURIComponent(this.sessionId)}`, "DELETE").catch(() => undefined);
    this.sessionId = null;
  }

  async command<T>(sessionId: string | null, path: string, method: "GET" | "POST" | "DELETE", body?: unknown, context: OperationContext = {}): Promise<T> {
    if (!sessionId) throw new WebDebugError("SESSION_NOT_READY", "The Safari WebDriver session is not ready.");
    this.sessionId = sessionId;
    const response = await this.send(`/session/${encodeURIComponent(sessionId)}${path}`, method, body, context);
    return response.value as T;
  }

  private async send(path: string, method: "GET" | "POST" | "DELETE", body?: unknown, context: OperationContext = {}): Promise<WebDriverEnvelope> {
    const controller = new AbortController();
    const timeoutMs = context.deadline === undefined ? MAX_REQUEST_MS : Math.max(1, Math.min(MAX_REQUEST_MS, context.deadline - performance.now()));
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    context.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await fetch(`${this.endpoint}${path}`, {
        method,
        redirect: "manual",
        headers: body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const responseLimit = path.endsWith("/screenshot") ? MAX_SCREENSHOT_RESPONSE_BYTES : MAX_WEBDRIVER_RESPONSE_BYTES;
      const text = await readResponseTextBounded(response, responseLimit, "Safari WebDriver response", controller.signal);
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Safari WebDriver returned malformed JSON: ${boundText(text, 300)}`);
      }
      if (!isRecord(parsed)) throw new Error("Safari WebDriver returned an invalid response envelope.");
      const value = parsed.value;
      if (!response.ok || (isRecord(value) && typeof value.error === "string")) {
        const message = isRecord(value) && typeof value.message === "string" ? value.message : `HTTP ${response.status}`;
        throw new Error(`Safari WebDriver request failed: ${boundText(message, 500)}`);
      }
      return parsed as WebDriverEnvelope;
    } finally {
      clearTimeout(timeout);
      context.signal?.removeEventListener("abort", onAbort);
    }
  }

  private sessionId: string | null = null;
}

class SafariBidiClient {
  private constructor(
    private readonly socket: WebSocket,
    private readonly onEvent: (event: BidiEvent) => void,
  ) {
    this.socket.onmessage = (event) => { void this.handleMessage(event); };
    this.socket.onerror = () => this.rejectPending(new Error("Safari WebDriver BiDi socket error."));
    this.socket.onclose = () => this.rejectPending(new Error("Safari WebDriver BiDi socket closed."));
  }

  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private nextId = 1;

  static async connect(url: string, onEvent: (event: BidiEvent) => void): Promise<SafariBidiClient> {
    const WebSocketConstructor = getWebSocketConstructor();
    if (!WebSocketConstructor) {
      throw new Error("Safari WebDriver BiDi requires Node WebSocket support; use Node 20.10+ with --experimental-websocket or Node 21+.");
    }
    const socket = new WebSocketConstructor(url);
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Safari WebDriver BiDi connection timed out.")), MAX_REQUEST_MS);
        socket.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
        socket.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Safari WebDriver BiDi connection failed."));
        };
      });
    } catch (error) {
      if (socket.readyState === 1 || socket.readyState === 0) socket.close();
      throw error;
    }
    const client = new SafariBidiClient(socket, onEvent);
    try {
      await client.command("session.subscribe", {
        events: [
          "log.entryAdded",
          "network.beforeRequestSent",
          "network.responseCompleted",
          "network.fetchError",
        ],
      });
    } catch (error) {
      await client.close();
      throw error;
    }
    return client;
  }

  async close(): Promise<void> {
    this.rejectPending(new Error("Safari WebDriver BiDi client closed."));
    if (this.socket.readyState === 1 || this.socket.readyState === 0) {
      this.socket.close();
    }
  }

  private async command(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const result = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Safari WebDriver BiDi command timed out: ${method}`));
      }, MAX_REQUEST_MS);
      this.pending.set(id, { resolve, reject, timeout });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    const raw = await boundedBidiMessageText(event.data);
    if (raw === null) {
      this.rejectPending(new Error("Safari WebDriver BiDi message exceeded the bounded input limit."));
      if (this.socket.readyState === 1 || this.socket.readyState === 0) this.socket.close();
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isRecord(message)) return;
    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.type === "error" || typeof message.error === "string") {
        const detail = typeof message.message === "string" ? message.message : String(message.error ?? "unknown error");
        pending.reject(new Error(`Safari WebDriver BiDi request failed: ${boundText(detail, 500)}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (typeof message.method === "string") {
      this.onEvent({ method: message.method, params: isRecord(message.params) ? message.params : {} });
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function boundedTimeout(timeoutMs: number | undefined): number {
  return Math.min(Math.max(timeoutMs ?? 1_000, 0), 30_000);
}


function assertAllowedUrl(raw: string, allowRemote: boolean): void {
  if (raw.length > 2_048) throw new WebDebugError("URL_LIMIT_EXCEEDED", "Browser URLs are limited to 2,048 characters.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebDebugError("URL_INVALID", `Invalid browser URL: ${raw}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new WebDebugError("URL_PROTOCOL_BLOCKED", "Only http and https browser targets are supported.");
  }
  if (!allowRemote && !isLoopback(url.hostname)) {
    throw new WebDebugError("REMOTE_TARGET_BLOCKED", "Remote browser targets are blocked by default; set allowRemote explicitly.");
  }
}

function assertAllowedEndpoint(raw: string, allowRemote: boolean): void {
  if (raw.length > 2_048) throw new WebDebugError("WEBDRIVER_ENDPOINT_LIMIT", "Safari WebDriver endpoints are limited to 2,048 characters.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebDebugError("WEBDRIVER_ENDPOINT_INVALID", `Invalid Safari WebDriver endpoint: ${raw}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new WebDebugError("WEBDRIVER_ENDPOINT_PROTOCOL_BLOCKED", "Safari WebDriver endpoints must use http or https.");
  }
  if (!allowRemote && !isLoopback(url.hostname)) {
    throw new WebDebugError("REMOTE_WEBDRIVER_BLOCKED", "Remote Safari WebDriver endpoints are blocked by default; set allowRemote explicitly.");
  }
}

function assertAllowedBidiEndpoint(raw: string, allowRemote: boolean): void {
  if (raw.length > 2_048) throw new WebDebugError("BIDI_ENDPOINT_LIMIT", "Safari BiDi endpoints are limited to 2,048 characters.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebDebugError("BIDI_ENDPOINT_INVALID", "Safari WebDriver returned an invalid BiDi WebSocket endpoint.");
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new WebDebugError("BIDI_ENDPOINT_PROTOCOL_BLOCKED", "Safari BiDi endpoints must use ws or wss.");
  }
  if (!allowRemote && !isLoopback(url.hostname)) {
    throw new WebDebugError("REMOTE_BIDI_BLOCKED", "Remote Safari BiDi endpoints are blocked by default; set allowRemote explicitly.");
  }
}

async function boundedBidiMessageText(data: unknown): Promise<string | null> {
  if (typeof data === "string") return Buffer.byteLength(data) <= MAX_BIDI_MESSAGE_BYTES ? data : null;
  if (data instanceof ArrayBuffer) return data.byteLength <= MAX_BIDI_MESSAGE_BYTES ? new TextDecoder().decode(data) : null;
  if (ArrayBuffer.isView(data)) {
    return data.byteLength <= MAX_BIDI_MESSAGE_BYTES
      ? new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
      : null;
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    if (data.size > MAX_BIDI_MESSAGE_BYTES) return null;
    const text = await data.text();
    return Buffer.byteLength(text) <= MAX_BIDI_MESSAGE_BYTES ? text : null;
  }
  return null;
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDomSnapshot(value: unknown): value is DomSnapshot {
  return isRecord(value) && typeof value.bodyText === "string" && Array.isArray(value.elements);
}

function getWebSocketConstructor(): typeof WebSocket | null {
  const candidate = (globalThis as { WebSocket?: unknown }).WebSocket;
  return typeof candidate === "function" ? candidate as typeof WebSocket : null;
}

function mapBidiLogLevel(level: unknown): ConsoleEntry["level"] {
  switch (level) {
    case "error":
      return "error";
    case "warn":
      return "warning";
    case "debug":
      return "debug";
    case "info":
      return "info";
    default:
      return "log";
  }
}

function webdriverKey(key: Extract<BrowserAction, { kind: "press" }>["key"]): string {
  const keys: Record<Extract<BrowserAction, { kind: "press" }>["key"], string> = {
    Enter: "\uE007",
    Escape: "\uE00C",
    Tab: "\uE004",
    ArrowUp: "\uE013",
    ArrowDown: "\uE015",
    ArrowLeft: "\uE012",
    ArrowRight: "\uE014",
    Backspace: "\uE003",
    Delete: "\uE017",
    Space: "\uE00D",
  };
  return keys[key];
}

function assertContext(context: OperationContext): void {
  if (context.signal?.aborted) throw new WebDebugError("REQUEST_CANCELLED", "The request was cancelled.");
  if (context.deadline !== undefined && context.deadline <= performance.now()) throw new WebDebugError("VERIFICATION_DEADLINE_EXCEEDED", "The bounded operation deadline was exhausted.");
}
