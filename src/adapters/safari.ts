import { mkdir, lstat, rm } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { readLocatorLayout } from "./locator-layout.js";

import type {
  ActionResult,
  DirectBrowserAction,
  ReplayableBrowserAction,
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
  InteractiveElements,
} from "../domain/types.js";
import { CAPTURE_SURFACES, MAX_LOCATOR_CHARS, MAX_PROPERTIES_PER_PROBE, MAX_RESULT_BYTES } from "../domain/types.js";
import { WebDebugError } from "../core/errors.js";
import { boundItems, boundText, redactValue, safeUrl } from "../core/redaction.js";
import { SafariMcpClient, type SafariClient } from "./safari-client.js";
import { assertTopLevelOrigin, navigationOriginError, originOf } from "../core/origin-policy.js";
import type {
  BrowserAdapter,
  BrowserStartOptions,
  EvaluationResult,
  SnapshotOptions,
} from "./browser.js";
import { safariRuntimeCapabilities } from "./runtime-capabilities.js";
import {
  normalizeInteractiveElement,
  parseRawInteractiveElements,
  safariInteractiveLocator,
  interactiveElementsScript,
} from "./interactive-elements.js";

/** Safari 27 automation and Inspector evidence through its official local MCP server. */
export class SafariAdapter implements BrowserAdapter {
  private client: SafariClient | null = null;
  private sessionId: string | null = null;
  private allowRemote = false;
  private baseOrigin: string | null = null;
  private performanceNetworkFallbackUsed = false;
  private readonly consoleEntries: ConsoleEntry[] = [];
  private readonly networkEntries = new Map<string, NetworkEntry>();
  private headlessRequested = true;
  private lastKnownTitle = "";
  private lastKnownDom: DomSnapshot = { bodyText: "", elements: [] };
  private browserVersionValue: string | null = null;
  private consoleDeliveryObserved = false;
  private consoleReadAvailable = false;
  private consoleTruncated = false;

  constructor(private readonly createClient: () => SafariClient = () => new SafariMcpClient()) {}

  async start(options: BrowserStartOptions, context: OperationContext = {}): Promise<BrowserTarget> {
    assertContext(context);
    if (options.tls === "allow-insecure-loopback") throw new WebDebugError("SAFARI_TLS_UNAVAILABLE", "Safari MCP does not support the guarded loopback TLS bypass.");
    if (options.authState || options.authFixture === "seeded-disposable") throw new WebDebugError("SAFARI_AUTH_UNAVAILABLE", "Safari MCP does not support disposable auth-state seeding.");
    if (options.cdpEndpoint) {
      throw new WebDebugError("SAFARI_CDP_UNSUPPORTED", "Safari uses its local MCP driver; CDP endpoints are unsupported.");
    }
    this.allowRemote = options.allowRemote ?? false;
    this.headlessRequested = options.headless ?? true;
    assertAllowedUrl(options.url, this.allowRemote);
    this.baseOrigin = originOf(options.url);

    this.client = this.createClient();
    try {
      await this.client.connect(context);
      const existing = await this.tabs(context);
      if (existing.length) throw new WebDebugError("SAFARI_SESSION_IN_USE", "The Safari automation connection already contains tabs; Web Debug requires its own session.");
      const created = await this.client.call<{ handle?: string }>("create_tab", {}, context);
      if (typeof created.handle !== "string" || !created.handle) throw new WebDebugError("SAFARI_SESSION_CREATE_FAILED", "Safari MCP returned no owned tab handle.");
      this.sessionId = created.handle;
      await this.client.call("switch_tab", { handle: this.sessionId }, context);
      if (options.viewport) await this.client.call("set_viewport_size", { ...options.viewport }, context);
      // Enable Inspector before navigation so load-time console/network evidence is retained.
      await this.readConsole(context);
      await this.readNetwork(context);
      await this.navigate(options.url, context);
      await this.enforceOwnedTopLevelState(context);
      this.lastKnownTitle = await this.readTitle(context);
      this.lastKnownDom = await this.readDom(context);
      const userAgent = await this.executeSync<string>("return navigator.userAgent;", [], context);
      this.browserVersionValue = typeof userAgent === "string" ? /Version\/([\d.]+)/.exec(userAgent)?.[1] ?? null : null;
      return await this.target(context);
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.sessionId && this.client?.isConnected()) await this.client.call("close_tab", { handle: this.sessionId }).catch(() => undefined);
    await this.client?.close();
    this.client = null;
    this.sessionId = null;
    this.baseOrigin = null;
    this.performanceNetworkFallbackUsed = false;
    this.browserVersionValue = null;
    this.consoleDeliveryObserved = false;
    this.consoleReadAvailable = false;
    this.consoleTruncated = false;
    this.consoleEntries.length = 0;
    this.networkEntries.clear();
  }

