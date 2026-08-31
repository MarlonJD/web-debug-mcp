import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright-core";
import type {
  Browser,
  BrowserContext,
  CDPSession,
  ConsoleMessage,
  Frame,
  Page,
  Request,
  Response,
} from "playwright-core";

import type {
  ActionResult,
  DirectBrowserAction,
  ReplayableBrowserAction,
  BrowserLocator,
  BrowserSnapshot,
  BrowserTarget,
  ConsoleEntry,
  DebuggerBreakpoint,
  DebuggerCallFrame,
  DebuggerSnapshot,
  NetworkEntry,
  ReactSnapshot,
  AngularSnapshot,
  VueSnapshot,
  Framework,
  OperationContext,
  LocatorProbeResult,
  LocatorProperty,
  AccessibilityDiagnostics,
  AccessibilityNode,
  LocatorSuggestion,
  PlaywrightStorageState,
} from "../domain/types.js";
import {
  MAX_AX_NODES,
  MAX_LOCATOR_SUGGESTIONS,
  MAX_LOCATOR_CHARS,
  MAX_ACCESSIBLE_NAME_CHARS,
  MAX_PROPERTIES_PER_PROBE,
  MAX_RESULT_BYTES,
} from "../domain/types.js";
import { WebDebugError } from "../core/errors.js";
import { assertTopLevelOrigin, navigationOriginError, originOf } from "../core/origin-policy.js";
import { boundItems, boundText, redactValue, safeUrl } from "../core/redaction.js";
import { ReactAdapter } from "./react.js";
import { REACT_DEBUG_BRIDGE_SCRIPT } from "./react-bridge.js";
import { AngularAdapter } from "./angular.js";
import { ANGULAR_DEBUG_BRIDGE_SCRIPT } from "./angular-bridge.js";
import { VueAdapter } from "./vue.js";
import { VUE_DEBUG_BRIDGE_SCRIPT } from "./vue-bridge.js";
import type {
  BrowserAdapter,
  BrowserStartOptions,
  EvaluationResult,
  SnapshotOptions,
} from "./browser.js";
import { chromiumRuntimeCapabilities } from "./runtime-capabilities.js";
import { WebMcpPageApi } from "./webmcp.js";

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

interface FetchRequestPausedEvent {
  requestId: string;
  request: { url: string };
  frameId: string;
  resourceType: string;
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
  private readonly angularAdapter = new AngularAdapter();
  private readonly vueAdapter = new VueAdapter();
  private frameworks = new Set<Framework>();
  private lastKnownTitle = "";
  private lastKnownDom: BrowserSnapshot["dom"] = { bodyText: "", elements: [] };
  private lastKnownReact: ReactSnapshot | null = null;
  private lastKnownAngular: AngularSnapshot | null = null;
  private lastKnownVue: VueSnapshot | null = null;
  private pausedEvent: PausedEvent | null = null;
  private targetId: string | null = null;
  private version: string | null = null;
  private authSeeded = false;
  private guardedOrigin: string | null = null;
  private navigationViolation: WebDebugError | null = null;
  private fetchRequestHandler: ((event: FetchRequestPausedEvent) => void) | null = null;
  private popupRouteHandler: ((route: import("playwright-core").Route, request: Request) => Promise<void>) | null = null;
  private popupHandler: ((popup: Page) => void) | null = null;
  private mainFrameNavigationHandler: ((frame: Frame) => void) | null = null;
  private readonly bridgeScriptIdentifiers: string[] = [];
  private mainFrameId: string | null = null;
  private webmcp: WebMcpPageApi | null = null;
  private webmcpAvailable: boolean | undefined;

