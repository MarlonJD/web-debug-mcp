import { describe, expect, it, vi } from "vitest";
import { SafariAdapter } from "../src/adapters/safari.js";
import type { SafariClient, SafariTool } from "../src/adapters/safari-client.js";
import { evaluateCheck } from "../src/core/scenario-verification.js";

const url = "http://127.0.0.1:4176/";
const options = { artifactDir: "/tmp/web-debug-safari-test", captureScreenshot: false };
class FakeSafari implements SafariClient {
  connected = false;
  handles: string[] = [];
  url = url;
  console: unknown[] = [];
  network: unknown[] = [];
  consoleFailure = false;
  escape = false;
  pointAvailable = true;
  successful = 1;
  focusMatches = true;
  focusedNodes = 1;
  calls: Array<{ name: SafariTool; args: Record<string, unknown> }> = [];
  async connect() { this.connected = true; }
  isConnected() { return this.connected; }
  async close() { this.connected = false; }
  async call<T>(name: SafariTool, args: Record<string, unknown> = {}): Promise<T> {
    this.calls.push({ name, args });
    let value: unknown;
    switch (name) {
      case "list_tabs": value = this.handles.map(handle => ({ handle, url: this.url })); break;
      case "create_tab": this.handles = ["page-owned"]; value = { handle: "page-owned" }; break;
      case "close_tab": this.handles = this.handles.filter(handle => handle !== args.handle); value = "closed"; break;
      case "switch_tab": value = "switched"; break;
      case "navigate_to_url": this.url = this.escape ? "https://example.com/escape" : String(args.url); value = {}; break;
      case "page_info": value = { url: this.url, title: "Fixture" }; break;
      case "get_page_content": value = { content: JSON.stringify({ children: Array.from({ length: this.focusedNodes }, (_, i) => ({ uid: String(70 + i), focused: true })) }) }; break;
      case "browser_console_messages":
        if (this.consoleFailure) throw new Error("Inspector unavailable");
        value = [...this.console]; this.console = []; break;
      case "list_network_requests": value = { requests: [...this.network] }; this.network = []; break;
      case "page_interactions": value = { successful: this.successful }; break;
      case "evaluate_javascript": {
        const expression = String(args.expression);
        if (expression.includes("navigator.userAgent")) value = "Version/27.0 Safari/625.1";
        else if (expression.includes("bodyText")) value = { bodyText: "Payment submitted", elements: [] };
        else if (expression.includes("innerWidth, height")) value = { width: 1280, height: 800 };
        else if (expression.includes("getEntriesByType")) value = [];
        else if (expression.includes("elementFromPoint")) value = this.pointAvailable ? { x: 100, y: 100 } : null;
        else if (expression.includes("document.activeElement")) value = this.focusMatches;
        else if (expression.includes("count: elements.length")) value = { count: 1, visible: true, enabled: true, checked: false, text: "Payment submitted" };
        else if (expression.includes("ok: true")) value = { ok: true, value: 2 };
        else value = true;
        break;
      }
      default: value = {};
    }
    return value as T;
  }
}
async function started() {
  const client = new FakeSafari();
  const adapter = new SafariAdapter(() => client);
  const target = await adapter.start({ url, headless: false });
  return { client, adapter, target };
}
function entry(text: string, level = "info", handle = "page-owned") {
  return { text, level, browsingContextHandle: handle, stackTrace: { callFrames: [{ url: `${url}app.js?token=private`, lineNumber: 8, columnNumber: 18 }] } };
}

