import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, vi } from "vitest";

import { NextAdapter } from "../src/adapters/next.js";

describe("Next MCP adapter", () => {
  it("parses streamable SSE responses and keeps optional runtime warnings explicit", async () => {
    try {
      const calls = stubNextFetch();
      const snapshot = await new NextAdapter().snapshot("http://127.0.0.1:4175/");
      expect(snapshot?.detected).toBe(true);
      expect(snapshot?.endpoint).toBe("http://127.0.0.1:4175/_next/mcp");
      expect(snapshot?.routes).toEqual({ appRouter: ["/", "/api/health"] });
      expect(snapshot?.compilationIssues).toEqual({ issues: [] });
      expect(snapshot?.logTail).toBeNull();
      expect(snapshot?.serverActionExecutions).toEqual([]);
      expect(snapshot?.warnings).toContain("Next runtime tool get_errors: No browser sessions connected.");
      expect(calls).toEqual([
        "tools/list",
        "get_project_metadata",
        "get_errors",
        "get_routes",
        "get_logs",
        "get_compilation_issues",
        "get_page_metadata",
        "get_request_insights",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reads a bounded redacted log tail inside the project boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-next-adapter-"));
    const logFilePath = join(root, ".next", "dev", "logs", "next-development.log");
    await mkdir(join(root, ".next", "dev", "logs"), { recursive: true });
    await writeFile(logFilePath, Array.from({ length: 240 }, (_, index) =>
      JSON.stringify({
        line: index,
        message: index === 239
          ? "Authorization: Basic dXNlcjpwYXNz"
          : index === 238 ? 'password="hello world"' : `server line ${index}`,
      }),
    ).join("\n"));

    try {
      stubNextFetch(logFilePath);
      const snapshot = await new NextAdapter().snapshot("http://127.0.0.1:4175/", root);
      expect(snapshot?.logTail?.file).toBe(".next/dev/logs/next-development.log");
      expect(snapshot?.logTail?.text).toContain("Authorization: [REDACTED]");
      expect(snapshot?.logTail?.text).toContain('password=\\"[REDACTED]\\"');
      expect(snapshot?.logTail?.text).not.toContain("dXNlcjpwYXNz");
      expect(snapshot?.logTail?.text).not.toContain("hello world");
      expect(snapshot?.logTail?.truncated).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips a Next log path outside the project boundary", async () => {
    const parent = await mkdtemp(join(tmpdir(), "web-debug-next-boundary-"));
    const root = join(parent, "project");
    const outsideLogFilePath = join(parent, "next-development.log");
    await mkdir(root, { recursive: true });
    await writeFile(outsideLogFilePath, "outside project boundary");

    try {
      stubNextFetch(outsideLogFilePath);
      const snapshot = await new NextAdapter().snapshot("http://127.0.0.1:4175/", root);
      expect(snapshot?.logTail).toBeNull();
      expect(snapshot?.warnings).toContain("Next development log tail was skipped because the returned log file is outside the project boundary.");
    } finally {
      vi.unstubAllGlobals();
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("inspects a Server Action and compiles a route through the allowlisted tools", async () => {
    try {
      const calls = stubNextFetch();
      const adapter = new NextAdapter();
      const action = await adapter.inspect("http://127.0.0.1:4175/", {
        kind: "resolveServerAction",
        actionId: "action-123",
      });
      const route = await adapter.inspect("http://127.0.0.1:4175/", {
        kind: "compileRoute",
        path: "/",
      });

      expect(action.result).toEqual({
        actionId: "action-123",
        runtime: "node",
        filename: "app/actions.js",
        functionName: "submitPayment",
      });
      expect(route.result).toEqual({ routeSpecifier: "/", issues: [] });
      expect(action.warnings).toEqual([]);
      expect(route.warnings).toEqual([]);
      expect(calls).toEqual(["tools/list", "get_server_action_by_id", "tools/list", "compile_route"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("normalizes request insights and links an observed Server Action to its server trace", async () => {
    try {
      stubNextFetch("/fixture/next/.next/dev/logs/next-development.log", {
        requests: [{
          requestId: "next-request-1",
          kind: "request",
          route: "/",
          url: "/",
          status: "ok",
          startTime: 10,
          durationMs: 12.5,
          spans: [{
            name: "POST",
            startTime: 10,
            durationMs: 12.5,
            status: "ok",
            traceId: "trace-1",
            spanId: "span-1",
            parentSpanId: null,
            attributes: { "http.method": "POST" },
          }],
          fetches: [],
        }],
      });
      const snapshot = await new NextAdapter().snapshot("http://127.0.0.1:4175/", undefined, [{
        requestId: "browser-request-1",
        method: "POST",
        url: "http://127.0.0.1:4175/",
        resourceType: "document",
        status: 200,
        ok: true,
        nextActionId: "action-123",
      }]);

      expect(snapshot?.requestTraces).toHaveLength(1);
      expect(snapshot?.requestTraces[0]).toMatchObject({ requestId: "next-request-1", durationMs: 12.5 });
      expect(snapshot?.serverActionExecutions[0]).toMatchObject({
        actionId: "action-123",
        trace: { requestId: "next-request-1", spans: [{ name: "POST" }] },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function stubNextFetch(logFilePath: string = "/fixture/next/.next/dev/logs/next-development.log", requestInsights: unknown = { error: "Request Insights is not enabled." }): string[] {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body ?? "{}")) as { method: string; id: number; params: { name: string } };
    calls.push(request.method === "tools/list" ? "tools/list" : request.params.name);
    const body = request.method === "tools/list"
      ? { result: { tools: ["get_project_metadata", "get_errors", "get_routes", "get_logs", "get_server_action_by_id", "get_compilation_issues", "get_page_metadata", "get_request_insights", "compile_route"].map((name) => ({ name })) } }
      : { result: { content: [{ type: "text", text: toolText(request.params.name, logFilePath, requestInsights) }] } };
    return new Response(`event: message\ndata: ${JSON.stringify({ ...body, jsonrpc: "2.0", id: request.id })}\n\n`, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }));
  return calls;
}

function toolText(name: string, logFilePath: string, requestInsights: unknown): string {
  const values: Record<string, unknown> = {
    get_project_metadata: { projectPath: "/fixture/next", devServerUrl: "http://127.0.0.1:4175" },
    get_errors: { error: "No browser sessions connected." },
    get_routes: { appRouter: ["/", "/api/health"] },
    get_logs: { logFilePath },
    get_compilation_issues: { issues: [] },
    get_page_metadata: { error: "No browser sessions connected." },
    get_request_insights: requestInsights,
    get_server_action_by_id: { actionId: "action-123", runtime: "node", filename: "app/actions.js", functionName: "submitPayment" },
    compile_route: { routeSpecifier: "/", issues: [] },
  };
  return JSON.stringify(values[name]);
}
