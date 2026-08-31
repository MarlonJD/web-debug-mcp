import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createServer } from "../src/index.js";
import { ProcessRegistry } from "../src/core/process-registry.js";
import type { SessionManager } from "../src/core/session-manager.js";
import { chromiumRuntimeCapabilities } from "../src/adapters/runtime-capabilities.js";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const SCENARIO_ID = "00000000-0000-4000-8000-000000000002";
const PROJECT_CAPABILITIES = { browserTarget: true, react: false, angular: false, vue: false, vite: false, next: false, serverRuntime: false };
const RUNTIME_CAPABILITIES = chromiumRuntimeCapabilities(true);
const TARGET = { browser: "chromium" as const, remote: false, url: "http://127.0.0.1:4173/", title: "Fixture", viewport: { width: 1_440, height: 900 }, isolated: false, mode: "attach" as const, targetId: "route-tab" };
const CAPTURE_TARGET = { browser: TARGET.browser, remote: TARGET.remote, viewport: TARGET.viewport, isolated: TARGET.isolated, mode: TARGET.mode };
const PROJECT = {
  schemaVersion: 2 as const,
  projectRoot: "/project",
  packageManager: null,
  kind: "application" as const,
  frameworks: ["vanilla" as const],
  markers: ["index.html"],
  confidence: "high" as const,
  ambiguous: false,
  frameworkDetections: [{ framework: "vanilla" as const, confidence: "high" as const, selected: true, provenance: [{ source: "entry" as const, value: "index.html" }] }],
  workspace: { declared: false, candidates: [], truncated: false, unsupportedPatterns: [] },
  projectCapabilities: PROJECT_CAPABILITIES,
  warnings: [],
};

function sessionResult(id = SESSION_ID, status: "ready" | "closed" = "ready") {
  return {
    schemaVersion: 2 as const,
    id,
    projectRoot: "/project",
    url: "http://127.0.0.1:4173/",
    status,
    createdAt: "2026-08-30T00:00:00.000Z",
    artifactDir: "/tmp/web-debug-route",
    target: status === "closed" ? null : TARGET,
    projectCapabilities: PROJECT_CAPABILITIES,
    runtimeCapabilities: RUNTIME_CAPABILITIES,
    warnings: [],
    tls: "strict" as const,
    authFixture: "none" as const,
    artifactState: "retained" as const,
  };
}

const REPLAY_FRAME = {
  index: 0,
  attemptId: null,
  capturedAt: "2026-08-30T00:00:00.000Z",
  trigger: "capture" as const,
  action: null,
  url: TARGET.url,
  title: TARGET.title,
  dom: { bodyText: "Fixture", elements: [] },
  console: [],
  network: [],
  debugger: { paused: false, reason: null, callFrames: [], breakpoints: [] },
  react: null,
  angular: null,
  vue: null,
};
const FINGERPRINT = {
  schemaVersion: 3 as const,
  projectRoot: "/project",
  descriptor: "vanilla",
  projectFrameworks: ["vanilla" as const],
  projectConfidence: "high" as const,
  projectAmbiguous: false,
  origin: "http://127.0.0.1:4173",
  path: "/",
  browser: "chromium" as const,
  browserVersion: "route",
  adapterMode: "attach" as const,
  targetId: "route-tab",
  remote: false,
  isolated: false,
  viewport: TARGET.viewport,
  tls: "strict" as const,
  authFixture: "none" as const,
  runtimeTransport: "chromium-cdp-attach" as const,
  runtimeCapabilityStates: { dom: "supported" as const },
  nodeVersion: process.version,
  platform: process.platform,
  architecture: process.arch,
};

function scenarioResult() {
  return {
    schemaVersion: 5 as const,
    id: SCENARIO_ID,
    sessionId: SESSION_ID,
    name: "route test",
    url: TARGET.url,
    actions: [],
    failureSignature: [],
    acceptanceChecks: [],
    regressionChecks: [],
    checkpoints: [],
    viewports: [],
    authFixture: "none" as const,
    tls: "strict" as const,
    risks: {},
    requestedLevel: "quick" as const,
    buildReference: { source: "unavailable" },
    environmentFingerprint: FINGERPRINT,
    contractHash: "a".repeat(64),
    persistence: "in-memory" as const,
    createdAt: "2026-08-30T00:00:00.000Z",
    baseline: { status: "reproduced" as const, level: "quick" as const, flaky: false, budget: {}, attempts: [], observedRate: {}, evidence: null, warnings: [], termination: "decisive-match" },
  };
}

