import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright-core";
import type {
  Browser,
  BrowserContext,
  CDPSession,
  ConsoleMessage,
  Page,
  Request,
  Response,
} from "playwright-core";

import type {
  ActionResult,
  BrowserAction,
  BrowserSnapshot,
  BrowserTarget,
  ConsoleEntry,
  DebuggerBreakpoint,
  DebuggerCallFrame,
  DebuggerSnapshot,
  NetworkEntry,
  ReactSnapshot,
} from "../domain/types.js";
import { WebDebugError } from "../core/errors.js";
import { boundItems, boundText, redactValue, safeUrl } from "../core/redaction.js";
import { ReactAdapter } from "./react.js";
import { REACT_DEBUG_BRIDGE_SCRIPT } from "./react-bridge.js";
import type {
  BrowserAdapter,
  BrowserStartOptions,
  EvaluationResult,
  SnapshotOptions,
} from "./browser.js";

interface RemoteObject {
  type?: string;
  value?: unknown;
  unserializableValue?: string;
  description?: string;
  objectId?: string;
}

interface PausedScope {
  name?: string;
  object?: RemoteObject;
}

interface PausedCallFrame {
  callFrameId?: string;
  functionName?: string;
  url?: string;
  location?: { scriptId?: string; lineNumber?: number; columnNumber?: number };
  scopeChain?: PausedScope[];
}

interface PausedEvent {
  reason?: string;
  hitBreakpoints?: string[];
  callFrames?: PausedCallFrame[];
}

interface ScriptParsedEvent {
  scriptId?: string;
  url?: string;
}

interface PropertyDescriptor {
  name?: string;
  value?: RemoteObject;
}

interface PropertiesResult {
  result?: PropertyDescriptor[];
}