  async resetObservers(context: OperationContext = {}): Promise<void> {
    await this.enforceOwnedTopLevelState(context);
    await this.requireClient().call("browser_console_messages", { tab_handle: this.sessionId, limit: 500, clear: true }, context);
    await this.requireClient().call("list_network_requests", { tab_handle: this.sessionId, clear: true }, context);
    await this.executeSync("performance.clearResourceTimings(); return true;", [], context);
    this.consoleEntries.length = 0;
    this.networkEntries.clear();
    this.performanceNetworkFallbackUsed = false;
    this.consoleTruncated = false;
  }

  targetIdentity(): string | null { return this.sessionId; }
  browserVersion(): string | null { return this.browserVersionValue; }
  runtimeCapabilities() { return safariRuntimeCapabilities(this.client?.isConnected() === true && this.consoleReadAvailable, this.consoleDeliveryObserved); }

  async act(action: DirectBrowserAction, context: OperationContext = {}): Promise<ActionResult> {
    assertContext(context);
    this.requireClient();
    await this.enforceOwnedTopLevelState(context);
    switch (action.kind) {
      case "webmcp":
        throw new WebDebugError("WEBMCP_UNAVAILABLE", "WebMCP is unavailable in the Safari MCP transport.");
      case "navigate":
        assertAllowedUrl(action.url, this.allowRemote);
        this.assertSameOrigin(action.url);
        await this.navigate(action.url, context);
        break;
      case "click":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari MCP supports CSS locators only.");
        await this.click(action.locator.value, context);
        break;
      case "fill":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari MCP supports CSS locators only.");
        await this.fill(action.locator.value, action.value, context);
        break;
      case "press":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari MCP supports CSS locators only.");
        await this.press(action.locator.value, action.key, context);
        break;
      case "select":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari MCP supports CSS locators only.");
        await this.select(action.locator.value, action.value, context);
        break;
      case "check":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari MCP supports CSS locators only.");
        await this.setChecked(action.locator.value, action.checked, context);
        break;
      case "hover":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari MCP supports CSS locators only.");
        await this.hover(action.locator.value, context);
        break;
      case "scroll":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari MCP supports CSS locators only.");
        await this.scroll(action.locator.value, context);
        break;
      case "wait":
        if (action.locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari MCP supports CSS locators only.");
        await this.waitForProbe(action, context);
        break;
      case "reload":
        await this.navigate(await this.currentUrl(context), context);
        break;
    }
    const url = await this.enforceOwnedTopLevelState(context);
    const title = await this.readTitle(context);
    return { schemaVersion: 1, kind: action.kind, url: safeUrl(url), title };
  }

  async layout(locator: BrowserLocator, context: OperationContext = {}) {
    if (locator.kind !== "css" || !locator.value || locator.value.length > MAX_LOCATOR_CHARS) throw new WebDebugError("LAYOUT_UNAVAILABLE", "Safari layout requires one bounded CSS locator.");
    await this.enforceOwnedTopLevelState(context);
    return this.executeSync<import("../domain/types.js").LocatorLayout>(`return (${readLocatorLayout.toString()})(Array.from(document.querySelectorAll(arguments[0])));`, [locator.value], context);
  }

  async probe(locator: BrowserLocator, properties: LocatorProperty[], context: OperationContext = {}): Promise<LocatorProbeResult> {
    assertContext(context);
    const unique = [...new Set(properties)];
    if (unique.length === 0) throw new WebDebugError("PROBE_PROPERTIES_REQUIRED", "A locator probe must request at least one property.");
    if (unique.length > MAX_PROPERTIES_PER_PROBE) throw new WebDebugError("PROBE_PROPERTIES_LIMIT", `A locator probe may request at most ${MAX_PROPERTIES_PER_PROBE} properties.`);
    if (locator.kind !== "css") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "Safari MCP supports CSS locators only; computed semantic locators are unavailable.");
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
    const result: LocatorProbeResult = { locator: { ...locator }, properties: unique, observedAt: new Date().toISOString(), provenance: "safari-mcp", warnings: [] };
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

  private async waitForProbe(action: Extract<ReplayableBrowserAction, { kind: "wait" }>, context: OperationContext): Promise<void> {
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
      "Safari MCP does not expose Chromium CDP JavaScript debugger domains; breakpoint and step controls remain unavailable.",
      "Safari MCP computed accessibility diagnostics and semantic locator suggestions are unavailable; use exact CSS locators and live CSS probes.",
    ];
    try { await this.readConsole(context); }
    catch (error) {
      this.consoleReadAvailable = false;
      warnings.push(`Safari console unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
    }
    if (!this.consoleDeliveryObserved) warnings.push("Safari Inspector console delivery has not been observed; an empty buffer cannot establish console availability.");
    if (this.headlessRequested) warnings.push("Safari MCP does not support headless mode; the session uses a visible Safari window.");
    warnings.push("Safari MCP uses a visible Safari browser profile; profile isolation is not guaranteed.");

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
        await this.requireClient().call("screenshot", { savePath: screenshotPath }, context);
        const info = await lstat(screenshotPath);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) throw new Error("Screenshot exceeded the owned file boundary.");
      } catch (error) {
        if (screenshotPath) await rm(screenshotPath, { force: true }).catch(() => undefined);
        screenshotPath = null;
        warnings.push("Safari screenshot unavailable: native capture failed without exposing the local artifact path.");
      }
    }

    let networkAvailable = false;
    if (!options.checksOnly) {
      try { await this.readNetwork(context); networkAvailable = true; }
      catch (error) { warnings.push(`Safari Inspector network unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`); }
    }
    if (!options.checksOnly && (this.performanceNetworkFallbackUsed || this.networkEntries.size === 0)) {
      networkAvailable = false;
      try {
        const performanceEntries = await this.readPerformanceNetwork(context);
        for (const entry of performanceEntries) this.networkEntries.set(entry.requestId, entry);
        this.performanceNetworkFallbackUsed = true;
        networkAvailable = true;
      } catch (error) {
        warnings.push(`Safari network evidence unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
      }
    }
    if (this.performanceNetworkFallbackUsed) {
      warnings.push("Safari Inspector returned no network events; network evidence uses bounded Performance Resource Timing metadata.");
    }

    const wantsInteractiveElements = !options.checksOnly && (options.surfaces ?? CAPTURE_SURFACES).includes("interactiveElements");
    const interactiveElements = wantsInteractiveElements
      ? await this.collectInteractiveElements(context, warnings)
      : null;

    const consoleBound = boundItems(this.consoleEntries, 100);
    const networkBound = options.checksOnly ? { items: [] as NetworkEntry[], truncated: false } : boundItems([...this.networkEntries.values()], 100);
    if (consoleBound.truncated) warnings.push("Safari console entries were truncated to 100 items.");
    if (networkBound.truncated) warnings.push("Safari network entries were truncated to 100 items.");

    const snapshot: BrowserSnapshot = {
      url: safeUrl(url),
      title,
      viewport: await this.viewport(context),
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
      interactiveElements,
      webmcp: null,
      warnings,
      observations: {
        url: { state: urlAvailable ? "pass" : "unavailable", freshness: urlAvailable ? "fresh" : "unknown", provenance: urlAvailable ? "browser" : "cached", observed: safeUrl(url) },
        dom: { state: domAvailable ? "pass" : "unavailable", freshness: domAvailable ? "fresh" : "stale", provenance: domAvailable ? "browser" : "cached" },
        console: this.client?.isConnected() && this.consoleReadAvailable && this.consoleDeliveryObserved && !this.consoleTruncated && !consoleBound.truncated
          ? { state: "pass", freshness: "fresh", provenance: "safari-mcp" }
          : { state: "unavailable", freshness: "unknown", provenance: "unknown", warning: "Safari Inspector console delivery is unverified, incomplete, or disconnected; an empty buffer cannot prove no console errors." },
        network: networkAvailable
          ? { state: "pass", freshness: "fresh", provenance: this.performanceNetworkFallbackUsed ? "performance-resource-timing" : "safari-mcp" }
          : networkBound.items.length > 0
            ? { state: "pass", freshness: "stale", provenance: "cached", warning: "Safari network observation could not be refreshed." }
            : { state: "unavailable", freshness: "unknown", provenance: "unknown", warning: "Safari network collection is unavailable." },
      },
    };
    if (options.checksOnly && !options.retainNetwork) this.networkEntries.clear();
    return snapshot;
  }

