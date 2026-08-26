import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  ActionResult,
  BrowserAction,
  BrowserSnapshot,
  BrowserTarget,
  DebuggerBreakpoint,
  DebuggerSnapshot,
  DomSnapshot,
} from "../domain/types.js";
import { WebDebugError } from "../core/errors.js";
import { boundText, redactValue, safeUrl } from "../core/redaction.js";
import type {
  BrowserAdapter,
  BrowserStartOptions,
  EvaluationResult,
  SnapshotOptions,
} from "./browser.js";

const DEFAULT_DRIVER_ENDPOINT = "http://127.0.0.1:4444";
const MAX_REQUEST_MS = 5_000;

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
  private headlessRequested = true;
  private lastKnownTitle = "";
  private lastKnownDom: DomSnapshot = { bodyText: "", elements: [] };

  constructor(private readonly configuredEndpoint?: string) {}

  async start(options: BrowserStartOptions): Promise<BrowserTarget> {
    if (options.cdpEndpoint) {
      throw new WebDebugError("SAFARI_CDP_UNSUPPORTED", "Safari sessions use webdriverEndpoint, not cdpEndpoint.");
    }
    this.allowRemote = options.allowRemote ?? false;
    this.headlessRequested = options.headless ?? true;
    assertAllowedUrl(options.url, this.allowRemote);

    const configured = options.webdriverEndpoint
      ?? this.configuredEndpoint
      ?? process.env.WEB_DEBUG_SAFARI_WEBDRIVER_ENDPOINT;
    const endpoint = configured ?? DEFAULT_DRIVER_ENDPOINT;
    assertAllowedEndpoint(endpoint, this.allowRemote);
    this.remoteTarget = !isLoopback(new URL(endpoint).hostname);
    this.client = new WebDriverClient(endpoint);

    if (!configured) await this.ensureDriver(endpoint);
    try {
      this.sessionId = await this.client.createSession();
      await this.navigate(options.url);
      this.baseOrigin = new URL(options.url).origin;
      this.lastKnownTitle = await this.readTitle();
      this.lastKnownDom = await this.readDom();
      return await this.target();
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.client?.deleteSession().catch(() => undefined);
    this.client = null;
    this.sessionId = null;
    this.baseOrigin = null;
    this.remoteTarget = false;
    if (this.driverProcess) {
      this.driverProcess.kill("SIGTERM");
      this.driverProcess = null;
    }
  }

  async act(action: BrowserAction): Promise<ActionResult> {
    this.requireClient();
    switch (action.kind) {
      case "navigate":
        assertAllowedUrl(action.url, this.allowRemote);
        this.assertSameOrigin(action.url);
        await this.navigate(action.url);
        break;
      case "click":
        await this.click(action.selector);
        break;
      case "fill":
        await this.fill(action.selector, action.value);
        break;
      case "wait":
        await this.wait(action.selector, action.text, boundedTimeout(action.timeoutMs));
        break;
      case "reload":
        await this.command("/refresh", "POST");
        break;
    }
    const url = await this.currentUrl();
    const title = await this.readTitle();
    return { kind: action.kind, url: safeUrl(url), title };
  }

  async snapshot(options: SnapshotOptions): Promise<BrowserSnapshot> {
    const warnings = [
      "Safari WebDriver does not expose Chromium CDP console, network, or JavaScript debugger domains; those evidence sections are empty.",
    ];
    if (this.headlessRequested) warnings.push("Safari WebDriver does not support headless mode; the session uses a visible Safari window.");

    let url = "";
    try {
      url = await this.currentUrl();
    } catch (error) {
      warnings.push(`Safari URL snapshot unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
    }

    let dom = this.lastKnownDom;
    try {
      dom = await this.readDom();
      this.lastKnownDom = dom;
    } catch (error) {
      warnings.push(`Safari DOM snapshot unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
    }

    let title = this.lastKnownTitle;
    try {
      title = await this.readTitle();
    } catch (error) {
      warnings.push(`Safari title snapshot unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
    }

    let screenshotPath: string | null = null;
    if (options.captureScreenshot) {
      try {
        await mkdir(options.artifactDir, { recursive: true });
        screenshotPath = join(options.artifactDir, `safari-screenshot-${Date.now()}.png`);
        const data = await this.screenshot();
        await writeFile(screenshotPath, Buffer.from(data, "base64"));
      } catch (error) {
        warnings.push(`Safari screenshot unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
      }
    }

    return {
      url: safeUrl(url),
      title,
      viewport: await this.viewport(),
      dom,
      console: [],
      network: [],
      screenshotPath,
      debugger: { paused: false, reason: null, callFrames: [], breakpoints: [] },
      react: null,
      next: null,
      vite: null,
      warnings,
    };
  }

  async setBreakpoint(_input: { sourceUrl: string; line: number; column?: number }): Promise<DebuggerBreakpoint> {
    throw new WebDebugError(
      "DEBUGGER_UNAVAILABLE",
      "Safari WebDriver does not expose the JavaScript debugger breakpoint domain.",
    );
  }

  async control(_action: "resume" | "stepOver" | "stepInto" | "stepOut"): Promise<DebuggerSnapshot> {
    throw new WebDebugError(
      "DEBUGGER_UNAVAILABLE",
      "Safari WebDriver does not expose Chromium-style pause and step controls.",
    );
  }

  async evaluate(expression: string, allowSideEffects: boolean): Promise<EvaluationResult> {
    if (!expression.trim()) throw new WebDebugError("EXPRESSION_EMPTY", "Evaluation expression cannot be empty.");
    if (!allowSideEffects) {
      throw new WebDebugError(
        "EVALUATION_SIDE_EFFECTS_BLOCKED",
        "Safari WebDriver cannot prove that an expression is side-effect free; set allowSideEffects=true explicitly.",
      );
    }
    const result = await this.executeAsync(expression);
    if (!isRecord(result) || result.ok !== true) {
      throw new WebDebugError("EVALUATION_FAILED", boundText(isRecord(result) && typeof result.error === "string" ? result.error : "Safari evaluation failed.", 500));
    }
    return {
      value: redactValue(result.value),
      type: result.value === null ? "object" : typeof result.value,
      description: null,
    };
  }

  private async ensureDriver(endpoint: string): Promise<void> {
    this.client = this.requireClient();
    try {
      await this.client.status();
      return;
    } catch {
      const port = Number(process.env.WEB_DEBUG_SAFARI_PORT ?? (new URL(endpoint).port || "4444"));
      const driverPath = process.env.WEB_DEBUG_SAFARIDRIVER_PATH ?? "safaridriver";
      this.driverProcess = spawn(driverPath, ["--port", String(port)], {
        stdio: ["ignore", "ignore", "ignore"],
      });
      await this.waitForDriver(endpoint);
    }
  }

  private async waitForDriver(endpoint: string): Promise<void> {
    const deadline = Date.now() + 10_000;
    let lastError = "not attempted";
    while (Date.now() < deadline) {
      if (this.driverProcess?.exitCode !== null && this.driverProcess?.exitCode !== undefined) {
        throw new WebDebugError("SAFARI_WEBDRIVER_UNAVAILABLE", `safaridriver exited with code ${this.driverProcess.exitCode}.`);
      }
      try {
        await new WebDriverClient(endpoint).status();
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new WebDebugError("SAFARI_WEBDRIVER_UNAVAILABLE", `Safari WebDriver did not become ready: ${boundText(lastError, 500)}`);
  }

  private async navigate(url: string): Promise<void> {
    await this.command("/url", "POST", { url });
  }

  private async click(selector: string): Promise<void> {
    const element = await this.findElement(selector);
    await this.command(`/element/${encodeURIComponent(element)}/click`, "POST");
  }

  private async fill(selector: string, value: string): Promise<void> {
    const element = await this.findElement(selector);
    await this.command(`/element/${encodeURIComponent(element)}/clear`, "POST");
    await this.command(`/element/${encodeURIComponent(element)}/value`, "POST", { text: value, value: [...value] });
  }

  private async wait(selector: string | undefined, text: string | undefined, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const found = await this.executeSync<boolean>(
        `const { selector, text } = arguments[0];
          const element = document.querySelector(selector || "body");
          if (!element) return false;
          if (text) return (element.textContent || "").includes(text);
          return Boolean(element.getClientRects().length);
        `,
        [{ selector, text }],
      );
      if (found) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new WebDebugError("WAIT_TIMEOUT", `Safari wait condition exceeded ${timeoutMs}ms.`);
  }

  private async findElement(selector: string): Promise<string> {
    const value = await this.command<WebDriverElement>("/element", "POST", { using: "css selector", value: selector });
    const elementId = value["element-6066-11e4-a52e-4f735466cecf"] ?? value.ELEMENT;
    if (typeof elementId !== "string") throw new WebDebugError("ELEMENT_NOT_FOUND", `Safari could not resolve selector: ${selector}`);
    return elementId;
  }

  private async readDom(): Promise<DomSnapshot> {
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
    );
    return isDomSnapshot(value) ? value : this.lastKnownDom;
  }

  private async readTitle(): Promise<string> {
    const title = await this.command<string>("/title", "GET");
    this.lastKnownTitle = boundText(title, 300);
    return this.lastKnownTitle;
  }

  private async currentUrl(): Promise<string> {
    return this.command<string>("/url", "GET");
  }

  private async viewport(): Promise<{ width: number; height: number } | null> {
    try {
      const rect = await this.command<WebDriverRect>("/window/rect", "GET");
      if (Number.isFinite(rect.width) && Number.isFinite(rect.height)) return { width: rect.width!, height: rect.height! };
    } catch {
      // Safari versions without window rect support return no viewport metadata.
    }
    return null;
  }

  private async screenshot(): Promise<string> {
    return this.command<string>("/screenshot", "GET");
  }

  private async executeSync<T>(body: string, args: unknown[]): Promise<T> {
    return this.command<T>("/execute/sync", "POST", { script: body, args });
  }

  private async executeAsync(expression: string): Promise<unknown> {
    return this.command("/execute/async", "POST", {
      script: `const done = arguments[arguments.length - 1]; Promise.resolve().then(() => (${expression})).then((value) => done({ ok: true, value }), (error) => done({ ok: false, error: String(error) }));`,
      args: [],
    });
  }

  private async command<T>(path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<T> {
    const client = this.requireClient();
    return client.command<T>(this.sessionId, path, method, body);
  }

  private requireClient(): WebDriverClient {
    if (!this.client) throw new WebDebugError("SESSION_NOT_READY", "The Safari WebDriver session is not ready.");
    return this.client;
  }

  private assertSameOrigin(url: string): void {
    if (this.baseOrigin && new URL(url).origin !== this.baseOrigin) {
      throw new WebDebugError("NAVIGATION_ORIGIN_BLOCKED", "Navigation must stay on the session origin.");
    }
  }

  private async target(): Promise<BrowserTarget> {
    return {
      browser: "safari",
      remote: this.remoteTarget,
      url: safeUrl(await this.currentUrl()),
      title: await this.readTitle(),
      viewport: await this.viewport(),
      isolated: true,
    };
  }
}

class WebDriverClient {
  constructor(private readonly endpoint: string) {}

  async status(): Promise<void> {
    await this.send("/status", "GET");
  }

  async createSession(): Promise<string> {
    const response = await this.send("/session", "POST", {
      capabilities: { alwaysMatch: { browserName: "safari", acceptInsecureCerts: true } },
    });
    const value = isRecord(response.value) ? response.value : {};
    const sessionId = typeof response.sessionId === "string"
      ? response.sessionId
      : typeof value.sessionId === "string" ? value.sessionId : null;
    if (!sessionId) throw new WebDebugError("SAFARI_SESSION_CREATE_FAILED", "Safari WebDriver returned no session ID.");
    this.sessionId = sessionId;
    return sessionId;
  }

  async deleteSession(): Promise<void> {
    if (!this.sessionId) return;
    await this.send(`/session/${encodeURIComponent(this.sessionId)}`, "DELETE").catch(() => undefined);
    this.sessionId = null;
  }

  async command<T>(sessionId: string | null, path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<T> {
    if (!sessionId) throw new WebDebugError("SESSION_NOT_READY", "The Safari WebDriver session is not ready.");
    this.sessionId = sessionId;
    const response = await this.send(`/session/${encodeURIComponent(sessionId)}${path}`, method, body);
    return response.value as T;
  }

  private async send(path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<WebDriverEnvelope> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAX_REQUEST_MS);
    try {
      const response = await fetch(`${this.endpoint}${path}`, {
        method,
        headers: body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
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
    }
  }

  private sessionId: string | null = null;
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
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new WebDebugError("URL_PROTOCOL_BLOCKED", "Only http and https browser targets are supported.");
  }
  if (!allowRemote && !isLoopback(url.hostname)) {
    throw new WebDebugError("REMOTE_TARGET_BLOCKED", "Remote browser targets are blocked by default; set allowRemote explicitly.");
  }
}

function assertAllowedEndpoint(raw: string, allowRemote: boolean): void {
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