function captureResult() {
  return {
    schemaVersion: 4 as const,
    profile: "summary" as const,
    capturedAt: "2026-08-30T00:00:00.000Z",
    cursor: "00000000-0000-4000-8000-000000000003",
    session: { id: SESSION_ID, url: TARGET.url, status: "ready" as const, target: CAPTURE_TARGET, projectCapabilities: PROJECT_CAPABILITIES, runtimeCapabilities: RUNTIME_CAPABILITIES },
    project: { frameworks: ["vanilla" as const], confidence: "high" as const, ambiguous: false, projectCapabilities: PROJECT_CAPABILITIES },
    summary: {
      title: "Fixture", viewport: TARGET.viewport, bodyText: "Fixture", domElements: 0,
      console: { total: 0, errors: 0, warnings: 0, latestErrors: [] },
      network: { total: 0, failed: 0, pending: 0, latestFailures: [] },
      debugger: { paused: false, reason: null, callFrames: 0, breakpoints: 0 },
      runtimes: { react: "not-detected" as const, angular: "not-detected" as const, vue: "not-detected" as const, next: "not-detected" as const, vite: "not-detected" as const, accessibility: "present" as const },
      replay: { frames: 1, truncated: false, oldestIndex: 0, newestIndex: 0 },
      observations: null,
    },
    redaction: { applied: true as const, policy: "default-sensitive-fields" as const },
    warnings: [],
    truncation: { applied: false, omittedSurfaces: ["dom", "console", "network", "debugger", "react", "angular", "vue", "next", "vite", "accessibility", "replay", "screenshot"] },
  };
}

class RoutingManager {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  detect(...args: unknown[]) { return this.record("detect", args, PROJECT); }
  start(...args: unknown[]) { return this.record("start", args, sessionResult()); }
  list(...args: unknown[]) { return this.record("list", args, []); }
  status(...args: unknown[]) { return this.record("status", args, sessionResult()); }
  act(...args: unknown[]) { return this.record("act", args, { kind: "press", url: "http://127.0.0.1:4173/", title: "Fixture" }); }
  capture(...args: unknown[]) { return this.record("capture", args, captureResult()); }
  inspectNext(...args: unknown[]) { return this.record("inspectNext", args, { detected: true, endpoint: "http://127.0.0.1:4173/_next", kind: "compileRoute", result: null, warnings: [] }); }
  seekReplay(...args: unknown[]) { return this.record("seekReplay", args, { sessionId: SESSION_ID, frame: REPLAY_FRAME, restored: false, availableFrames: 1, oldestFrameIndex: 0, newestFrameIndex: 0 }); }
  setBreakpoint(...args: unknown[]) { return this.record("setBreakpoint", args, { id: "bp", sourceUrl: "app.js", line: 1, column: null }); }
  control(...args: unknown[]) { return this.record("control", args, { paused: false, reason: null, callFrames: [], breakpoints: [] }); }
  evaluate(...args: unknown[]) { return this.record("evaluate", args, { value: 2, type: "number", description: null }); }
  recordScenario(...args: unknown[]) { return this.record("recordScenario", args, scenarioResult()); }
  verifyScenario(...args: unknown[]) { return this.record("verifyScenario", args, { schemaVersion: 5, outcome: "verified", level: "quick", requestedLevel: "quick", escalations: [], flaky: false, scenario: scenarioResult(), baseline: {}, postFix: {}, observedRates: {}, budget: {}, cleanup: {}, evidence: { baseline: null, postFix: null }, environmentFingerprint: FINGERPRINT, contractHash: "a".repeat(64), buildReference: {}, isolation: {}, persistence: "in-memory", warnings: [], termination: "all-required-passes", truncation: {} }); }
  close(...args: unknown[]) { return this.record("close", args, sessionResult(SESSION_ID, "closed")); }

  private record(method: string, args: unknown[], result: unknown) {
    this.calls.push({ method, args });
    return result;
  }
}

class LifecycleManager {
  private readonly active = new Map<string, ReturnType<typeof sessionResult>>();
  private readonly closed = new Map<string, ReturnType<typeof sessionResult>>();
  private nextId = 1;