  private async collectInteractiveElements(context: OperationContext, warnings: string[]): Promise<InteractiveElements | null> {
    try {
      const raw = parseRawInteractiveElements(await this.executeSync<unknown>(interactiveElementsScript(), [], context));
      if (!raw) {
        warnings.push("Interactive element map unavailable: optional DOM discovery failed.");
        return null;
      }
      const candidates = raw.elements.flatMap((candidate) => {
        const locator = safariInteractiveLocator(candidate);
        return locator?.kind === "css" ? [{ candidate, locator }] : [];
      });
      const selectors = candidates.map(({ locator }) => locator.value);
      const values = selectors.length === 0
        ? []
        : await this.executeSync<Array<{ count?: unknown; visible?: unknown; enabled?: unknown; checked?: unknown }>>(
          `return arguments[0].map((css) => {
            const elements = Array.from(document.querySelectorAll(css));
            const element = elements[0];
            const style = element ? getComputedStyle(element) : null;
            const disabled = Boolean(element && ((typeof element.disabled === "boolean" && element.disabled) || element.getAttribute("aria-disabled") === "true"));
            return {
              count: elements.length,
              visible: Boolean(element && style && style.visibility !== "hidden" && style.display !== "none" && element.getClientRects().length),
              enabled: Boolean(element && !disabled),
              checked: Boolean(element && element.checked === true),
            };
          });`,
          [selectors],
          context,
        );
      const elements = candidates.flatMap(({ candidate, locator }, index) => {
        const value = values[index];
        if (!value) return [];
        return [normalizeInteractiveElement(candidate, locator, {
          count: typeof value.count === "number" ? value.count : 0,
          visible: value.visible === true,
          enabled: value.enabled === true,
          checked: value.checked === true,
        })];
      });
      const detailWarnings = ["Safari interactive element locators are CSS-only and derived from stable id/data-testid attributes."];
      const omitted = raw.elements.length - candidates.length;
      if (omitted > 0) detailWarnings.push(`${omitted} interactive candidates were omitted because Safari could not derive a bounded CSS locator.`);
      if (raw.truncated) detailWarnings.push("Interactive element candidates were truncated to the bounded capture limit.");
      return { elements, truncated: raw.truncated, warnings: detailWarnings };
    } catch (error) {
      warnings.push(`Interactive element map unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
      return null;
    }
  }

  async setBreakpoint(_input: { sourceUrl: string; line: number; column?: number }, _context: OperationContext = {}): Promise<DebuggerBreakpoint> {
    throw new WebDebugError(
      "DEBUGGER_UNAVAILABLE",
      "Safari MCP does not expose the JavaScript debugger breakpoint domain.",
    );
  }

  async control(_action: "resume" | "stepOver" | "stepInto" | "stepOut", _context: OperationContext = {}): Promise<DebuggerSnapshot> {
    throw new WebDebugError(
      "DEBUGGER_UNAVAILABLE",
      "Safari MCP does not expose Chromium-style pause and step controls.",
    );
  }

  async evaluate(expression: string, allowSideEffects: boolean, context: OperationContext = {}): Promise<EvaluationResult> {
    assertContext(context);
    if (!expression.trim()) throw new WebDebugError("EXPRESSION_EMPTY", "Evaluation expression cannot be empty.");
    if (!allowSideEffects) {
      throw new WebDebugError(
        "EVALUATION_SIDE_EFFECTS_BLOCKED",
        "Safari MCP cannot prove that an expression is side-effect free; set allowSideEffects=true explicitly.",
      );
    }
    await this.enforceOwnedTopLevelState(context);
    const result = await this.executeAsync(expression, context);
    await this.enforceOwnedTopLevelState(context);
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

  private async readConsole(context: OperationContext): Promise<void> {
    const entries = await this.requireClient().call<unknown>("browser_console_messages", { tab_handle: this.sessionId, limit: 200, clear: true }, context);
    if (!Array.isArray(entries)) throw new WebDebugError("SAFARI_CONSOLE_INVALID", "Safari returned an invalid console buffer.");
    if (entries.some(entry => !isRecord(entry) || typeof entry.text !== "string" || entry.browsingContextHandle !== this.sessionId)) throw new WebDebugError("SAFARI_CONSOLE_INVALID", "Safari console records did not match the owned tab contract.");
    this.consoleReadAvailable = true;
    if (entries.length >= 200) this.consoleTruncated = true;
    for (const entry of entries.slice(-200)) {
      this.consoleDeliveryObserved = true;
      const frame = entry.stackTrace?.callFrames?.[0];
      this.consoleEntries.push({
        level: mapLogLevel(entry.level), text: boundText(entry.text, 2_000),
        ...(typeof frame?.url === "string" && frame.url ? { url: safeUrl(frame.url) } : {}),
        // Inspector locations are already one-based (unlike BiDi stack frames).
        ...(Number.isInteger(frame?.lineNumber) && frame.lineNumber > 0 ? { line: frame.lineNumber } : {}),
        ...(Number.isInteger(frame?.columnNumber) && frame.columnNumber > 0 ? { column: frame.columnNumber } : {}),
      });
    }
    this.trimConsole();
  }

  private async readNetwork(context: OperationContext): Promise<void> {
    const value = await this.requireClient().call<unknown>("list_network_requests", { tab_handle: this.sessionId, clear: true }, context);
    if (!isRecord(value) || !Array.isArray(value.requests)) throw new WebDebugError("SAFARI_NETWORK_INVALID", "Safari returned an invalid network buffer.");
    for (const entry of value.requests.slice(-200)) {
      if (!isRecord(entry) || typeof entry.url !== "string" || typeof entry.requestId !== "string") continue;
      const status = typeof entry.status === "number" ? entry.status : null;
      this.networkEntries.set(entry.requestId, {
        requestId: entry.requestId, url: safeUrl(entry.url), method: typeof entry.method === "string" ? boundText(entry.method, 20) : "GET",
        resourceType: typeof entry.type === "string" ? boundText(entry.type, 100) : "other", status,
        ok: status === null ? null : status >= 200 && status < 400,
      });
      this.trimNetwork();
    }
  }

  private trimConsole(): void {
    if (this.consoleEntries.length > 200) {
      this.consoleTruncated = true;
      this.consoleEntries.splice(0, this.consoleEntries.length - 200);
    }
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

  private async navigate(url: string, context: OperationContext = {}): Promise<void> {
    await this.requireClient().call("navigate_to_url", { url, tab_uuid: this.sessionId }, context);
  }

  private async pointerAction(css: string, type: "click" | "hover", context: OperationContext): Promise<void> {
    const point = await this.executeSync<unknown>(
      `const element = document.querySelector(arguments[0]);
       if (!element) return null;
       element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
       const rect = element.getBoundingClientRect();
       const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
       const right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
       if (right <= left || bottom <= top || element.disabled) return null;
       const x = (left + right) / 2, y = (top + bottom) / 2;
       const hit = document.elementFromPoint(x, y);
       if (!hit || !(hit === element || element.contains(hit))) return null;
       return { x, y };`, [css], context);
    if (!isRecord(point) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new WebDebugError("ELEMENT_NOT_INTERACTABLE", "Safari could not hit-test the exact CSS target.");
    const result = await this.requireClient().call<{ successful?: number }>("page_interactions", { interactions: [{ type, point, purpose: `Web Debug ${type} on the exact CSS target` }] }, context);
    if (result.successful !== 1) throw new WebDebugError("SAFARI_ACTION_FAILED", "Safari did not complete the requested pointer action.");
  }

  private async click(css: string, context: OperationContext = {}): Promise<void> {
    await this.pointerAction(css, "click", context);
  }

  private async fill(css: string, value: string, context: OperationContext = {}): Promise<void> {
    await this.click(css, context);
    await this.enforceOwnedTopLevelState(context);
    const node = await this.nativeFocusedNode(css, context);
    const result = await this.requireClient().call<{ successful?: number }>("page_interactions", { interactions: [{ type: "type", node, value, replaceAll: true, purpose: "Fill the focused exact CSS field" }] }, context);
    if (result.successful !== 1) throw new WebDebugError("SAFARI_ACTION_FAILED", "Safari did not complete the requested fill.");
  }

  private async press(css: string, key: Extract<ReplayableBrowserAction, { kind: "press" }>["key"], context: OperationContext = {}): Promise<void> {
    await this.executeSync("document.querySelector(arguments[0])?.focus({ preventScroll: true }); return true;", [css], context);
    await this.enforceOwnedTopLevelState(context);
    const node = await this.nativeFocusedNode(css, context);
    const result = await this.requireClient().call<{ successful?: number }>("page_interactions", { interactions: [{ type: "keyPress", node, value: key === "Space" ? " " : key, purpose: "Press the requested key on the CSS target" }] }, context);
    if (result.successful !== 1) throw new WebDebugError("SAFARI_ACTION_FAILED", "Safari did not complete the requested key press.");
  }

  private async nativeFocusedNode(css: string, context: OperationContext): Promise<string> {
    // Safari's structured focus metadata binds a native UID to the exact active CSS target.
    const response = await this.requireClient().call<{ content?: string }>("get_page_content", { format: "json", nodeIds: "interactive", region: "viewport", maxWordsPerParagraph: 1 }, context);
    let tree: unknown;
    try { tree = JSON.parse(response.content ?? ""); }
    catch { throw new WebDebugError("SAFARI_LOCATOR_UNAVAILABLE", "Safari did not return an inline structured target tree."); }
    const pending = [tree], focused: string[] = [];
    let visited = 0;
    while (pending.length) {
      if (++visited > 2_000) throw new WebDebugError("SAFARI_LOCATOR_LIMIT", "Safari's native target tree exceeded the bounded node limit.");
      const node = pending.pop();
      if (!isRecord(node)) continue;
      if (node.focused === true && typeof node.uid === "string" && /^\d+$/.test(node.uid)) focused.push(node.uid);
      if (Array.isArray(node.children)) pending.push(...node.children.slice(0, 2_001));
    }
    const matches = await this.executeSync<boolean>("return document.activeElement === document.querySelector(arguments[0]);", [css], context);
    if (!matches || focused.length !== 1) throw new WebDebugError("SAFARI_FOCUS_MISMATCH", "Safari could not bind one native focused node to the exact CSS target.");
    return focused[0]!;
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
    await this.pointerAction(css, "hover", context);
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
    if (!isDomSnapshot(value)) throw new WebDebugError("SAFARI_DOM_INVALID", "Safari returned an invalid DOM snapshot.");
    return value;
  }

  private async readTitle(context: OperationContext = {}): Promise<string> {
    const info = await this.requireClient().call<{ title?: string }>("page_info", {}, context);
    this.lastKnownTitle = boundText(info.title ?? "", 300);
    return this.lastKnownTitle;
  }

  private async currentUrl(context: OperationContext = {}): Promise<string> {
    const info = await this.requireClient().call<{ url?: string }>("page_info", {}, context);
    if (typeof info.url !== "string") throw navigationOriginError("Safari did not return the current URL.");
    return info.url;
  }

  private async viewport(context: OperationContext = {}): Promise<{ width: number; height: number } | null> {
    return this.executeSync("return { width: innerWidth, height: innerHeight };", [], context);
  }

  private async executeSync<T>(body: string, args: unknown[], context: OperationContext = {}): Promise<T> {
    return this.requireClient().call<T>("evaluate_javascript", { expression: `return (function() { ${body} }).apply(null, ${JSON.stringify(args)});` }, context);
  }

  private async executeAsync(expression: string, context: OperationContext = {}): Promise<unknown> {
    return this.requireClient().call("evaluate_javascript", { expression: `return Promise.resolve().then(() => (${expression})).then(value => ({ ok: true, value: value === undefined ? null : value }), error => ({ ok: false, error: String(error) }));` }, context);
  }

  private requireClient(): SafariClient {
    if (!this.client?.isConnected()) throw new WebDebugError("SESSION_NOT_READY", "The Safari MCP session is not ready.");
    return this.client;
  }

  private async tabs(context: OperationContext): Promise<Array<{ handle: string; url?: string }>> {
    const tabs = await this.requireClient().call<unknown>("list_tabs", {}, context);
    if (!Array.isArray(tabs) || tabs.some(tab => !isRecord(tab) || typeof tab.handle !== "string")) throw navigationOriginError("Safari did not return the owned tab inventory.");
    return tabs;
  }

  private assertSameOrigin(url: string): void {
    if (this.baseOrigin) assertTopLevelOrigin(url, this.baseOrigin);
  }

  private async enforceOwnedTopLevelState(context: OperationContext = {}): Promise<string> {
    try {
      const handles = (await this.tabs(context)).map(tab => tab.handle);
      const selected = this.sessionId;
      if (!selected || !Array.isArray(handles) || !handles.includes(selected)) {
        throw navigationOriginError("The selected Safari window is no longer available.");
      }
      const secondaryHandles = handles.filter((handle) => handle !== selected);
      if (secondaryHandles.length > 0) {
        for (const handle of secondaryHandles.slice(0, 8)) {
          await this.requireClient().call("close_tab", { handle }, context).catch(() => undefined);
        }
        throw navigationOriginError("Secondary Safari windows are outside the selected single-window session boundary.");
      }
      await this.requireClient().call("switch_tab", { handle: selected }, context);
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
      schemaVersion: 1,
      browser: "safari",
      remote: !isLoopback(new URL(this.baseOrigin!).hostname),
      url: safeUrl(await this.currentUrl(context)),
      title: await this.readTitle(context),
      viewport: await this.viewport(context),
      isolated: false,
      targetId: this.sessionId ?? undefined,
      mode: "mcp",
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

function mapLogLevel(level: unknown): ConsoleEntry["level"] {
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

function assertContext(context: OperationContext): void {
  if (context.signal?.aborted) throw new WebDebugError("REQUEST_CANCELLED", "The request was cancelled.");
  if (context.deadline !== undefined && context.deadline <= performance.now()) throw new WebDebugError("VERIFICATION_DEADLINE_EXCEEDED", "The bounded operation deadline was exhausted.");
}
