import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createServer } from "../src/index.js";
import type { SessionManager } from "../src/core/session-manager.js";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const SCENARIO_ID = "00000000-0000-4000-8000-000000000002";

class RoutingManager {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  detect(...args: unknown[]) { return this.record("detect", args, { projectRoot: "/project", frameworks: ["vanilla"] }); }
  start(...args: unknown[]) { return this.record("start", args, { id: SESSION_ID, status: "ready" }); }
  list(...args: unknown[]) { return this.record("list", args, []); }
  status(...args: unknown[]) { return this.record("status", args, { id: SESSION_ID, status: "ready" }); }
  act(...args: unknown[]) { return this.record("act", args, { kind: "press", url: "http://127.0.0.1:4173/", title: "Fixture" }); }
  capture(...args: unknown[]) { return this.record("capture", args, { schemaVersion: 3, browser: { screenshotPath: null }, session: { artifactDir: "/tmp/unused" } }); }
  inspectNext(...args: unknown[]) { return this.record("inspectNext", args, { detected: true, kind: "compileRoute", result: null, warnings: [] }); }
  seekReplay(...args: unknown[]) { return this.record("seekReplay", args, { sessionId: SESSION_ID, restored: false }); }
  setBreakpoint(...args: unknown[]) { return this.record("setBreakpoint", args, { id: "bp", sourceUrl: "app.js", line: 1, column: null }); }
  control(...args: unknown[]) { return this.record("control", args, { paused: false, reason: null, callFrames: [], breakpoints: [] }); }
  evaluate(...args: unknown[]) { return this.record("evaluate", args, { value: 2, type: "number", description: null }); }
  recordScenario(...args: unknown[]) { return this.record("recordScenario", args, { id: SCENARIO_ID, baseline: { evidence: null } }); }
  verifyScenario(...args: unknown[]) { return this.record("verifyScenario", args, { outcome: "verified", evidence: { baseline: null, postFix: null } }); }
  close(...args: unknown[]) { return this.record("close", args, { id: SESSION_ID, status: "closed" }); }

  private record(method: string, args: unknown[], result: unknown) {
    this.calls.push({ method, args });
    return result;
  }
}

describe("all public MCP handler routes", () => {
  it("forwards schema-normalized arguments and bounded contexts for all 13 tools", async () => {
    const manager = new RoutingManager();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer(manager as unknown as SessionManager);
    const client = new Client({ name: "routing-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const calls = [
        { name: "web_project_detect", arguments: { projectRoot: "/project" } },
        { name: "web_session_start", arguments: { projectRoot: "/project", url: "http://127.0.0.1:4173/" } },
        { name: "web_session_status", arguments: { sessionId: SESSION_ID } },
        { name: "web_browser_action", arguments: { sessionId: SESSION_ID, action: { kind: "press", locator: { kind: "css", value: "#input" }, key: "Enter" } } },
        { name: "web_issue_capture", arguments: { sessionId: SESSION_ID } },
        { name: "web_next_inspect", arguments: { sessionId: SESSION_ID, inspection: { kind: "compileRoute", routeSpecifier: "/" } } },
        { name: "web_replay_seek", arguments: { sessionId: SESSION_ID, frameIndex: 0 } },
        { name: "web_breakpoint_set", arguments: { sessionId: SESSION_ID, sourceUrl: "http://127.0.0.1:4173/app.js", line: 1 } },
        { name: "web_debug_control", arguments: { sessionId: SESSION_ID, action: "resume" } },
        { name: "web_debug_evaluate", arguments: { sessionId: SESSION_ID, expression: "1 + 1" } },
        { name: "web_repro_record", arguments: {
          sessionId: SESSION_ID,
          name: "route test",
          url: "http://127.0.0.1:4173/",
          actions: [],
          failureSignature: [{ kind: "route", path: "/", expected: "pass" }],
          acceptanceChecks: [{ kind: "route", path: "/" }],
        } },
        { name: "web_fix_verify", arguments: { sessionId: SESSION_ID, scenarioId: SCENARIO_ID } },
        { name: "web_session_close", arguments: { sessionId: SESSION_ID } },
      ];
      for (const call of calls) {
        const result = await client.callTool(call);
        expect(result.isError, call.name).not.toBe(true);
        expect((result as { structuredContent?: { ok?: boolean } }).structuredContent?.ok, call.name).toBe(true);
      }

      expect(manager.calls.map((call) => call.method)).toEqual([
        "detect", "start", "status", "act", "capture", "inspectNext", "seekReplay",
        "setBreakpoint", "control", "evaluate", "recordScenario", "verifyScenario", "close",
      ]);
      const start = manager.calls.find((call) => call.method === "start")?.args[0] as Record<string, unknown>;
      expect(start).toMatchObject({ browser: "chromium", headless: true, allowRemote: false, tls: "strict" });
      const capture = manager.calls.find((call) => call.method === "capture")?.args;
      expect(capture?.[1]).toBe(true);
      const replay = manager.calls.find((call) => call.method === "seekReplay")?.args;
      expect(replay?.[2]).toBe(false);
      const evaluate = manager.calls.find((call) => call.method === "evaluate")?.args;
      expect(evaluate?.[2]).toBe(false);
      const close = manager.calls.find((call) => call.method === "close")?.args;
      expect(close?.[1]).toBe("retain");
      for (const call of manager.calls.filter((entry) => ["start", "act", "capture", "inspectNext", "seekReplay", "setBreakpoint", "control", "evaluate", "recordScenario", "verifyScenario"].includes(entry.method))) {
        const context = call.args.at(-1) as { deadline?: number };
        expect(context.deadline, call.method).toBeTypeOf("number");
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("turns an oversized handler value into a bounded structured MCP error", async () => {
    const manager = { detect: () => ({ blob: "x".repeat(300_000) }) } as unknown as SessionManager;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer(manager);
    const client = new Client({ name: "routing-limit-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const result = await client.callTool({ name: "web_project_detect", arguments: { projectRoot: "/project" } });
      expect(result.isError).toBe(true);
      expect((result as { structuredContent?: { error?: { code?: string } } }).structuredContent?.error?.code).toBe("RESULT_LIMIT_EXCEEDED");
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(8 * 1024);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