export class ChromiumAdapter implements BrowserAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cdp: CDPSession | null = null;
  private externalBrowser = false;
  private remoteTarget = false;
  private allowRemote = false;
  private baseOrigin: string | null = null;
  private requestCounter = 0;
  private readonly requestIds = new WeakMap<Request, string>();
  private readonly consoleEntries: ConsoleEntry[] = [];
  private readonly networkEntries = new Map<string, NetworkEntry>();
  private readonly breakpoints: DebuggerBreakpoint[] = [];
  private readonly pauseWaiters = new Set<() => void>();
  private readonly scriptUrls = new Map<string, string>();
  private readonly reactAdapter = new ReactAdapter();
  private lastKnownTitle = "";
  private lastKnownDom: BrowserSnapshot["dom"] = { bodyText: "", elements: [] };
  private lastKnownReact: ReactSnapshot | null = null;
  private pausedEvent: PausedEvent | null = null;

  async start(options: BrowserStartOptions): Promise<BrowserTarget> {
    this.allowRemote = options.allowRemote ?? false;
    assertAllowedUrl(options.url, this.allowRemote);

    if (options.cdpEndpoint) {
      assertAllowedCdpEndpoint(options.cdpEndpoint, this.allowRemote);
      this.remoteTarget = !isLoopback(new URL(options.cdpEndpoint).hostname);
      this.browser = await chromium.connectOverCDP(options.cdpEndpoint);
      this.externalBrowser = true;
      const contexts = this.browser.contexts();
      this.context = contexts[0] ?? (await this.browser.newContext());
      this.page = this.context.pages()[0] ?? (await this.context.newPage());
    } else {
      this.remoteTarget = false;
      const executablePath = options.executablePath ?? process.env.WEB_DEBUG_CHROME_EXECUTABLE_PATH;
      if (!executablePath) {
        throw new WebDebugError(
          "BROWSER_EXECUTABLE_REQUIRED",
          "No Chromium executable was configured. Set WEB_DEBUG_CHROME_EXECUTABLE_PATH or pass executablePath; attach mode uses cdpEndpoint.",
        );
      }
      this.browser = await chromium.launch({
        executablePath,
        headless: options.headless ?? true,
      });
      this.context = await this.browser.newContext({ viewport: { width: 1440, height: 900 } });
      this.page = await this.context.newPage();
    }

    await this.context.addInitScript({ content: REACT_DEBUG_BRIDGE_SCRIPT });
    this.installObservers(this.page);
    this.cdp = await this.context.newCDPSession(this.page);
    this.cdp.on("Debugger.paused", (event) => {
      this.pausedEvent = event as PausedEvent;
      for (const resolvePause of this.pauseWaiters) resolvePause();
      this.pauseWaiters.clear();
    });
    this.cdp.on("Debugger.scriptParsed", (event) => {
      const parsed = event as ScriptParsedEvent;
      if (parsed.scriptId && parsed.url) this.scriptUrls.set(parsed.scriptId, parsed.url);
    });
    this.cdp.on("Debugger.resumed", () => {
      this.pausedEvent = null;
    });
    await this.cdp.send("Runtime.enable");
    await this.cdp.send("Debugger.enable");

    await this.page.goto(options.url, { waitUntil: "domcontentloaded" });
    this.baseOrigin = new URL(this.page.url()).origin;
    this.lastKnownTitle = boundText(await this.page.title(), 300);
    this.lastKnownDom = await this.readDom(this.page).catch(() => this.lastKnownDom);
    this.lastKnownReact = await this.reactAdapter.snapshot(this.page).catch(() => null);

    return this.target();
  }

  async close(): Promise<void> {
    try {
      await this.cdp?.detach();
    } catch {
      // The browser may already have closed; cleanup remains best effort.
    }
    if (!this.externalBrowser) {
      await this.context?.close().catch(() => undefined);
      await this.browser?.close().catch(() => undefined);
    }
    this.cdp = null;
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  async act(action: BrowserAction): Promise<ActionResult> {
    const page = this.requirePage();
    if (this.pausedEvent) {
      throw new WebDebugError("DEBUGGER_PAUSED", "Browser actions require a resumed JavaScript target.");
    }
    switch (action.kind) {
      case "navigate":
        assertAllowedUrl(action.url, this.allowRemote);
        if (this.baseOrigin && new URL(action.url).origin !== this.baseOrigin) {
          throw new WebDebugError("NAVIGATION_ORIGIN_BLOCKED", "Navigation must stay on the session origin.");
        }
        await this.runUntilCompleteOrPaused(() => page.goto(action.url, { waitUntil: "domcontentloaded" }).then(() => undefined));
        break;
      case "click":
        await this.runUntilCompleteOrPaused(() => page.locator(action.selector).click());
        break;
      case "fill":
        await this.runUntilCompleteOrPaused(() => page.locator(action.selector).fill(action.value));
        break;
      case "wait":
        if (action.text) {
          await page.waitForFunction(
            ({ selector, text }) => (document.querySelector(selector)?.textContent ?? "").includes(text),
            { selector: action.selector ?? "body", text: action.text },
            { timeout: boundedTimeout(action.timeoutMs) },
          );
        } else if (action.selector) {
          await page.locator(action.selector).waitFor({ state: "visible", timeout: boundedTimeout(action.timeoutMs) });
        } else {
          await page.waitForTimeout(boundedTimeout(action.timeoutMs));
        }
        break;
      case "reload":
        await this.runUntilCompleteOrPaused(() => page.reload({ waitUntil: "domcontentloaded" }).then(() => undefined));
        break;
    }
    const title = this.pausedEvent ? this.lastKnownTitle : await this.readTitle(page);
    return { kind: action.kind, url: safeUrl(page.url()), title };
  }

  async snapshot(options: SnapshotOptions): Promise<BrowserSnapshot> {
    const page = this.requirePage();
    const warnings: string[] = [];
    let dom = this.lastKnownDom;
    let react = this.lastKnownReact;

    if (this.pausedEvent) {
      warnings.push("JavaScript is paused; DOM text is the last known unpaused snapshot.");
      if (react) warnings.push("JavaScript is paused; React state is the last known unpaused snapshot.");
    } else {
      try {
        dom = await this.readDom(page);
        this.lastKnownDom = dom;
      } catch (error) {
        warnings.push(`DOM snapshot unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        react = await this.reactAdapter.snapshot(page);
        this.lastKnownReact = react;
      } catch (error) {
        warnings.push(`React snapshot unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    let screenshotPath: string | null = null;
    if (options.captureScreenshot) {
      try {
        await mkdir(options.artifactDir, { recursive: true });
        screenshotPath = join(options.artifactDir, `screenshot-${Date.now()}.png`);
        if (this.pausedEvent && this.cdp) {
          const captured = await withTimeout(
            this.cdp.send("Page.captureScreenshot", { format: "png" }) as Promise<{ data?: string }>,
            1_000,
          );
          if (!captured?.data) throw new Error("CDP returned no screenshot data");
          await writeFile(screenshotPath, Buffer.from(captured.data, "base64"));
        } else {
          await page.screenshot({ path: screenshotPath });
        }
      } catch (error) {
        warnings.push(`Screenshot unavailable: ${error instanceof Error ? error.message : String(error)}`);
        screenshotPath = null;
      }
    }

    if (this.externalBrowser) {
      warnings.push("Session is attached to an external browser profile; isolation is not guaranteed.");
    }

    const consoleBound = boundItems(this.consoleEntries, 100);
    const networkBound = boundItems([...this.networkEntries.values()], 100);
    if (consoleBound.truncated) warnings.push("Console entries were truncated to 100 items.");
    if (networkBound.truncated) warnings.push("Network entries were truncated to 100 items.");

    return {
      url: safeUrl(page.url()),
      title: this.pausedEvent ? this.lastKnownTitle : await this.readTitle(page),
      viewport: page.viewportSize(),
      dom,
      console: consoleBound.items,
      network: networkBound.items,
      screenshotPath,
      debugger: await this.debuggerSnapshot(),
      react,
      next: null,
      vite: null,
      warnings,
    };
  }

  async setBreakpoint(input: { sourceUrl: string; line: number; column?: number }): Promise<DebuggerBreakpoint> {
    if (!this.cdp) throw new WebDebugError("DEBUGGER_UNAVAILABLE", "The JavaScript debugger is not connected.");
    if (!Number.isInteger(input.line) || input.line < 1) {
      throw new WebDebugError("BREAKPOINT_LINE_INVALID", "Breakpoint line must be a positive integer.");
    }

    const params = {
      url: input.sourceUrl,
      lineNumber: input.line - 1,
      ...(input.column === undefined ? {} : { columnNumber: Math.max(0, input.column - 1) }),
    };
    const response = (await this.cdp.send("Debugger.setBreakpointByUrl", params)) as { breakpointId?: string };
    const breakpoint: DebuggerBreakpoint = {
      id: response.breakpointId ?? `pending-${this.breakpoints.length + 1}`,
      sourceUrl: input.sourceUrl,
      line: input.line,
      column: input.column ?? null,
    };
    this.breakpoints.push(breakpoint);
    return breakpoint;
  }

  async control(action: "resume" | "stepOver" | "stepInto" | "stepOut"): Promise<DebuggerSnapshot> {
    if (!this.cdp) throw new WebDebugError("DEBUGGER_UNAVAILABLE", "The JavaScript debugger is not connected.");
    if (!this.pausedEvent && action !== "resume") {
      throw new WebDebugError("DEBUGGER_NOT_PAUSED", "Step control requires a paused JavaScript target.");
    }

    if (action === "resume") await this.cdp.send("Debugger.resume");
    if (action === "stepOver") await this.cdp.send("Debugger.stepOver");
    if (action === "stepInto") await this.cdp.send("Debugger.stepInto");
    if (action === "stepOut") await this.cdp.send("Debugger.stepOut");
    return this.debuggerSnapshot();
  }

  async evaluate(expression: string, allowSideEffects: boolean): Promise<EvaluationResult> {
    if (!this.cdp) throw new WebDebugError("DEBUGGER_UNAVAILABLE", "The JavaScript debugger is not connected.");
    if (!expression.trim()) throw new WebDebugError("EXPRESSION_EMPTY", "Evaluation expression cannot be empty.");

    const response = await withTimeout(this.cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      throwOnSideEffect: !allowSideEffects,
      userGesture: false,
    }) as Promise<{
      result?: RemoteObject;
      exceptionDetails?: { text?: string; exception?: RemoteObject };
    }>, 3_000);
    if (!response) throw new WebDebugError("EVALUATION_TIMEOUT", "Expression evaluation exceeded the 3 second bound.");
    if (response.exceptionDetails) {
      throw new WebDebugError(
        "EVALUATION_FAILED",
        response.exceptionDetails.text ?? "The expression could not be evaluated without an exception.",
        redactValue(response.exceptionDetails.exception),
      );
    }
    return {
      value: redactValue(remoteObjectValue(response.result)),
      type: response.result?.type ?? null,
      description: response.result?.description ? boundText(response.result.description, 500) : null,
    };
  }

  private async debuggerSnapshot(): Promise<DebuggerSnapshot> {
    const pausedEvent = this.pausedEvent;
    if (!pausedEvent) {
      return { paused: false, reason: null, callFrames: [], breakpoints: [...this.breakpoints] };
    }

    const rawFrames = (pausedEvent.callFrames ?? []).slice(0, 8);
    const callFrames: DebuggerCallFrame[] = [];
    for (const frame of rawFrames) {
      callFrames.push({
        functionName: boundText(frame.functionName ?? "<anonymous>", 200),
        url: safeUrl(frame.url || this.scriptUrls.get(frame.location?.scriptId ?? "") || ""),
        line: (frame.location?.lineNumber ?? 0) + 1,
        column: (frame.location?.columnNumber ?? 0) + 1,
        scopeNames: (frame.scopeChain ?? []).slice(0, 6).map((scope) => scope.name ?? "scope"),
        locals: await this.localsForFrame(frame),
      });
    }
    return {
      paused: true,
      reason: pausedEvent.hitBreakpoints?.length ? "breakpoint" : pausedEvent.reason ?? "unknown",
      callFrames,
      breakpoints: [...this.breakpoints],
    };
  }

  private async localsForFrame(frame: PausedCallFrame): Promise<Record<string, unknown>> {
    if (!this.cdp) return {};
    const locals: Record<string, unknown> = {};
    for (const scope of (frame.scopeChain ?? []).slice(0, 3)) {
      const objectId = scope.object?.objectId;
      if (!objectId) continue;
      try {
        const properties = await withTimeout(this.cdp.send("Runtime.getProperties", {
          objectId,
          ownProperties: true,
          generatePreview: true,
        }) as Promise<PropertiesResult>, 500);
        if (!properties) {
          locals[`${scope.name ?? "scope"}.__unavailable`] = "[UNAVAILABLE]";
          continue;
        }
        for (const property of (properties.result ?? []).slice(0, 20)) {
          if (!property.name) continue;
          const evaluated = frame.callFrameId
            ? await withTimeout(this.cdp.send("Debugger.evaluateOnCallFrame", {
                callFrameId: frame.callFrameId,
                expression: property.name,
                includeCommandLineAPI: false,
                returnByValue: true,
                silent: true,
                throwOnSideEffect: true,
              }) as Promise<{ result?: RemoteObject }>, 500)
            : null;
          locals[`${scope.name ?? "scope"}.${property.name}`] = redactValue(
            remoteObjectValue(evaluated?.result ?? property.value),
          );
        }
      } catch {
        locals[`${scope.name ?? "scope"}.__unavailable`] = "[UNAVAILABLE]";
      }
    }
    return locals;
  }

  private installObservers(page: Page): void {
    page.on("console", (message) => this.recordConsole(message));
    page.on("pageerror", (error) => {
      this.pushBounded(this.consoleEntries, {
        level: "pageerror",
        text: boundText(error.message, 2_000),
      });
    });
    page.on("request", (request) => {
      const requestId = `${Date.now()}-${this.requestCounter++}`;
      this.requestIds.set(request, requestId);
      this.networkEntries.set(requestId, {
        requestId,
        method: request.method(),
        url: safeUrl(request.url()),
        resourceType: request.resourceType(),
        status: null,
        ok: null,
      });
      this.trimNetwork();
    });
    page.on("response", (response) => this.recordResponse(response));
    page.on("requestfailed", (request) => {
      const requestId = this.requestIds.get(request);
      if (!requestId) return;
      const entry = this.networkEntries.get(requestId);
      if (entry) {
        entry.failure = boundText(request.failure()?.errorText ?? "request failed", 500);
        entry.ok = false;
      }
    });
  }

  private recordConsole(message: ConsoleMessage): void {
    const location = message.location();
    this.pushBounded(this.consoleEntries, {
      level: mapConsoleLevel(message.type()),
      text: boundText(message.text(), 2_000),
      url: location.url ? safeUrl(location.url) : undefined,
      line: location.lineNumber > 0 ? location.lineNumber : undefined,
      column: location.columnNumber > 0 ? location.columnNumber : undefined,
    });
  }

  private recordResponse(response: Response): void {
    const request = response.request();
    const requestId = this.requestIds.get(request);
    if (!requestId) return;
    const entry = this.networkEntries.get(requestId);
    if (!entry) return;
    entry.status = response.status();
    entry.ok = response.ok();
  }

  private pushBounded(entries: ConsoleEntry[], entry: ConsoleEntry): void {
    entries.push(entry);
    if (entries.length > 200) entries.splice(0, entries.length - 200);
  }

  private trimNetwork(): void {
    if (this.networkEntries.size <= 200) return;
    const first = this.networkEntries.keys().next().value;
    if (first) this.networkEntries.delete(first);
  }

  private async target(): Promise<BrowserTarget> {
    const page = this.requirePage();
    return {
      browser: "chromium",
      remote: this.remoteTarget,
      url: safeUrl(page.url()),
      title: this.pausedEvent ? this.lastKnownTitle : await this.readTitle(page),
      viewport: page.viewportSize(),
      isolated: !this.externalBrowser,
    };
  }

  private async readTitle(page: Page): Promise<string> {
    this.lastKnownTitle = boundText(await page.title(), 300);
    return this.lastKnownTitle;
  }

  private async readDom(page: Page): Promise<BrowserSnapshot["dom"]> {
    return page.evaluate(() => {
      const body = document.body;
      const elements = Array.from(body?.querySelectorAll("*") ?? [])
        .slice(0, 50)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          role: element.getAttribute("role"),
          text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
        }));
      return {
        bodyText: (body?.innerText ?? "").slice(0, 4_000),
        elements,
      };
    });
  }

  private requirePage(): Page {
    if (!this.page) throw new WebDebugError("SESSION_NOT_READY", "The browser session is not ready.");
    return this.page;
  }

  private async runUntilCompleteOrPaused(operation: () => Promise<void>): Promise<void> {
    let resolvePause: (() => void) | undefined;
    const pausePromise = new Promise<"paused">((resolve) => {
      resolvePause = () => resolve("paused");
      this.pauseWaiters.add(resolvePause);
    });
    const operationPromise = operation();
    const result = await Promise.race([
      operationPromise.then(() => "complete" as const),
      pausePromise,
    ]);
    if (resolvePause) this.pauseWaiters.delete(resolvePause);
    if (result === "paused") {
      operationPromise.catch(() => undefined);
      return;
    }
    await operationPromise;
  }
}

