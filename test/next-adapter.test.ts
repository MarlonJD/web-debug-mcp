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
      JSON.stringify({ line: index, message: index === 239 ? "Bearer secret-token" : `server line ${index}` }),
    ).join("\n"));

    try {
      stubNextFetch(logFilePath);
      const snapshot = await new NextAdapter().snapshot("http://127.0.0.1:4175/", root);
      expect(snapshot?.logTail?.file).toBe(".next/dev/logs/next-development.log");
      expect(snapshot?.logTail?.text).toContain("Bearer [REDACTED]");
      expect(snapshot?.logTail?.text).not.toContain("secret-token");
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
});

function stubNextFetch(logFilePath = "/fixture/next/.next/dev/logs/next-development.log") {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
    const request = JSON.parse(init.body);
    calls.push(request.method === "tools/list" ? "tools/list" : request.params.name);
    const body = request.method === "tools/list"
      ? { result: { tools: ["get_project_metadata", "get_errors", "get_routes", "get_logs", "get_compilation_issues", "get_page_metadata", "get_request_insights"].map((name) => ({ name })) } }
      : { result: { content: [{ type: "text", text: toolText(request.params.name, logFilePath) }] } };
    return new Response(`event: message\ndata: ${JSON.stringify({ ...body, jsonrpc: "2.0", id: request.id })}\n\n`, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }));
  return calls;
}

function toolText(name, logFilePath) {
  const values = {
    get_project_metadata: { projectPath: "/fixture/next", devServerUrl: "http://127.0.0.1:4175" },
    get_errors: { error: "No browser sessions connected." },
    get_routes: { appRouter: ["/", "/api/health"] },
    get_logs: { logFilePath },
    get_compilation_issues: { issues: [] },
    get_page_metadata: { error: "No browser sessions connected." },
    get_request_insights: { error: "Request Insights is not enabled." },
  };
  return JSON.stringify(values[name]);
}
