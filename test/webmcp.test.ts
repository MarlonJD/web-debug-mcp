import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  validateWebMcpAction,
  validateWebMcpArguments,
} from "../src/adapters/webmcp.js";
import { SessionReplay } from "../src/core/session-replay.js";
import { SessionManager } from "../src/core/session-manager.js";
import { chromiumRuntimeCapabilities } from "../src/adapters/runtime-capabilities.js";
import type { ActionResult, BrowserSnapshot, BrowserTarget, OperationContext } from "../src/domain/types.js";
import type { BrowserAdapter, BrowserStartOptions, SnapshotOptions, EvaluationResult } from "../src/adapters/browser.js";
import { directActionSchema, publicReproScenarioSchema, replayableBrowserActionSchema } from "../src/domain/wire-schemas.js";
import { createServer } from "../src/index.js";

describe("direct WebMCP contract", () => {
  it("accepts bounded JSON arguments and returns every nested string for redaction", () => {
    const result = validateWebMcpArguments({
      amount: 249.9,
      nested: { token: "private-token", values: ["another-secret"] },
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(JSON.parse(result.argumentsJson)).toEqual({
        amount: 249.9,
        nested: { token: "private-token", values: ["another-secret"] },
      });
      expect(result.strings).toEqual(["private-token", "another-secret"]);
    }
  });

  it("rejects invalid shape and every bounded argument limit", () => {
    expect(validateWebMcpArguments([])).toMatchObject({ valid: false, code: "WEBMCP_ARGUMENTS_INVALID" });
    expect(validateWebMcpArguments({ value: "x".repeat(2_001) })).toMatchObject({ valid: false, code: "WEBMCP_ARGUMENTS_LIMIT" });
    expect(validateWebMcpArguments(Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`key-${index}`, index])))).toMatchObject({ valid: false, code: "WEBMCP_ARGUMENTS_LIMIT" });
    const nested: Record<string, unknown> = {};
    let cursor: Record<string, unknown> = nested;
    for (let index = 0; index < 10; index += 1) { cursor.next = {}; cursor = cursor.next as Record<string, unknown>; }
    expect(validateWebMcpArguments(nested)).toMatchObject({ valid: false, code: "WEBMCP_ARGUMENTS_LIMIT" });
    expect(validateWebMcpArguments({ bad: undefined })).toMatchObject({ valid: false, code: "WEBMCP_ARGUMENTS_INVALID" });
  });

  it("requires the exact canonical origin, tool name, side-effect opt-in, and timeout bounds", () => {
    const base = {
      kind: "webmcp" as const,
      origin: "http://127.0.0.1:4173",
      name: "tool",
      arguments: { input: "secret" },
      allowSideEffects: true as const,
    };
    expect(validateWebMcpAction(base).strings).toEqual(["secret"]);
    expect(() => validateWebMcpAction({ ...base, origin: "http://127.0.0.1:4173/" })).toThrowError(/canonical/);
    expect(() => validateWebMcpAction({ ...base, allowSideEffects: false as never })).toThrowError(/allowSideEffects/);
    expect(() => validateWebMcpAction({ ...base, timeoutMs: 0 })).toThrowError(/timeouts/);
  });

  it("keeps direct WebMCP actions out of replay, scenario, and server-reset schemas", () => {
    const action = { kind: "webmcp", origin: "http://127.0.0.1:4173", name: "tool", arguments: {}, allowSideEffects: true };
    expect(directActionSchema.safeParse(action).success).toBe(true);
    expect(replayableBrowserActionSchema.safeParse(action).success).toBe(false);
    const scenario = {
      schemaVersion: 6,
      id: "00000000-0000-4000-8000-000000000001",
      sessionId: "00000000-0000-4000-8000-000000000002",
      name: "scenario",
      url: "http://127.0.0.1:4173/",
      actions: [],
      failureSignature: [],
      acceptanceChecks: [],
      regressionChecks: [],
      checkpoints: [],
      viewports: [],
      authFixture: "none",
      tls: "strict",
      risks: {},
      serverStateReset: { action },
      requestedLevel: "quick",
      buildReference: { source: "unavailable" },
      environmentFingerprint: {},
      contractHash: "a".repeat(64),
      persistence: "in-memory",
      createdAt: new Date().toISOString(),
      baseline: {},
    };
    expect(publicReproScenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it("marks replay non-restorable without introducing an executable action", () => {
    const replay = new SessionReplay();
    replay.markNonRestorable("webmcp-direct-action");
    const frame = replay.append({
      attemptId: null,
      capturedAt: new Date().toISOString(),
      trigger: "action",
      action: null,
      url: "http://127.0.0.1:4173/",
      title: "Fixture",
      dom: { bodyText: "", elements: [] },
      console: [],
      network: [],
      debugger: { paused: false, reason: null, callFrames: [], breakpoints: [] },
      react: null,
      angular: null,
      vue: null,
    });
    expect(frame.action).toBeNull();
    expect(replay.timeline()).toMatchObject({ restorable: false, restoreBlockedReason: "webmcp-direct-action" });
    expect(replay.result("00000000-0000-4000-8000-000000000001", frame, false, [])).toMatchObject({ schemaVersion: 1, restorable: false, restoreBlockedReason: "webmcp-direct-action" });
    replay.resetForAttempt();
    expect(replay.timeline()).toMatchObject({ restorable: false, restoreBlockedReason: "webmcp-direct-action" });
  });

  it("keeps a direct call out of replay, redacts echoed arguments, and suppresses later screenshots", async () => {
    const adapter = new ScriptedWebMcpAdapter();
    const manager = new SessionManager(() => adapter);
    const session = await manager.start({ projectRoot: "fixtures/vanilla", url: "http://127.0.0.1:4173/" });
    const result = await manager.act(session.id, {
      kind: "webmcp",
      origin: "http://127.0.0.1:4173",
      name: "echo",
      arguments: { token: "private-webmcp-token" },
      allowSideEffects: true,
    });
    expect(result).toMatchObject({ schemaVersion: 1, kind: "webmcp", toolResult: "[REDACTED_INPUT]" });
    expect(adapter.actions).toBe(1);
    const capture = await manager.capture(session.id, { profile: "full" });
    expect(capture.schemaVersion).toBe(5);
    expect(capture.summary.replay).toMatchObject({ restorable: false, restoreBlockedReason: "webmcp-direct-action" });
    expect(capture.details?.screenshot).toEqual({ status: "suppressed" });
    expect(capture.details?.replay?.frames.every((frame) => frame.action === null)).toBe(true);
    await expect(manager.seekReplay(session.id, capture.summary.replay.newestIndex ?? 0, true)).rejects.toMatchObject({ code: "REPLAY_RESTORE_UNAVAILABLE" });
    await expect(manager.recordScenario({
      sessionId: session.id,
      name: "not replayable",
      url: "http://127.0.0.1:4173/",
      actions: [{ kind: "webmcp", origin: "http://127.0.0.1:4173", name: "echo", arguments: {}, allowSideEffects: true } as never],
      failureSignature: [{ kind: "route", path: "/", expected: "pass" }],
      acceptanceChecks: [{ kind: "route", path: "/" }],
    })).rejects.toMatchObject({ code: "WEBMCP_ACTION_NOT_REPLAYABLE" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer(manager);
    const client = new Client({ name: "webmcp-contract-client", version: "1" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const mcpResult = await client.callTool({ name: "web_browser_action", arguments: {
      sessionId: session.id,
      action: { kind: "webmcp", origin: "http://127.0.0.1:4173", name: "echo", arguments: { token: "another-private-token" }, allowSideEffects: true },
    } });
    expect(mcpResult.isError).not.toBe(true);
    expect((mcpResult as { structuredContent?: { data?: unknown } }).structuredContent?.data).toMatchObject({ schemaVersion: 1, kind: "webmcp", toolResult: "[REDACTED_INPUT]" });
    await client.close();
    await server.close();
    await manager.close(session.id, "delete");
  });
});

class ScriptedWebMcpAdapter implements BrowserAdapter {
  readonly target: BrowserTarget = {
    schemaVersion: 1,
    browser: "chromium",
    remote: false,
    url: "http://127.0.0.1:4173/",
    title: "Fixture",
    viewport: { width: 1_440, height: 900 },
    isolated: false,
    mode: "attach",
    targetId: "webmcp-test-target",
  };
  actions = 0;
  async start(options: BrowserStartOptions): Promise<BrowserTarget> { this.target.url = options.url; return { ...this.target }; }
  async close(): Promise<void> {}
  targetIdentity(): string | null { return this.target.targetId ?? null; }
  browserVersion(): string | null { return "scripted-webmcp"; }
  runtimeCapabilities() { return chromiumRuntimeCapabilities(true, true); }
  async act(action: import("../src/domain/types.js").DirectBrowserAction): Promise<ActionResult> {
    this.actions += 1;
    if (action.kind === "webmcp") return { schemaVersion: 1, kind: "webmcp", url: this.target.url, title: this.target.title, toolResult: "private-webmcp-token" };
    return { schemaVersion: 1, kind: action.kind, url: this.target.url, title: this.target.title };
  }
  async snapshot(_options: SnapshotOptions): Promise<BrowserSnapshot> {
    return {
      url: this.target.url,
      title: this.target.title,
      viewport: this.target.viewport,
      dom: { bodyText: "Fixture", elements: [] },
      console: [],
      network: [],
      screenshotPath: null,
      debugger: { paused: false, reason: null, callFrames: [], breakpoints: [] },
      react: null,
      angular: null,
      vue: null,
      next: null,
      vite: null,
      webmcp: { provenance: "webmcp-page-api", observedAt: new Date().toISOString(), total: 1, truncated: false, tools: [{ origin: "http://127.0.0.1:4173", name: "echo", title: null, description: "echo", inputSchemaJson: "{}", annotations: { readOnlyHint: true, untrustedContentHint: false }, untrusted: true }] },
      warnings: [],
      observations: {
        url: { state: "pass", freshness: "fresh", provenance: "browser" },
        dom: { state: "pass", freshness: "fresh", provenance: "browser" },
        console: { state: "pass", freshness: "fresh", provenance: "browser" },
      },
    };
  }
  async probe(): Promise<never> { throw new Error("not used"); }
  async setBreakpoint(): Promise<never> { throw new Error("not used"); }
  async control(): Promise<never> { throw new Error("not used"); }
  async evaluate(): Promise<EvaluationResult> { return { value: null, type: "object", description: null }; }
}
