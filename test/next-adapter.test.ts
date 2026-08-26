import { describe, expect, it, vi } from "vitest";

import { NextAdapter } from "../src/adapters/next.js";

describe("Next MCP adapter", () => {
  it("parses streamable SSE responses and keeps optional runtime warnings explicit", async () => {
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
      const request = JSON.parse(init.body);
      calls.push(request.method === "tools/list" ? "tools/list" : request.params.name);
      const body = request.method === "tools/list"
        ? { result: { tools: ["get_project_metadata", "get_errors", "get_routes", "get_logs", "get_compilation_issues", "get_page_metadata", "get_request_insights"].map((name) => ({ name })) } }
        : { result: { content: [{ type: "text", text: toolText(request.params.name) }] } };
      return new Response(`event: message\ndata: ${JSON.stringify({ ...body, jsonrpc: "2.0", id: request.id })}\n\n`, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }));

    const snapshot = await new NextAdapter().snapshot("http://127.0.0.1:4175/");
    expect(snapshot?.detected).toBe(true);
    expect(snapshot?.endpoint).toBe("http://127.0.0.1:4175/_next/mcp");
    expect(snapshot?.routes).toEqual({ appRouter: ["/", "/api/health"] });
    expect(snapshot?.compilationIssues).toEqual({ issues: [] });
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

    vi.unstubAllGlobals();
  });
});

function toolText(name) {
  const values = {
    get_project_metadata: { projectPath: "/fixture/next", devServerUrl: "http://127.0.0.1:4175" },
    get_errors: { error: "No browser sessions connected." },
    get_routes: { appRouter: ["/", "/api/health"] },
    get_logs: { logFilePath: "/fixture/next/.next/dev/logs/next-development.log" },
    get_compilation_issues: { issues: [] },
    get_page_metadata: { error: "No browser sessions connected." },
    get_request_insights: { error: "Request Insights is not enabled." },
  };
  return JSON.stringify(values[name]);
}
