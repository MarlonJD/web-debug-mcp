import { describe, expect, it, vi } from "vitest";

import { SafariAdapter } from "../src/adapters/safari.js";

describe("Safari WebDriver adapter", () => {
  it("maps a bounded W3C WebDriver session into browser evidence", async () => {
    const responses = [
      { value: { sessionId: "safari-1" } },
      { value: null },
      { value: "Web Debug Fixture" },
      { value: { bodyText: "Checkout fixture Ready", elements: [] } },
      { value: "http://127.0.0.1:4176/" },
      { value: "Web Debug Fixture" },
      { value: { width: 1280, height: 800 } },
      { value: { "element-6066-11e4-a52e-4f735466cecf": "element-1" } },
      { value: null },
      { value: "http://127.0.0.1:4176/" },
      { value: "Web Debug Fixture" },
      { value: "http://127.0.0.1:4176/" },
      { value: { bodyText: "Checkout fixture Payment submitted: 249.90", elements: [] } },
      { value: "Web Debug Fixture" },
      { value: { width: 1280, height: 800 } },
      { value: null },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(responses.shift() ?? { value: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const adapter = new SafariAdapter("http://127.0.0.1:4444");
      const target = await adapter.start({ url: "http://127.0.0.1:4176/", headless: false });
      await adapter.act({ kind: "click", selector: "#submit" });
      const snapshot = await adapter.snapshot({ artifactDir: "/tmp/web-debug-safari-test", captureScreenshot: false });

      expect(target.browser).toBe("safari");
      expect(target.viewport).toEqual({ width: 1280, height: 800 });
      expect(snapshot.dom.bodyText).toContain("Payment submitted");
      expect(snapshot.console).toEqual([]);
      expect(snapshot.warnings[0]).toContain("Safari WebDriver does not expose Chromium CDP");
      await adapter.close();
      expect(fetchMock).toHaveBeenCalledTimes(17);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("blocks debugger and side-effect-free evaluation claims", async () => {
    const adapter = new SafariAdapter();
    await expect(adapter.setBreakpoint({ sourceUrl: "http://127.0.0.1/app.js", line: 1 })).rejects.toMatchObject({ code: "DEBUGGER_UNAVAILABLE" });
    await expect(adapter.evaluate("1 + 1", false)).rejects.toMatchObject({ code: "EVALUATION_SIDE_EFFECTS_BLOCKED" });
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
              params: { response: { request: "request-1", status: 200 } },
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
      await adapter.close();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