  start() {
    const suffix = String(this.nextId++).padStart(12, "0");
    const session = sessionResult(`00000000-0000-4000-8000-${suffix}`);
    this.active.set(session.id, session);
    return session;
  }

  list() { return [...this.active.values()]; }

  close(sessionId: string) {
    const existing = this.active.get(sessionId);
    if (existing) {
      this.active.delete(sessionId);
      const closed = sessionResult(sessionId, "closed");
      this.closed.set(sessionId, closed);
      return closed;
    }
    const closed = this.closed.get(sessionId);
    if (!closed) throw new Error(`Unknown debug session: ${sessionId}`);
    return closed;
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
      expect(capture?.[1]).toEqual({ profile: "summary" });
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

  it("rejects a handler result that drifts from its advertised tool-specific schema", async () => {
    const manager = { detect: () => ({ projectRoot: "/project", frameworks: ["vanilla"] }) } as unknown as SessionManager;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer(manager);
    const client = new Client({ name: "routing-schema-drift-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const result = await client.callTool({ name: "web_project_detect", arguments: { projectRoot: "/project" } });
      expect(result.isError).toBe(true);
      expect((result as { structuredContent?: { error?: { code?: string } } }).structuredContent?.error?.code).toBe("RESULT_SCHEMA_VIOLATION");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("reconciles registry session counts from manager state across repeated closes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "web-debug-mcp-accounting-"));
    const registry = new ProcessRegistry({ directory, idleTtlMs: 0 });
    const manager = new LifecycleManager();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer(manager as unknown as SessionManager, registry);
    const client = new Client({ name: "registry-accounting-client", version: "1.0.0" });
    await registry.start();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const first = structuredData(await client.callTool({ name: "web_session_start", arguments: { projectRoot: "/project", url: "http://127.0.0.1:4173/" } })) as { id: string };
      const second = structuredData(await client.callTool({ name: "web_session_start", arguments: { projectRoot: "/project", url: "http://127.0.0.1:4173/" } })) as { id: string };
      expect(await registry.read()).toMatchObject({ activeSessionCount: 2, activeRequestCount: 0, busy: true, state: "running" });

      await Promise.all([
        client.callTool({ name: "web_session_close", arguments: { sessionId: first.id } }),
        client.callTool({ name: "web_session_close", arguments: { sessionId: first.id } }),
      ]);
      await client.callTool({ name: "web_session_close", arguments: { sessionId: first.id, artifactPolicy: "delete" } });
      expect(manager.list()).toHaveLength(1);
      expect(await registry.read()).toMatchObject({ activeSessionCount: 1, activeRequestCount: 0, busy: true, state: "running" });

      await client.callTool({ name: "web_session_close", arguments: { sessionId: second.id } });
      expect(manager.list()).toHaveLength(0);
      expect(await registry.read()).toMatchObject({ activeSessionCount: 0, activeRequestCount: 0, busy: false, state: "idle" });
    } finally {
      await client.close();
      await server.close();
      await registry.requestShutdown(async () => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not replace completed lifecycle results with registry finalization errors", async () => {
    const manager = new LifecycleManager();
    const observedCounts: number[] = [];
    const registry = {
      beginRequest: async () => undefined,
      endRequest: async (activeSessionCount: () => number) => {
        observedCounts.push(activeSessionCount());
        throw new Error("REGISTRY_FINALIZATION_FAILED");
      },
    } as unknown as ProcessRegistry;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer(manager as unknown as SessionManager, registry);
    const client = new Client({ name: "registry-failure-client", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const startResult = await client.callTool({ name: "web_session_start", arguments: { projectRoot: "/project", url: "http://127.0.0.1:4173/" } });
      expect(startResult.isError).not.toBe(true);
      const session = structuredData(startResult) as { id: string };
      expect(manager.list()).toHaveLength(1);

      const closeResult = await client.callTool({ name: "web_session_close", arguments: { sessionId: session.id } });
      expect(closeResult.isError).not.toBe(true);
      expect(manager.list()).toHaveLength(0);
      expect(observedCounts).toEqual([1, 0]);
    } finally {
      await client.close();
      await server.close();
    }
  });
});

function structuredData(result: unknown): unknown {
  const structured = (result as { structuredContent?: { ok?: boolean; data?: unknown } }).structuredContent;
  expect(structured?.ok).toBe(true);
  return structured?.data;
}