  async start(options: BrowserStartOptions, context: OperationContext = {}): Promise<BrowserTarget> {
    assertContext(context);
    this.allowRemote = options.allowRemote ?? false;
    this.frameworks = new Set(options.frameworks ?? []);
    assertAllowedUrl(options.url, this.allowRemote);
    const requestedOrigin = originOf(options.url);
    this.baseOrigin = requestedOrigin;
    const elevated = options.tls === "allow-insecure-loopback" || options.authState !== undefined || options.authFixture === "seeded-disposable";
    if (elevated) {
      if (options.cdpEndpoint) throw new WebDebugError("ELEVATED_MODE_REQUIRES_LAUNCH", "TLS bypass and disposable auth require an isolated Chromium launch.");
      if (!options.approvedOrigin || options.approvedOrigin !== requestedOrigin) throw new WebDebugError("APPROVED_ORIGIN_REQUIRED", "Elevated browser modes require one exact approved origin before startup.");
      const approved = new URL(options.approvedOrigin);
      if (approved.protocol !== "http:" && approved.protocol !== "https:") throw new WebDebugError("APPROVED_ORIGIN_INVALID", "The approved origin must use HTTP or HTTPS.");
      if (!isLoopback(approved.hostname)) throw new WebDebugError("APPROVED_ORIGIN_INVALID", "The approved origin must be loopback.");
      this.guardedOrigin = approved.origin;
    } else {
      this.guardedOrigin = null;
    }
    this.authSeeded = options.authState !== undefined || options.authFixture === "seeded-disposable";

    if (options.cdpEndpoint) {
      assertAllowedCdpEndpoint(options.cdpEndpoint, this.allowRemote);
      this.remoteTarget = !isLoopback(new URL(options.cdpEndpoint).hostname);
      this.browser = await chromium.connectOverCDP(options.cdpEndpoint);
      this.externalBrowser = true;
      const contexts = this.browser.contexts();
      this.context = contexts[0] ?? null;
      if (!this.context) throw new WebDebugError("ATTACHED_CONTEXT_UNAVAILABLE", "The selected CDP browser has no existing context to attach.");
      const pages = contexts.flatMap((candidate) => candidate.pages());
      this.page = pages[0] ?? null;
      if (options.targetId) {
        this.page = null;
        for (const candidate of pages) {
          let probe: CDPSession | null = null;
          try {
            probe = await candidate.context().newCDPSession(candidate);
            const info = await probe.send("Target.getTargetInfo") as { targetInfo?: { targetId?: string } };
            if (info.targetInfo?.targetId === options.targetId) {
              this.page = candidate;
              this.context = candidate.context();
              break;
            }
          } catch {
            // A page that cannot expose Target.getTargetInfo is not a safe target match.
          } finally {
            await probe?.detach().catch(() => undefined);
          }
        }
        if (!this.page) throw new WebDebugError("ATTACHED_TARGET_NOT_FOUND", "The requested CDP targetId was not found among existing pages.");
      } else {
        if (pages.length === 0) throw new WebDebugError("ATTACHED_PAGE_UNAVAILABLE", "The selected CDP browser has no existing page to attach.");
        if (pages.length > 1) throw new WebDebugError("ATTACHED_TARGET_REQUIRED", "Multiple CDP pages are available; pass targetId to pin one exact target.");
        const [onlyPage] = pages;
        if (!onlyPage) throw new WebDebugError("ATTACHED_PAGE_UNAVAILABLE", "The selected CDP browser has no existing page to attach.");
        this.page = onlyPage;
        this.context = onlyPage.context();
      }
      if (!this.page) throw new WebDebugError("ATTACHED_PAGE_UNAVAILABLE", "The selected CDP browser has no existing page to attach.");
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
        ...(process.env.WEB_DEBUG_ENABLE_WEBMCP_TESTING === "1" ? { args: ["--enable-features=WebMCP"] } : {}),
      });
      this.context = await this.browser.newContext({
        viewport: options.viewport ?? { width: 1440, height: 900 },
        ...(options.tls === "allow-insecure-loopback" ? { ignoreHTTPSErrors: true } : {}),
        ...(elevated ? { serviceWorkers: "block" as const } : {}),
        ...(options.authState ? { storageState: options.authState } : {}),
      });
      if (elevated) await this.installGuards(this.context, this.guardedOrigin!);
      this.page = await this.context.newPage();
    }

    this.installObservers(this.page);
    this.webmcp = new WebMcpPageApi(this.page);
    this.cdp = await this.context.newCDPSession(this.page);
    await this.cdp.send("Page.enable");
    try {
      const [targetInfo, frameTree] = await Promise.all([
        this.cdp.send("Target.getTargetInfo") as Promise<{ targetInfo?: { targetId?: string } }>,
        this.cdp.send("Page.getFrameTree") as Promise<{ frameTree?: { frame?: { id?: string } } }>,
      ]);
      this.targetId = targetInfo.targetInfo?.targetId ?? null;
      this.mainFrameId = frameTree.frameTree?.frame?.id ?? null;
    } catch {
      this.targetId = null;
      this.mainFrameId = null;
    }
    await this.installProtocolGuards(this.page, this.context, requestedOrigin);
    const bridgeScripts = [
      ...(this.frameworks.has("react") ? [REACT_DEBUG_BRIDGE_SCRIPT] : []),
      ...(this.frameworks.has("angular") ? [ANGULAR_DEBUG_BRIDGE_SCRIPT] : []),
      ...(this.frameworks.has("vue") ? [VUE_DEBUG_BRIDGE_SCRIPT] : []),
    ];
    for (const source of bridgeScripts) {
      const registration = await this.cdp.send("Page.addScriptToEvaluateOnNewDocument", { source }) as { identifier?: string };
      if (registration.identifier) this.bridgeScriptIdentifiers.push(registration.identifier);
    }
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

    try {
      await withContext(this.page.goto(options.url, { waitUntil: "domcontentloaded" }), context);
    } catch (error) {
      if (this.navigationViolation) throw this.consumeNavigationViolation();
      if (this.guardedOrigin && !(error instanceof WebDebugError)) throw new WebDebugError("APPROVED_ORIGIN_BLOCKED", "The navigation target is outside the one approved origin.");
      throw error;
    }
    if (this.navigationViolation) throw this.consumeNavigationViolation();
    this.assertFinalOrigin(this.page.url());
    this.webmcpAvailable = await this.page.evaluate(() => {
      const modelContext = (document as Document & { modelContext?: unknown }).modelContext as { getTools?: unknown; executeTool?: unknown } | undefined;
      return Boolean(modelContext && typeof modelContext.getTools === "function" && typeof modelContext.executeTool === "function");
    }).catch(() => false);
    this.lastKnownTitle = boundText(await this.page.title(), 300);
    this.lastKnownDom = await this.readDom(this.page).catch(() => this.lastKnownDom);
    const [react, angular, vue] = await Promise.all([
      this.frameworks.has("react") ? this.reactAdapter.snapshot(this.page).catch(() => null) : null,
      this.frameworks.has("angular") ? this.angularAdapter.snapshot(this.page).catch(() => null) : null,
      this.frameworks.has("vue") ? this.vueAdapter.snapshot(this.page).catch(() => null) : null,
    ]);
    this.lastKnownReact = react;
    this.lastKnownAngular = angular;
    this.lastKnownVue = vue;
    this.version = this.browser.version();
    return this.target();
  }

  async probe(locator: BrowserLocator, properties: LocatorProperty[], context: OperationContext = {}): Promise<LocatorProbeResult> {
    assertContext(context);
    validateLocator(locator);
    if (this.pausedEvent) throw new WebDebugError("LOCATOR_PROBE_UNAVAILABLE", "Live locator probes are unavailable while JavaScript is paused.");
    this.assertSelectedTopLevelState();
    const unique = [...new Set(properties)];
    if (unique.length === 0) throw new WebDebugError("PROBE_PROPERTIES_REQUIRED", "A locator probe must request at least one property.");
    if (unique.length > MAX_PROPERTIES_PER_PROBE) throw new WebDebugError("PROBE_PROPERTIES_LIMIT", `A locator probe may request at most ${MAX_PROPERTIES_PER_PROBE} properties.`);
    const resolved = this.resolveLocator(locator);
    const result: LocatorProbeResult = {
      locator: cloneLocator(locator),
      properties: unique,
      observedAt: new Date().toISOString(),
      provenance: "browser",
      warnings: [],
    };
    const count = unique.includes("count") || unique.some((property) => property !== "count") ? await withContext(resolved.count(), context) : 0;
    if (unique.includes("count")) result.count = count;
    if (unique.includes("visible")) result.visible = count > 0 ? await withContext(resolved.first().isVisible(), context) : false;
    if (unique.includes("enabled")) result.enabled = count > 0 ? await withContext(resolved.first().isEnabled(), context) : false;
    if (unique.includes("checked")) result.checked = count > 0 ? await withContext(resolved.first().isChecked().catch(() => false), context) : false;
    if (unique.includes("text")) result.text = count > 0 ? boundText(await withContext(resolved.first().textContent().then((value) => value ?? ""), context), MAX_LOCATOR_CHARS) : null;
    return result;
  }

  async close(_context: OperationContext = {}): Promise<void> {
    if (this.page && this.frameworks.has("vue") && !this.pausedEvent) {
      await this.page.evaluate(() => {
        (window as Window & { __WEB_DEBUG_VUE__?: { dispose?: () => void } }).__WEB_DEBUG_VUE__?.dispose?.();
      }).catch(() => undefined);
    }
    if (this.context && this.popupRouteHandler && typeof (this.context as BrowserContext & { unroute?: unknown }).unroute === "function") {
      await this.context.unroute("**/*", this.popupRouteHandler).catch(() => undefined);
    }
    if (this.page && this.popupHandler && typeof (this.page as Page & { off?: unknown }).off === "function") this.page.off("popup", this.popupHandler);
    if (this.page && this.mainFrameNavigationHandler && typeof (this.page as Page & { off?: unknown }).off === "function") this.page.off("framenavigated", this.mainFrameNavigationHandler);
    if (this.cdp) {
      if (this.fetchRequestHandler) this.cdp.off("Fetch.requestPaused", this.fetchRequestHandler);
      await this.cdp.send("Fetch.disable").catch(() => undefined);
      for (const identifier of this.bridgeScriptIdentifiers.splice(0)) {
        await this.cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => undefined);
      }
    }
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
    this.targetId = null;
    this.version = null;
    this.authSeeded = false;
    this.guardedOrigin = null;
    this.baseOrigin = null;
    this.navigationViolation = null;
    this.fetchRequestHandler = null;
    this.popupRouteHandler = null;
    this.popupHandler = null;
    this.mainFrameNavigationHandler = null;
    this.bridgeScriptIdentifiers.length = 0;
    this.frameworks.clear();
    this.lastKnownAngular = null;
    this.lastKnownVue = null;
    this.webmcp = null;
    this.webmcpAvailable = undefined;
    this.mainFrameId = null;
  }

  async resetObservers(_context: OperationContext = {}): Promise<void> {
    this.consoleEntries.length = 0;
    this.networkEntries.clear();
    this.requestCounter = 0;
    this.lastKnownDom = { bodyText: "", elements: [] };
    this.lastKnownReact = null;
    this.lastKnownAngular = null;
    this.lastKnownVue = null;
  }

  targetIdentity(): string | null { return this.targetId; }
  browserVersion(): string | null { return this.version; }
  runtimeCapabilities() { return chromiumRuntimeCapabilities(this.externalBrowser, this.webmcpAvailable); }

  async act(action: DirectBrowserAction, context: OperationContext = {}): Promise<ActionResult> {
    assertContext(context);
    const page = this.requirePage();
    if (this.pausedEvent) {
      throw new WebDebugError("DEBUGGER_PAUSED", "Browser actions require a resumed JavaScript target.");
    }
    this.assertSelectedTopLevelState();
    try {
      switch (action.kind) {
        case "webmcp": {
          if (!this.webmcp) throw new WebDebugError("WEBMCP_UNAVAILABLE", "The selected page does not expose a callable WebMCP API.");
          const toolResult = await this.webmcp.execute(action, context);
          return {
            schemaVersion: 1,
            kind: "webmcp",
            url: safeUrl(page.url()),
            title: this.pausedEvent ? this.lastKnownTitle : await this.readTitle(page),
            toolResult,
          };
        }
        case "navigate":
          assertAllowedUrl(action.url, this.allowRemote);
          if (this.baseOrigin) assertTopLevelOrigin(action.url, this.baseOrigin);
          await this.runUntilCompleteOrPaused(() => page.goto(action.url, { waitUntil: "domcontentloaded" }).then(() => undefined), context);
          break;
        case "click":
          await this.runUntilCompleteOrPaused(() => this.resolveLocator(action.locator).click(), context);
          break;
        case "fill":
          await this.runUntilCompleteOrPaused(() => this.resolveLocator(action.locator).fill(action.value), context);
          break;
        case "press":
          await this.runUntilCompleteOrPaused(() => this.resolveLocator(action.locator).press(action.key), context);
          break;
        case "select":
          await this.runUntilCompleteOrPaused(() => this.resolveLocator(action.locator).selectOption({ value: action.value }).then(() => undefined), context);
          break;
        case "check":
          await this.runUntilCompleteOrPaused(() => (action.checked
            ? this.resolveLocator(action.locator).check()
            : this.resolveLocator(action.locator).uncheck()), context);
          break;
        case "hover":
          await this.runUntilCompleteOrPaused(() => this.resolveLocator(action.locator).hover(), context);
          break;
        case "scroll":
          await this.runUntilCompleteOrPaused(() => this.resolveLocator(action.locator).scrollIntoViewIfNeeded(), context);
          break;
        case "wait":
          await this.waitForProbe(action, context);
          break;
        case "reload":
          await this.runUntilCompleteOrPaused(() => page.reload({ waitUntil: "domcontentloaded" }).then(() => undefined), context);
          break;
      }
    } catch (error) {
      if (this.navigationViolation) throw this.consumeNavigationViolation();
      throw error;
    }
    await Promise.resolve();
    if (this.navigationViolation) throw this.consumeNavigationViolation();
    this.assertFinalOrigin(page.url());
    const title = this.pausedEvent ? this.lastKnownTitle : await this.readTitle(page);
    return { schemaVersion: 1, kind: action.kind, url: safeUrl(page.url()), title };
  }

  async snapshot(options: SnapshotOptions, context: OperationContext = {}): Promise<BrowserSnapshot> {
    assertContext(context);
    const page = this.requirePage();
    this.assertSelectedTopLevelState();
    const warnings: string[] = [];
    let dom = this.lastKnownDom;
    let react = options.checksOnly ? null : this.lastKnownReact;
    let angular = options.checksOnly ? null : this.lastKnownAngular;
    let vue = options.checksOnly ? null : this.lastKnownVue;

    if (this.pausedEvent) {
      warnings.push("JavaScript is paused; DOM text is the last known unpaused snapshot.");
      if (react) warnings.push("JavaScript is paused; React state is the last known unpaused snapshot.");
      if (angular) warnings.push("JavaScript is paused; Angular state is the last known unpaused snapshot.");
      if (vue) warnings.push("JavaScript is paused; Vue state is the last known unpaused snapshot.");
    } else {
      try {
        dom = await this.readDom(page);
        this.lastKnownDom = dom;
      } catch (error) {
        warnings.push(`DOM snapshot unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!options.checksOnly) {
        const optionalBudget = optionalBudgetMs(context, 1_000);
        const selected = [
          ...(this.frameworks.has("react") ? [{ name: "React", capture: () => this.reactAdapter.snapshot(page) }] : []),
          ...(this.frameworks.has("angular") ? [{ name: "Angular", capture: () => this.angularAdapter.snapshot(page) }] : []),
          ...(this.frameworks.has("vue") ? [{ name: "Vue", capture: () => this.vueAdapter.snapshot(page) }] : []),
        ];
        if (optionalBudget === 0 && selected.length > 0) {
          warnings.push("Framework snapshots skipped because the shared deadline left no optional-enrichment budget.");
        } else if (selected.length > 0) {
          const outcome = await withTimeout(
            trackPending(Promise.all(selected.map(async (item) => {
              try { return { name: item.name, ok: true as const, value: await item.capture() }; }
              catch (error) { return { name: item.name, ok: false as const, error }; }
            })), context),
            optionalBudget,
          );
          if (outcome === null) {
            for (const item of selected) warnings.push(`${item.name} snapshot unavailable: optional enrichment timed out.`);
          } else {
            for (const item of outcome) {
              if (!item.ok) {
                warnings.push(`${item.name} snapshot unavailable: ${item.error instanceof Error ? item.error.message : String(item.error)}`);
                continue;
              }
              if (item.name === "React") { react = item.value as ReactSnapshot | null; this.lastKnownReact = react; }
              if (item.name === "Angular") { angular = item.value as AngularSnapshot | null; this.lastKnownAngular = angular; }
              if (item.name === "Vue") { vue = item.value as VueSnapshot | null; this.lastKnownVue = vue; }
            }
          }
        }
      }
    }

    let screenshotPath: string | null = null;
    if (this.authSeeded) {
      warnings.push("Screenshot suppressed for auth-seeded disposable storage; screenshot pixels are not claimed redacted.");
    } else if (options.captureScreenshot && !options.checksOnly && !options.suppressScreenshot) {
      const optionalBudget = optionalBudgetMs(context, 1_000);
      if (optionalBudget === 0) {
        warnings.push("Screenshot skipped because the shared deadline left no optional-enrichment budget.");
      } else {
        const path = join(options.artifactDir, `screenshot-${Date.now()}.png`);
        let retainScreenshot = true;
        try {
          const capturePromise = trackPending((async () => {
            await mkdir(options.artifactDir, { recursive: true });
            if (this.pausedEvent && this.cdp) {
              const cdpCapture = await withTimeout(
                trackPending(this.cdp.send("Page.captureScreenshot", { format: "png" }) as Promise<{ data?: string }>, context),
                optionalBudget,
              );
              if (!cdpCapture?.data) throw new Error("CDP returned no screenshot data");
              await writeFile(path, Buffer.from(cdpCapture.data, "base64"));
            } else {
              await page.screenshot({ path, timeout: optionalBudget });
            }
            if (!retainScreenshot) {
              await unlink(path).catch(() => undefined);
              return null;
            }
            return path;
          })(), context);
          const captured = await withTimeout(capturePromise, optionalBudget);
          if (captured) screenshotPath = captured;
          else {
            retainScreenshot = false;
            await unlink(path).catch(() => undefined);
            warnings.push("Screenshot unavailable: optional enrichment timed out.");
          }
        } catch (error) {
          retainScreenshot = false;
          await unlink(path).catch(() => undefined);
          warnings.push("Screenshot unavailable: browser capture failed without exposing the local artifact path.");
          screenshotPath = null;
        }
      }
    }

    if (this.externalBrowser) {
      warnings.push("Session is attached to an external browser profile; isolation is not guaranteed.");
    }

    const consoleBound = boundItems(this.consoleEntries, 100);
    const networkBound = options.checksOnly ? { items: [] as NetworkEntry[], truncated: false } : boundItems([...this.networkEntries.values()], 100);
    if (consoleBound.truncated) warnings.push("Console entries were truncated to 100 items.");
    if (networkBound.truncated) warnings.push("Network entries were truncated to 100 items.");

    const accessibility = !this.pausedEvent && !options.checksOnly && options.accessibility === true
      ? await this.collectAccessibility(context, warnings)
      : null;
    let webmcp = null;
    if (!options.checksOnly && this.webmcp && this.webmcpAvailable === true && !this.pausedEvent) {
      const optionalBudget = optionalBudgetMs(context, 1_000);
      if (optionalBudget > 0) {
        const inspected = await withTimeout(trackPending(this.webmcp.inspect(context), context), optionalBudget);
        if (inspected) webmcp = inspected;
        else warnings.push("WebMCP page metadata unavailable: optional discovery timed out.");
      } else {
        warnings.push("WebMCP page metadata unavailable: optional enrichment timed out.");
      }
    }
    const snapshot: BrowserSnapshot = {
      url: safeUrl(page.url()),
      title: this.pausedEvent ? this.lastKnownTitle : await this.readTitle(page),
      viewport: page.viewportSize(),
      dom,
      console: consoleBound.items,
      network: networkBound.items,
      screenshotPath,
      debugger: options.checksOnly ? {
        paused: Boolean(this.pausedEvent),
        reason: this.pausedEvent?.reason ?? null,
        callFrames: [],
        breakpoints: [...this.breakpoints],
      } : await this.debuggerSnapshot(context),
      react,
      angular,
      vue,
      next: null,
      vite: null,
      webmcp,
      accessibility,
      warnings,
      observations: {
        url: { state: "pass", freshness: "fresh", provenance: "browser", observed: safeUrl(page.url()) },
        dom: { state: "pass", freshness: this.pausedEvent ? "stale" : "fresh", provenance: this.pausedEvent ? "cached" : "browser" },
        console: { state: "pass", freshness: "fresh", provenance: "browser" },
      },
    };
    if (options.checksOnly && !options.retainNetwork) this.networkEntries.clear();
    return snapshot;
  }

  private async installGuards(context: BrowserContext, approvedOrigin: string): Promise<void> {
    this.guardedOrigin = approvedOrigin;
    const candidate = context as BrowserContext & { routeWebSocket?: (url: string, handler: (socket: any) => void) => Promise<void> | void };
    if (typeof candidate.routeWebSocket === "function") {
      const approved = new URL(approvedOrigin);
      const websocketOrigin = `${approved.protocol === "https:" ? "wss:" : "ws:"}//${approved.host}`;
      await candidate.routeWebSocket("**/*", (socket) => {
        try {
          const socketUrl = new URL(socket.url());
          if (`${socketUrl.protocol}//${socketUrl.host}` === websocketOrigin) socket.connectToServer();
          else void socket.close();
        } catch {
          void socket.close();
        }
      });
    } else throw new WebDebugError("APPROVED_ORIGIN_GUARD_UNAVAILABLE", "Chromium transport could not install the approved-origin WebSocket guard before page creation.");
    context.on("page", (page) => {
      if (this.page && page !== this.page) void page.close().catch(() => undefined);
    });
  }

  private async installProtocolGuards(page: Page, context: BrowserContext, expectedOrigin: string): Promise<void> {
    if (!this.cdp || !this.mainFrameId || !this.targetId) {
      throw new WebDebugError("NAVIGATION_GUARD_UNAVAILABLE", "Chromium could not identify the selected target and main frame before navigation.");
    }
    this.fetchRequestHandler = (event) => {
      void this.handlePausedRequest(event, expectedOrigin).catch(() => {
        if (event.resourceType === "Document" && event.frameId === this.mainFrameId) this.navigationViolation = navigationOriginError();
        void this.cdp?.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" }).catch(() => undefined);
      });
    };
    this.cdp.on("Fetch.requestPaused", this.fetchRequestHandler);
    const patterns = this.guardedOrigin
      ? [{ urlPattern: "*", requestStage: "Request" as const }]
      : [{ urlPattern: "*", resourceType: "Document" as const, requestStage: "Request" as const }];
    await this.cdp.send("Fetch.enable", { patterns }).catch((error) => {
      throw new WebDebugError("NAVIGATION_GUARD_UNAVAILABLE", "Chromium could not enable selected-target request interception.", redactValue(error));
    });

    this.popupRouteHandler = async (route, request) => {
      let frame: Frame | null = null;
      try { frame = request.frame(); } catch { /* popup first request has no frame yet */ }
      if (frame) {
        const requestPage = frame.page();
        if (requestPage === page) { await route.fallback(); return; }
        let opener: Page | null = null;
        try { opener = await requestPage.opener(); } catch { /* unrelated page */ }
        if (opener !== page) { await route.fallback(); return; }
      } else {
        if (request.resourceType() !== "document") {
          await route.fallback();
          return;
        }
      }
      this.navigationViolation = navigationOriginError("Secondary pages are outside the selected single-page session boundary.");
      await route.abort("blockedbyclient").catch(() => undefined);
    };
    await context.route("**/*", this.popupRouteHandler).catch((error) => {
      throw new WebDebugError("NAVIGATION_GUARD_UNAVAILABLE", "Chromium could not install the popup-first-request route guard.", redactValue(error));
    });
    this.popupHandler = (popup) => {
      this.navigationViolation = navigationOriginError("Secondary pages are outside the selected single-page session boundary.");
      void popup.close().catch(() => undefined);
    };
    page.on("popup", this.popupHandler);
    this.mainFrameNavigationHandler = (frame) => {
      if (frame !== page.mainFrame() || !this.baseOrigin) return;
      try { assertTopLevelOrigin(frame.url(), this.baseOrigin); }
      catch { this.navigationViolation = navigationOriginError(); }
    };
    page.on("framenavigated", this.mainFrameNavigationHandler);
  }

  private async handlePausedRequest(event: FetchRequestPausedEvent, expectedOrigin: string): Promise<void> {
    const cdp = this.cdp;
    if (!cdp) return;
    const isTopLevelDocument = event.resourceType === "Document" && event.frameId === this.mainFrameId;
    const mustStayOnOrigin = Boolean(this.guardedOrigin) || isTopLevelDocument;
    if (!mustStayOnOrigin) {
      await cdp.send("Fetch.continueRequest", { requestId: event.requestId }).catch(() => undefined);
      return;
    }
    try {
      assertTopLevelOrigin(event.request.url, this.guardedOrigin ?? expectedOrigin);
      await cdp.send("Fetch.continueRequest", { requestId: event.requestId });
    } catch {
      if (isTopLevelDocument) this.navigationViolation = navigationOriginError();
      await cdp.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" }).catch(() => undefined);
    }
  }

  private assertFinalOrigin(rawUrl: string): void {
    if (!this.baseOrigin) return;
    assertTopLevelOrigin(rawUrl, this.baseOrigin);
  }

  private assertSelectedTopLevelState(): void {
    if (this.navigationViolation) throw this.consumeNavigationViolation();
    this.assertFinalOrigin(this.requirePage().url());
  }

  private consumeNavigationViolation(): WebDebugError {
    const error = this.navigationViolation ?? navigationOriginError();
    this.navigationViolation = null;
    return error;
  }

  private resolveLocator(locator: BrowserLocator): import("playwright-core").Locator {
    validateLocator(locator);
    const page = this.requirePage();
    switch (locator.kind) {
      case "css": return page.locator(locator.value);
      case "role": return page.getByRole(locator.role as any, locator.name === undefined ? undefined : { name: locator.name, exact: true });
      case "text": return page.getByText(locator.text, { exact: true });
      case "label": return page.getByLabel(locator.text, { exact: true });
      case "testId": return page.getByTestId(locator.value);
    }
  }

  private async waitForProbe(action: Extract<ReplayableBrowserAction, { kind: "wait" }>, context: OperationContext): Promise<void> {
    const timeout = boundedTimeout(action.timeoutMs);
    const deadline = Math.min(performance.now() + timeout, context.deadline ?? Number.POSITIVE_INFINITY);
    while (performance.now() <= deadline) {
      assertContext(context);
      const probe = await this.probe(action.locator, [action.property], context);
      const actual = probe[action.property];
      if (valuesMatch(actual, action.expected)) return;
      await boundedDelay(50, context, deadline);
    }
    throw new WebDebugError("WAIT_TIMEOUT", `Observable wait condition was not met within ${timeout}ms.`);
  }

  private async collectAccessibility(context: OperationContext, warnings: string[]): Promise<AccessibilityDiagnostics | null> {
    if (!this.cdp) return null;
    try {
      const raw = await withTimeout(trackPending(this.cdp.send("Accessibility.getFullAXTree") as Promise<{ nodes?: unknown[] }>, context), optionalBudgetMs(context, 750));
      if (!raw) { warnings.push("Accessibility diagnostics unavailable: optional enrichment timed out."); return null; }
      const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
      const normalized: AccessibilityNode[] = nodes.slice(0, MAX_AX_NODES).flatMap((rawNode, index) => normalizeAxNode(rawNode, index));
      const truncated = nodes.length > MAX_AX_NODES;
      const suggestions: LocatorSuggestion[] = [];
      if (nodes.length === 0) return { nodes: normalized, suggestions, truncated, warnings: [] };
      const page = this.requirePage();
      const candidates = await page.evaluate(() => Array.from(document.querySelectorAll("[id], [data-testid], [aria-label], label, button, input, [role]")).slice(0, 64).map((element) => ({
        id: element.id || null,
        testId: element.getAttribute("data-testid"),
        aria: element.getAttribute("aria-label"),
        tag: element.tagName.toLowerCase(),
        text: (element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 300),
      }))).catch(() => [] as Array<{ id: string | null; testId: string | null; aria: string | null; tag: string; text: string }>);
      for (const candidate of candidates) {
        if (suggestions.length >= MAX_LOCATOR_SUGGESTIONS) break;
        const locator: BrowserLocator | null = candidate.testId ? { kind: "testId", value: boundText(candidate.testId, MAX_LOCATOR_CHARS) }
          : candidate.aria ? { kind: "role", role: candidate.tag === "button" ? "button" : "textbox", name: boundText(candidate.aria, MAX_ACCESSIBLE_NAME_CHARS) }
            : candidate.id ? { kind: "css", value: `#${cssEscape(candidate.id)}` }
              : candidate.text ? { kind: "text", text: boundText(candidate.text, MAX_LOCATOR_CHARS) } : null;
        if (!locator) continue;
        try {
          const probe = await this.probe(locator, ["count"], context);
          const matchCount = probe.count ?? 0;
          suggestions.push({ locator, matchCount, uniqueAtCapture: matchCount === 1 });
        } catch { /* optional suggestion validation is best effort */ }
      }
      return { nodes: normalized, suggestions, truncated, warnings: [] };
    } catch (error) {
      warnings.push(`Accessibility diagnostics unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
      return null;
    }
  }

  async setBreakpoint(input: { sourceUrl: string; line: number; column?: number }, context: OperationContext = {}): Promise<DebuggerBreakpoint> {
    assertContext(context);
    this.assertSelectedTopLevelState();
    if (!this.cdp) throw new WebDebugError("DEBUGGER_UNAVAILABLE", "The JavaScript debugger is not connected.");
    if (!Number.isInteger(input.line) || input.line < 1) {
      throw new WebDebugError("BREAKPOINT_LINE_INVALID", "Breakpoint line must be a positive integer.");
    }

    const params = {
      url: input.sourceUrl,
      lineNumber: input.line - 1,
      ...(input.column === undefined ? {} : { columnNumber: Math.max(0, input.column - 1) }),
    };
    const response = await withContext(this.cdp.send("Debugger.setBreakpointByUrl", params) as Promise<{ breakpointId?: string }>, context);
    const breakpoint: DebuggerBreakpoint = {
      id: response.breakpointId ?? `pending-${this.breakpoints.length + 1}`,
      sourceUrl: input.sourceUrl,
      line: input.line,
      column: input.column ?? null,
    };
    this.breakpoints.push(breakpoint);
    return breakpoint;
  }

  async control(action: "resume" | "stepOver" | "stepInto" | "stepOut", context: OperationContext = {}): Promise<DebuggerSnapshot> {
    assertContext(context);
    this.assertSelectedTopLevelState();
    if (!this.cdp) throw new WebDebugError("DEBUGGER_UNAVAILABLE", "The JavaScript debugger is not connected.");
    if (!this.pausedEvent && action !== "resume") {
      throw new WebDebugError("DEBUGGER_NOT_PAUSED", "Step control requires a paused JavaScript target.");
    }

    if (action === "resume") await withContext(this.cdp.send("Debugger.resume"), context);
    if (action === "stepOver") await withContext(this.cdp.send("Debugger.stepOver"), context);
    if (action === "stepInto") await withContext(this.cdp.send("Debugger.stepInto"), context);
    if (action === "stepOut") await withContext(this.cdp.send("Debugger.stepOut"), context);
    return this.debuggerSnapshot(context);
  }

  async evaluate(expression: string, allowSideEffects: boolean, context: OperationContext = {}): Promise<EvaluationResult> {
    assertContext(context);
    this.assertSelectedTopLevelState();
    if (!this.cdp) throw new WebDebugError("DEBUGGER_UNAVAILABLE", "The JavaScript debugger is not connected.");
    if (!expression.trim()) throw new WebDebugError("EXPRESSION_EMPTY", "Evaluation expression cannot be empty.");

    const localEvaluationDeadline = performance.now() + 3_000;
    const evaluationDeadline = Math.min(context.deadline ?? Number.POSITIVE_INFINITY, localEvaluationDeadline);
    const localEvaluationTimeoutOwnsDeadline = context.deadline === undefined || localEvaluationDeadline < context.deadline;
    let response: { result?: RemoteObject; exceptionDetails?: { text?: string; exception?: RemoteObject } };
    try {
      response = await withContext(this.cdp.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        throwOnSideEffect: !allowSideEffects,
        userGesture: false,
      }) as Promise<{
        result?: RemoteObject;
        exceptionDetails?: { text?: string; exception?: RemoteObject };
      }>, { ...context, deadline: evaluationDeadline });
    } catch (error) {
      if (error instanceof WebDebugError && error.code === "VERIFICATION_DEADLINE_EXCEEDED" && localEvaluationTimeoutOwnsDeadline && !context.signal?.aborted) {
        throw new WebDebugError("EVALUATION_TIMEOUT", "Expression evaluation exceeded the 3 second bound.");
      }
      if (error instanceof WebDebugError) throw error;
      throw new WebDebugError("EVALUATION_FAILED", "The expression could not be evaluated.", redactValue(error));
    }
    if (response.exceptionDetails) {
      throw new WebDebugError(
        "EVALUATION_FAILED",
        response.exceptionDetails.text ?? "The expression could not be evaluated without an exception.",
        redactValue(response.exceptionDetails.exception),
      );
    }
    const value = redactValue(remoteObjectValue(response.result));
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_RESULT_BYTES) throw new WebDebugError("EVALUATION_RESULT_LIMIT", `Evaluation result exceeded the ${MAX_RESULT_BYTES}-byte limit.`);
    return {
      value,
      type: response.result?.type ?? null,
      description: response.result?.description ? boundText(response.result.description, 500) : null,
    };
  }

  private async debuggerSnapshot(context: OperationContext): Promise<DebuggerSnapshot> {
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
        locals: await this.localsForFrame(frame, context),
      });
    }
    return {
      paused: true,
      reason: pausedEvent.hitBreakpoints?.length ? "breakpoint" : pausedEvent.reason ?? "unknown",
      callFrames,
      breakpoints: [...this.breakpoints],
    };
  }

  private async localsForFrame(frame: PausedCallFrame, context: OperationContext): Promise<Record<string, unknown>> {
    if (!this.cdp) return {};
    const locals: Record<string, unknown> = {};
    for (const scope of (frame.scopeChain ?? []).slice(0, 3)) {
      const objectId = scope.object?.objectId;
      if (!objectId) continue;
      try {
        const properties = await withTimeout(trackPending(this.cdp.send("Runtime.getProperties", {
          objectId,
          ownProperties: true,
          generatePreview: true,
        }) as Promise<PropertiesResult>, context), 500);
        if (!properties) {
          locals[`${scope.name ?? "scope"}.__unavailable`] = "[UNAVAILABLE]";
          continue;
        }
        for (const property of (properties.result ?? []).slice(0, 20)) {
          if (!property.name) continue;
          const evaluated = frame.callFrameId
            ? await withTimeout(trackPending(this.cdp.send("Debugger.evaluateOnCallFrame", {
                callFrameId: frame.callFrameId,
                expression: property.name,
                includeCommandLineAPI: false,
                returnByValue: true,
                silent: true,
                throwOnSideEffect: true,
              }) as Promise<{ result?: RemoteObject }>, context), 500)
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
      const headers = request.headers();
      const nextActionId = headers["next-action"] ? boundText(headers["next-action"], 200) : undefined;
      this.networkEntries.set(requestId, {
        requestId,
        method: request.method(),
        url: safeUrl(request.url()),
        resourceType: request.resourceType(),
        status: null,
        ok: null,
        ...(nextActionId ? { nextActionId } : {}),
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
      schemaVersion: 1,
      browser: "chromium",
      remote: this.remoteTarget,
      url: safeUrl(page.url()),
      title: this.pausedEvent ? this.lastKnownTitle : await this.readTitle(page),
      viewport: page.viewportSize(),
      isolated: !this.externalBrowser,
      targetId: this.targetId ?? undefined,
      mode: this.externalBrowser ? "attach" : "launch",
      isolation: {
        browserProcess: !this.externalBrowser,
        context: !this.externalBrowser,
        profile: !this.externalBrowser,
        storage: !this.externalBrowser,
        cache: !this.externalBrowser,
        serviceWorkers: !this.externalBrowser,
        navigation: !this.externalBrowser,
        serverState: false,
      },
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

  private async runUntilCompleteOrPaused(operation: () => Promise<void>, context: OperationContext = {}): Promise<void> {
    assertContext(context);
    let resolvePause: (() => void) | undefined;
    const pausePromise = new Promise<"paused">((resolve) => {
      resolvePause = () => resolve("paused");
      this.pauseWaiters.add(resolvePause);
    });
    const operationPromise = operation();
    const result = await withContext(Promise.race([
      operationPromise.then(() => "complete" as const),
      pausePromise,
    ]), context);
    if (resolvePause) this.pauseWaiters.delete(resolvePause);
    if (result === "paused") {
      operationPromise.catch(() => undefined);
      return;
    }
    await operationPromise;
  }
}

function assertContext(context: OperationContext): void {
  if (context.signal?.aborted) throw new WebDebugError("REQUEST_CANCELLED", "The request was cancelled.");
  if (context.deadline !== undefined && context.deadline <= performance.now()) throw new WebDebugError("VERIFICATION_DEADLINE_EXCEEDED", "The bounded operation deadline was exhausted.");
}

async function withContext<T>(promise: Promise<T>, context: OperationContext): Promise<T> {
  assertContext(context);
  const remainingMs = context.deadline === undefined ? undefined : Math.max(0, context.deadline - performance.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancellation = new Promise<never>((_, reject) => {
    const onAbort = () => reject(new WebDebugError("REQUEST_CANCELLED", "The request was cancelled."));
    context.signal?.addEventListener("abort", onAbort, { once: true });
    if (remainingMs !== undefined) timer = setTimeout(() => reject(new WebDebugError("VERIFICATION_DEADLINE_EXCEEDED", "The bounded operation deadline was exhausted.")), remainingMs);
    promise.finally(() => { context.signal?.removeEventListener("abort", onAbort); if (timer) clearTimeout(timer); }).catch(() => undefined);
  });
  try { return await Promise.race([promise, cancellation]); }
  catch (error) { promise.catch(() => undefined); throw error; }
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

function cloneLocator(locator: BrowserLocator): BrowserLocator {
  return { ...locator } as BrowserLocator;
}

function validateLocator(locator: BrowserLocator): void {
  if (!locator || typeof locator !== "object" || typeof locator.kind !== "string") throw new WebDebugError("LOCATOR_INVALID", "A browser locator must use one supported exact strategy.");
  const value = "value" in locator ? locator.value : "text" in locator ? locator.text : locator.role;
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LOCATOR_CHARS) throw new WebDebugError("LOCATOR_INVALID", `Locator values are limited to ${MAX_LOCATOR_CHARS} characters.`);
  if (locator.kind === "role" && locator.name !== undefined && (typeof locator.name !== "string" || locator.name.length > MAX_ACCESSIBLE_NAME_CHARS)) throw new WebDebugError("LOCATOR_INVALID", `Accessible names are limited to ${MAX_ACCESSIBLE_NAME_CHARS} characters.`);
  if (!["css", "role", "text", "label", "testId"].includes(locator.kind)) throw new WebDebugError("LOCATOR_INVALID", "A browser locator must use one supported exact strategy.");
}

function valuesMatch(actual: unknown, expected: unknown): boolean {
  if (typeof expected === "string" && typeof actual === "string") return actual === expected || actual.includes(expected);
  return actual === expected;
}

async function boundedDelay(ms: number, context: OperationContext, deadline: number): Promise<void> {
  const remaining = Math.max(0, Math.min(ms, deadline - performance.now()));
  if (remaining === 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, remaining);
    const onAbort = () => { clearTimeout(timer); reject(new WebDebugError("REQUEST_CANCELLED", "The request was cancelled.")); };
    context.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function normalizeAxNode(raw: unknown, index: number): AccessibilityNode[] {
  if (!raw || typeof raw !== "object") return [];
  const node = raw as { role?: { value?: unknown }; name?: { value?: unknown }; ignored?: unknown; depth?: unknown; ignoredReasons?: Array<{ name?: unknown; value?: { value?: unknown } }>; properties?: Array<{ name?: unknown; value?: { value?: unknown } }> };
  const properties = new Map((node.properties ?? []).flatMap((property) => typeof property.name === "string" ? [[property.name, property.value?.value]] as const : []));
  const stringValue = (value: unknown): string => typeof value === "string" ? boundText(value, MAX_ACCESSIBLE_NAME_CHARS) : "";
  const boolValue = (key: string): boolean | null => typeof properties.get(key) === "boolean" ? properties.get(key) as boolean : null;
  return [{
    role: typeof node.role?.value === "string" ? boundText(node.role.value, 100) : null,
    name: stringValue(node.name?.value),
    selected: boolValue("selected"),
    checked: boolValue("checked"),
    disabled: boolValue("disabled"),
    depth: Number.isInteger(node.depth) ? Math.max(0, Math.min(128, node.depth as number)) : Math.min(index, 128),
    ignored: node.ignored === true,
    ignoredReason: typeof node.ignoredReasons?.[0]?.value?.value === "string" ? boundText(node.ignoredReasons[0].value.value, 200) : null,
  }];
}

function optionalBudgetMs(context: OperationContext, maximumMs: number): number {
  if (context.deadline === undefined) return maximumMs;
  const remaining = context.deadline - performance.now();
  return remaining <= 50 ? 0 : Math.min(maximumMs, Math.max(1, remaining - 50));
}

function assertAllowedUrl(raw: string, allowRemote: boolean): void {
  if (raw.length > 2_048) throw new WebDebugError("URL_LIMIT_EXCEEDED", "Browser URLs are limited to 2,048 characters.");
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
  if (raw.length > 2_048) throw new WebDebugError("CDP_ENDPOINT_LIMIT", "CDP endpoints are limited to 2,048 characters.");
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

function trackPending<T>(promise: Promise<T>, context: OperationContext): Promise<T> {
  if (!context.pending) return promise;
  const settled = promise.then(() => undefined, () => undefined);
  context.pending.add(settled);
  void settled.then(() => context.pending?.delete(settled));
  return promise;
}