function remoteObjectValue(object: RemoteObject | undefined): unknown {
  if (!object) return null;
  if (Object.prototype.hasOwnProperty.call(object, "value")) return object.value;
  if (object.unserializableValue) return object.unserializableValue;
  return object.description ?? `[${object.type ?? "object"}]`;
}

function mapConsoleLevel(type: string): ConsoleEntry["level"] {
  if (type === "warning" || type === "warn") return "warning";
  if (type === "error") return "error";
  if (type === "info") return "info";
  if (type === "debug") return "debug";
  return "log";
}

function boundedTimeout(timeoutMs: number | undefined): number {
  return Math.min(Math.max(timeoutMs ?? 1_000, 0), 30_000);
}

function assertAllowedUrl(raw: string, allowRemote: boolean): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebDebugError("URL_INVALID", `Invalid browser URL: ${raw}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new WebDebugError("URL_PROTOCOL_BLOCKED", "Only http and https browser targets are supported.");
  }
  if (!allowRemote && !isLoopback(url.hostname)) {
    throw new WebDebugError(
      "REMOTE_TARGET_BLOCKED",
      "Remote browser targets are blocked by default. Set allowRemote only for an explicitly approved debugging target.",
    );
  }
}

function assertAllowedCdpEndpoint(raw: string, allowRemote: boolean): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebDebugError("CDP_ENDPOINT_INVALID", `Invalid CDP endpoint: ${safeUrl(raw)}`);
  }
  if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
    throw new WebDebugError("CDP_ENDPOINT_PROTOCOL_BLOCKED", "CDP endpoints must use http, https, ws, or wss.");
  }
  if (!allowRemote && !isLoopback(url.hostname)) {
    throw new WebDebugError(
      "REMOTE_CDP_BLOCKED",
      "Remote CDP endpoints are blocked by default. Set allowRemote only for an explicitly approved target.",
    );
  }
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([promise.catch(() => null), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