describe("Safari native MCP adapter", () => {
  it("owns one tab and primes native observers before navigation", async () => {
    const { adapter, client, target } = await started();
    expect(target).toMatchObject({ browser: "safari", mode: "mcp", isolated: false, targetId: "page-owned", viewport: { width: 1280, height: 800 } });
    expect(adapter.browserVersion()).toBe("27.0");
    const names = client.calls.map(call => call.name);
    expect(names.indexOf("browser_console_messages")).toBeLessThan(names.indexOf("navigate_to_url"));
    expect(names.indexOf("list_network_requests")).toBeLessThan(names.indexOf("navigate_to_url"));
    expect(adapter.runtimeCapabilities()).toMatchObject({ transport: "safari-mcp", console: { state: "degraded" }, javascriptDebugger: { state: "unsupported" } });
    await adapter.close();
    expect(client.handles).toEqual([]);
    expect(client.connected).toBe(false);
  });

  it("never treats an empty, malformed or foreign console record as delivery proof", async () => {
    const { adapter, client } = await started();
    client.console = [entry("foreign", "error", "page-other"), { text: 42, browsingContextHandle: "page-owned" }];
    const snapshot = await adapter.snapshot(options);
    expect(snapshot.console).toEqual([]);
    expect(evaluateCheck({ kind: "noConsoleErrors" }, snapshot).state).toBe("unavailable");
    await adapter.close();
  });

  it("rejects actual page errors, preserves native source coordinates, and drains on reset", async () => {
    const { adapter, client } = await started();
    client.console = [entry("Payment validation failed", "error")];
    const snapshot = await adapter.snapshot(options);
    expect(snapshot.console).toEqual([{ text: "Payment validation failed", level: "error", url: `${url}app.js?token=[REDACTED]`, line: 8, column: 18 }]);
    expect(snapshot.observations?.console).toMatchObject({ state: "pass", provenance: "safari-mcp" });
    expect(evaluateCheck({ kind: "noConsoleErrors" }, snapshot).state).toBe("fail");
    client.console = [entry("stale error", "error")];
    await adapter.resetObservers();
    const clean = await adapter.snapshot(options);
    expect(clean.console).toEqual([]);
    expect(evaluateCheck({ kind: "noConsoleErrors" }, clean).state).toBe("pass");
    client.consoleFailure = true;
    const failed = await adapter.snapshot(options);
    expect(evaluateCheck({ kind: "noConsoleErrors" }, failed).state).toBe("unavailable");
    expect(adapter.runtimeCapabilities().console.state).toBe("unsupported");
    await adapter.close();
  });

  it("bounds console and network evidence and never requests network bodies", async () => {
    const { adapter, client } = await started();
    client.console = Array.from({ length: 250 }, (_, i) => entry(`message-${i}`));
    client.network = [{ requestId: "request-1", url: `${url}api?secret=value`, method: "POST", status: 201, type: "Fetch", body: "private" }];
    const snapshot = await adapter.snapshot(options);
    expect(snapshot.console).toHaveLength(100);
    expect(evaluateCheck({ kind: "noConsoleErrors" }, snapshot).state).toBe("unavailable");
    expect(snapshot.warnings.join(" ")).toContain("truncated");
    expect(snapshot.network).toEqual([{ requestId: "request-1", url: `${url}api?secret=[REDACTED]`, method: "POST", status: 201, resourceType: "Fetch", ok: true }]);
    expect(JSON.stringify(snapshot)).not.toContain("private");
    await adapter.close();
  });

  it("uses a hit-tested CSS point and fails when a native action does not complete", async () => {
    const { adapter, client } = await started();
    await adapter.act({ kind: "click", locator: { kind: "css", value: "#submit" } });
    expect(client.calls.find(call => call.name === "page_interactions")?.args).toMatchObject({ interactions: [{ type: "click", point: { x: 100, y: 100 } }] });
    client.pointAvailable = false;
    await expect(adapter.act({ kind: "click", locator: { kind: "css", value: "#covered" } })).rejects.toMatchObject({ code: "ELEMENT_NOT_INTERACTABLE" });
    client.pointAvailable = true;
    client.successful = 0;
    await expect(adapter.act({ kind: "click", locator: { kind: "css", value: "#submit" } })).rejects.toMatchObject({ code: "SAFARI_ACTION_FAILED" });
    await adapter.close();
  });

  it("quarantines a redirect, later origin escape and secondary tabs", async () => {
    const redirectClient = new FakeSafari(); redirectClient.escape = true;
    await expect(new SafariAdapter(() => redirectClient).start({ url })).rejects.toMatchObject({ code: "NAVIGATION_ORIGIN_BLOCKED" });
    expect(redirectClient.connected).toBe(false);
    const { adapter, client } = await started();
    client.url = "https://example.com/escape";
    await expect(adapter.act({ kind: "fill", locator: { kind: "css", value: "#secret" }, value: "private" })).rejects.toMatchObject({ code: "NAVIGATION_ORIGIN_BLOCKED" });
    expect(client.calls.some(call => call.name === "page_interactions")).toBe(false);
    const popup = await started(); popup.client.handles.push("page-popup");
    await expect(popup.adapter.snapshot(options)).rejects.toMatchObject({ code: "NAVIGATION_ORIGIN_BLOCKED" });
    expect(popup.client.handles).toEqual([]);
  });

  it("binds typing to the exact native focused UID and maps Space to one space without clicking", async () => {
    const { adapter, client } = await started();
    await adapter.act({ kind: "press", locator: { kind: "css", value: "#field" }, key: "Space" });
    expect(client.calls.filter(call => call.name === "page_interactions").map(call => call.args)).toEqual([
      { interactions: [{ type: "keyPress", node: "70", value: " ", purpose: expect.any(String) }] },
    ]);
    client.focusMatches = false;
    await expect(adapter.act({ kind: "fill", locator: { kind: "css", value: "#field" }, value: "private" })).rejects.toMatchObject({ code: "SAFARI_FOCUS_MISMATCH" });
    client.focusMatches = true;
    client.focusedNodes = 2;
    await expect(adapter.act({ kind: "fill", locator: { kind: "css", value: "#field" }, value: "private" })).rejects.toMatchObject({ code: "SAFARI_FOCUS_MISMATCH" });
    expect(client.calls.some(call => call.name === "page_interactions" && JSON.stringify(call.args).includes('"type":"type"'))).toBe(false);
    await adapter.close();
  });

  it("does not adopt or close another client's existing tabs", async () => {
    const client = new FakeSafari(); client.handles = ["foreign-tab"];
    await expect(new SafariAdapter(() => client).start({ url })).rejects.toMatchObject({ code: "SAFARI_SESSION_IN_USE" });
    expect(client.calls.some(call => call.name === "close_tab" || call.name === "create_tab")).toBe(false);
    expect(client.handles).toEqual(["foreign-tab"]);
  });

  it("retains explicit policy and unsupported surface boundaries", async () => {
    const factory = vi.fn(() => new FakeSafari());
    const adapter = new SafariAdapter(factory);
    await expect(adapter.start({ url: "https://example.com" })).rejects.toMatchObject({ code: "REMOTE_TARGET_BLOCKED" });
    await expect(adapter.start({ url, cdpEndpoint: "http://127.0.0.1:9222" })).rejects.toMatchObject({ code: "SAFARI_CDP_UNSUPPORTED" });
    await expect(adapter.start({ url, tls: "allow-insecure-loopback" })).rejects.toMatchObject({ code: "SAFARI_TLS_UNAVAILABLE" });
    await expect(adapter.start({ url, authFixture: "seeded-disposable" })).rejects.toMatchObject({ code: "SAFARI_AUTH_UNAVAILABLE" });
    await expect(adapter.setBreakpoint({ sourceUrl: `${url}app.js`, line: 1 })).rejects.toMatchObject({ code: "DEBUGGER_UNAVAILABLE" });
    await expect(adapter.evaluate("1 + 1", false)).rejects.toMatchObject({ code: "EVALUATION_SIDE_EFFECTS_BLOCKED" });
    expect(factory).not.toHaveBeenCalled();
  });
});
