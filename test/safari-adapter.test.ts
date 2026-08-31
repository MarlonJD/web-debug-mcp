import { describe, expect, it, vi } from "vitest";

import { SafariAdapter } from "../src/adapters/safari.js";

describe("Safari WebDriver adapter", () => {
  it("maps a bounded W3C WebDriver session into browser evidence", async () => {
    let currentUrl = "http://127.0.0.1:4176/";
    let bodyText = "Checkout fixture Ready";
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/session") && method === "POST") return jsonResponse({ value: { sessionId: "safari-1", capabilities: { browserVersion: "26.5.2" } } });
      if (url.endsWith("/window") && method === "GET") return jsonResponse({ value: "window-main" });
      if (url.endsWith("/window/handles")) return jsonResponse({ value: ["window-main"] });
      if (url.endsWith("/url") && method === "POST") {
        currentUrl = String(JSON.parse(String(init?.body ?? "{}")).url ?? currentUrl);
        return jsonResponse({ value: null });
      }
      if (url.endsWith("/url") && method === "GET") return jsonResponse({ value: currentUrl });
      if (url.endsWith("/title")) return jsonResponse({ value: "Web Debug Fixture" });
      if (url.endsWith("/execute/sync")) return jsonResponse({ value: { bodyText, elements: [] } });
      if (url.endsWith("/window/rect")) return jsonResponse({ value: { width: 1280, height: 800 } });
      if (url.endsWith("/element")) return jsonResponse({ value: { "element-6066-11e4-a52e-4f735466cecf": "element-1" } });
      if (url.endsWith("/element/element-1/click")) { bodyText = "Checkout fixture Payment submitted: 249.90"; return jsonResponse({ value: null }); }
      if (method === "DELETE") return jsonResponse({ value: null });
      throw new Error(`Unexpected WebDriver request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const adapter = new SafariAdapter("http://127.0.0.1:4444");
      const target = await adapter.start({ url: "http://127.0.0.1:4176/", headless: false });
      await adapter.act({ kind: "click", locator: { kind: "css", value: "#submit" } });
      const snapshot = await adapter.snapshot({ artifactDir: "/tmp/web-debug-safari-test", captureScreenshot: false });

      expect(target.browser).toBe("safari");
      expect(target.isolated).toBe(false);
      expect(target.viewport).toEqual({ width: 1280, height: 800 });
      expect(adapter.browserVersion()).toBe("26.5.2");
      expect(adapter.runtimeCapabilities()).toMatchObject({ transport: "safari-webdriver", console: { state: "unsupported" }, network: { state: "degraded" }, javascriptDebugger: { state: "unsupported" } });
      expect(snapshot.dom.bodyText).toContain("Payment submitted");
      expect(snapshot.console).toEqual([]);
      expect(snapshot.warnings[0]).toContain("Safari WebDriver does not expose Chromium CDP");
      await adapter.close();
      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls.every(([, init]) => init?.redirect === "manual")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("quarantines initial redirects, action escapes, and secondary Safari windows", async () => {
    let currentUrl = "http://127.0.0.1:4176/";
    let handles = ["window-main"];
    let escapeOnNavigate = true;
    let escapeOnClick = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/session") && method === "POST") return jsonResponse({ value: { sessionId: `safari-${fetchMock.mock.calls.length}` } });
      if (url.endsWith("/window") && method === "GET") return jsonResponse({ value: "window-main" });
      if (url.endsWith("/window/handles")) return jsonResponse({ value: handles });
      if (url.endsWith("/window") && method === "POST") return jsonResponse({ value: null });
      if (url.endsWith("/url") && method === "POST") {
        const requested = String(JSON.parse(String(init?.body ?? "{}")).url ?? currentUrl);
        currentUrl = escapeOnNavigate ? "https://example.com/escaped" : requested;
        return jsonResponse({ value: null });
      }
      if (url.endsWith("/url") && method === "GET") return jsonResponse({ value: currentUrl });
      if (url.endsWith("/title")) return jsonResponse({ value: "Fixture" });
      if (url.endsWith("/execute/sync")) return jsonResponse({ value: { bodyText: "Ready", elements: [] } });
      if (url.endsWith("/window/rect")) return jsonResponse({ value: { width: 800, height: 600 } });
      if (url.endsWith("/element")) return jsonResponse({ value: { "element-6066-11e4-a52e-4f735466cecf": "element-1" } });
      if (url.endsWith("/element/element-1/click")) {
        if (escapeOnClick) currentUrl = "https://example.com/escaped";
        return jsonResponse({ value: null });
      }
      if (method === "DELETE") return jsonResponse({ value: null });
      throw new Error(`Unexpected WebDriver request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(new SafariAdapter("http://127.0.0.1:4444").start({ url: "http://127.0.0.1:4176/", headless: false })).rejects.toMatchObject({ code: "NAVIGATION_ORIGIN_BLOCKED" });

      escapeOnNavigate = false;
      currentUrl = "http://127.0.0.1:4176/";
      const actionAdapter = new SafariAdapter("http://127.0.0.1:4444");
      await actionAdapter.start({ url: "http://127.0.0.1:4176/", headless: false });
      escapeOnClick = true;
      await expect(actionAdapter.act({ kind: "click", locator: { kind: "css", value: "#leave" } })).rejects.toMatchObject({ code: "NAVIGATION_ORIGIN_BLOCKED" });

      escapeOnClick = false;
      currentUrl = "http://127.0.0.1:4176/";
      handles = ["window-main"];
      const popupAdapter = new SafariAdapter("http://127.0.0.1:4444");
      await popupAdapter.start({ url: "http://127.0.0.1:4176/", headless: false });
      handles = ["window-main", "window-popup"];
      await expect(popupAdapter.snapshot({ artifactDir: "/tmp/web-debug-safari-popup-test", captureScreenshot: false })).rejects.toMatchObject({ code: "NAVIGATION_ORIGIN_BLOCKED" });

      handles = ["window-main"];
      currentUrl = "http://127.0.0.1:4176/";
      const preescapedAdapter = new SafariAdapter("http://127.0.0.1:4444");
      await preescapedAdapter.start({ url: "http://127.0.0.1:4176/", headless: false });
      currentUrl = "https://example.com/preescaped";
      const elementRequestsBefore = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/element")).length;
      await expect(preescapedAdapter.act({ kind: "fill", locator: { kind: "css", value: "#secret" }, value: "do-not-send" })).rejects.toMatchObject({ code: "NAVIGATION_ORIGIN_BLOCKED" });
      const elementRequestsAfter = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/element")).length;
      expect(elementRequestsAfter).toBe(elementRequestsBefore);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("maps deterministic press, select, check, hover, and scroll actions to WebDriver", async () => {
    const actionBodies: unknown[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/session") && method === "POST") return jsonResponse({ value: { sessionId: "safari-actions" } });
      if (url.endsWith("/window") && method === "GET") return jsonResponse({ value: "window-main" });
      if (url.endsWith("/window/handles")) return jsonResponse({ value: ["window-main"] });
      if (url.endsWith("/url") && method === "POST") return jsonResponse({ value: null });
      if (url.endsWith("/url") && method === "GET") return jsonResponse({ value: "http://127.0.0.1:4176/" });
      if (url.endsWith("/title")) return jsonResponse({ value: "Fixture" });
      if (url.endsWith("/window/rect")) return jsonResponse({ value: { width: 800, height: 600 } });
      if (url.endsWith("/element")) return jsonResponse({ value: { "element-6066-11e4-a52e-4f735466cecf": "element-1" } });
      if (url.endsWith("/execute/sync")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { script?: string };
        if (body.script?.includes("bodyText")) return jsonResponse({ value: { bodyText: "Ready", elements: [] } });
        return jsonResponse({ value: true });
      }
      if (url.endsWith("/element/element-1/value") || url.endsWith("/actions")) {
        actionBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        return jsonResponse({ value: null });
      }
      if (method === "DELETE") return jsonResponse({ value: null });
      throw new Error(`Unexpected WebDriver request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const adapter = new SafariAdapter("http://127.0.0.1:4444");
      await adapter.start({ url: "http://127.0.0.1:4176/", headless: false });
      await adapter.act({ kind: "press", locator: { kind: "css", value: "#input" }, key: "Enter" });
      await adapter.act({ kind: "select", locator: { kind: "css", value: "#select" }, value: "option-1" });
      await adapter.act({ kind: "check", locator: { kind: "css", value: "#check" }, checked: true });
      await adapter.act({ kind: "hover", locator: { kind: "css", value: "#hover" } });
      await adapter.act({ kind: "scroll", locator: { kind: "css", value: "#scroll" } });
      expect(JSON.stringify(actionBodies)).toContain("\uE007");
      expect(JSON.stringify(actionBodies)).toContain("pointerMove");
      await adapter.close();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("blocks debugger and side-effect-free evaluation claims", async () => {
    const adapter = new SafariAdapter();
    await expect(adapter.setBreakpoint({ sourceUrl: "http://127.0.0.1/app.js", line: 1 })).rejects.toMatchObject({ code: "DEBUGGER_UNAVAILABLE" });
    await expect(adapter.evaluate("1 + 1", false)).rejects.toMatchObject({ code: "EVALUATION_SIDE_EFFECTS_BLOCKED" });
  });

  it("blocks remote WebDriver endpoints without explicit opt-in", async () => {
    const adapter = new SafariAdapter("http://192.0.2.1:4444");
    await expect(adapter.start({ url: "http://127.0.0.1:4176/", headless: false })).rejects.toMatchObject({
      code: "REMOTE_WEBDRIVER_BLOCKED",
    });
  });

  it("rejects a remote BiDi endpoint returned by a loopback WebDriver", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/session") && init?.method === "POST") return jsonResponse({ value: { sessionId: "remote-bidi", capabilities: { webSocketUrl: "wss://192.0.2.1/session/remote-bidi" } } });
      if (url.endsWith("/window")) return jsonResponse({ value: "window-main" });
      if (init?.method === "DELETE") return jsonResponse({ value: null });
      throw new Error(`Unexpected WebDriver request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(new SafariAdapter("http://127.0.0.1:4444").start({ url: "http://127.0.0.1:4176/", headless: false })).rejects.toMatchObject({ code: "REMOTE_BIDI_BLOCKED" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("degrades explicitly when the Node runtime has no WebSocket support", async () => {
    vi.stubGlobal("WebSocket", undefined);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/session") && init?.method === "POST") {
        return new Response(JSON.stringify({
          value: {
            sessionId: "safari-no-websocket",
            capabilities: { webSocketUrl: "ws://127.0.0.1:8088/session/safari-no-websocket" },
          },
        }), { status: 200 });
      }
      if (url.endsWith("/url") && init?.method === "POST") return new Response(JSON.stringify({ value: null }), { status: 200 });
      if (url.endsWith("/window") && (init?.method ?? "GET") === "GET") return jsonResponse({ value: "window-main" });
      if (url.endsWith("/window/handles")) return jsonResponse({ value: ["window-main"] });
      if (url.endsWith("/url") && init?.method === "GET") return new Response(JSON.stringify({ value: "http://127.0.0.1:4176/" }), { status: 200 });
      if (url.endsWith("/title")) return new Response(JSON.stringify({ value: "Web Debug Fixture" }), { status: 200 });
      if (url.endsWith("/execute/sync")) return new Response(JSON.stringify({ value: { bodyText: "Ready", elements: [] } }), { status: 200 });
      if (url.endsWith("/window/rect")) return new Response(JSON.stringify({ value: { width: 800, height: 600 } }), { status: 200 });
      if (init?.method === "DELETE") return new Response(JSON.stringify({ value: null }), { status: 200 });
      throw new Error(`Unexpected WebDriver request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const adapter = new SafariAdapter("http://127.0.0.1:4444");
      await adapter.start({ url: "http://127.0.0.1:4176/", headless: false });
      const snapshot = await adapter.snapshot({ artifactDir: "/tmp/web-debug-safari-no-websocket-test", captureScreenshot: false });

      expect(snapshot.console).toEqual([]);
      expect(snapshot.warnings).toContainEqual(expect.stringContaining("requires Node WebSocket support"));
      await adapter.close();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("subscribes to BiDi console and network events when Safari provides a WebSocket", async () => {
    const messages: Array<{ method: string; params?: Record<string, unknown> }> = [];
    class FakeWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 3;
      readonly url: string;
      readyState = FakeWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        queueMicrotask(() => {
          this.readyState = FakeWebSocket.OPEN;
          this.onopen?.(new Event("open"));
        });
      }

      send(payload: string): void {
        const request = JSON.parse(payload) as { id: number; method: string };
        messages.push({ method: request.method });
        if (request.method !== "session.subscribe") return;
        queueMicrotask(() => {
          this.onmessage?.({ data: JSON.stringify({ id: request.id, type: "success", result: {} }) } as MessageEvent);
          this.onmessage?.({
            data: JSON.stringify({
              type: "event",
              method: "log.entryAdded",
              params: { level: "info", text: "BiDi console event" },
            }),
          } as MessageEvent);
          this.onmessage?.({
            data: JSON.stringify({
              type: "event",
              method: "network.beforeRequestSent",
              params: {
                request: { request: "request-1", url: "http://127.0.0.1:4176/app.js", method: "GET" },
                initiator: { type: "script" },
              },
            }),
          } as MessageEvent);
          this.onmessage?.({
            data: JSON.stringify({
              type: "event",
              method: "network.responseCompleted",
              params: { request: { request: "request-1", url: "http://127.0.0.1:4176/app.js", method: "GET" }, response: { status: 200 } },
            }),
          } as MessageEvent);
        });
      }

      close(): void {
        this.readyState = FakeWebSocket.CLOSED;
      }
    }
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/session") && init?.method === "POST") {
        return new Response(JSON.stringify({
          value: {
            sessionId: "safari-bidi",
            capabilities: { webSocketUrl: "ws://127.0.0.1:8088/session/safari-bidi" },
          },
        }), { status: 200 });
      }
      if (url.endsWith("/url") && init?.method === "POST") return new Response(JSON.stringify({ value: null }), { status: 200 });
      if (url.endsWith("/window") && (init?.method ?? "GET") === "GET") return jsonResponse({ value: "window-main" });
      if (url.endsWith("/window/handles")) return jsonResponse({ value: ["window-main"] });
      if (url.endsWith("/url") && init?.method === "GET") return new Response(JSON.stringify({ value: "http://127.0.0.1:4176/" }), { status: 200 });
      if (url.endsWith("/title")) return new Response(JSON.stringify({ value: "Web Debug Fixture" }), { status: 200 });
      if (url.endsWith("/execute/sync")) return new Response(JSON.stringify({ value: { bodyText: "Ready", elements: [] } }), { status: 200 });
      if (url.endsWith("/window/rect")) return new Response(JSON.stringify({ value: { width: 800, height: 600 } }), { status: 200 });
      if (init?.method === "DELETE") return new Response(JSON.stringify({ value: null }), { status: 200 });
      throw new Error(`Unexpected WebDriver request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const adapter = new SafariAdapter("http://127.0.0.1:4444");
      await adapter.start({ url: "http://127.0.0.1:4176/", headless: false });
      const snapshot = await adapter.snapshot({ artifactDir: "/tmp/web-debug-safari-bidi-test", captureScreenshot: false });

      expect(messages).toEqual([{ method: "session.subscribe" }]);
      expect(snapshot.console).toEqual([{ level: "info", text: "BiDi console event" }]);
      expect(snapshot.network).toEqual([{
        requestId: "request-1",
        method: "GET",
        url: "http://127.0.0.1:4176/app.js",
        resourceType: "script",
        status: 200,
        ok: true,
      }]);
      expect(adapter.runtimeCapabilities()).toMatchObject({ console: { state: "supported" }, network: { state: "degraded", provenance: ["safari-bidi", "performance-resource-timing"] }, evaluation: { state: "degraded" } });
      await adapter.close();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
