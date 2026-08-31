import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import type { ActionResult, BrowserAction, BrowserLocator, BrowserSnapshot, BrowserTarget, DebuggerBreakpoint, DebuggerSnapshot, OperationContext, LocatorProperty, LocatorProbeResult } from "../src/domain/types.js";
import type { BrowserAdapter, BrowserStartOptions, EvaluationResult, SnapshotOptions } from "../src/adapters/browser.js";
import { SessionManager } from "../src/core/session-manager.js";
import { createServer, WEB_DEBUG_TOOL_ANNOTATIONS } from "../src/index.js";
import { chromiumRuntimeCapabilities } from "../src/adapters/runtime-capabilities.js";
import { issueCaptureResultSchema } from "../src/domain/wire-schemas.js";

class McpScriptedAdapter implements BrowserAdapter {
  hangActions = false;
  actionStarted = false;
  cancellationObserved = false;
  closed = false;
  private readonly target: BrowserTarget = {
    browser: "chromium",
    remote: false,
    url: "http://127.0.0.1:4173/",
    title: "Fixture",
    viewport: { width: 1_440, height: 900 },
    isolated: false,
    mode: "attach",
    targetId: "mcp-tab-1",
  };
  private snapshots = 0;
  private release: (() => void) | null = null;
  private lastSnapshot: BrowserSnapshot | null = null;

  async start(options: BrowserStartOptions): Promise<BrowserTarget> {
    this.target.url = options.url;
    return { ...this.target };
  }
  async close(): Promise<void> { this.closed = true; this.release?.(); }
  targetIdentity(): string | null { return this.target.targetId ?? null; }
  browserVersion(): string | null { return "mcp-scripted"; }
  runtimeCapabilities() { return chromiumRuntimeCapabilities(true); }
  async act(action: BrowserAction, context: OperationContext = {}): Promise<ActionResult> {
    if (action.kind === "navigate") this.target.url = action.url;
    if (this.hangActions && action.kind === "click") {
      this.actionStarted = true;
      await new Promise<void>((resolve) => {
        this.release = resolve;
        const onAbort = () => {
          this.cancellationObserved = true;
          resolve();
        };
        if (context.signal?.aborted) onAbort();
        else context.signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
    return { kind: action.kind, url: this.target.url, title: this.target.title };
  }
  async snapshot(_options: SnapshotOptions): Promise<BrowserSnapshot> {
    this.snapshots += 1;
    const bodyText = this.snapshots <= 2 ? "Bug" : "Fixed";
    const result: BrowserSnapshot = {
      url: this.target.url,
      title: this.target.title,
      viewport: this.target.viewport,
      dom: { bodyText, elements: [] },
      console: [],
      network: [],
      screenshotPath: null,
      debugger: { paused: false, reason: null, callFrames: [], breakpoints: [] },
      react: null,
      angular: null,
      vue: null,
      next: null,
      vite: null,
      warnings: [],
      observations: {
        url: { state: "pass", freshness: "fresh", provenance: "browser" },
        dom: { state: "pass", freshness: "fresh", provenance: "browser" },
        console: { state: "pass", freshness: "fresh", provenance: "browser" },
      },
    };
    this.lastSnapshot = result;
    return result;
  }
  async probe(locator: BrowserLocator, properties: LocatorProperty[]): Promise<LocatorProbeResult> {
    const text = this.lastSnapshot?.dom.bodyText ?? "";
    const result: LocatorProbeResult = { locator, properties: [...new Set(properties)], observedAt: new Date().toISOString(), provenance: "browser", warnings: [] };
    if (result.properties.includes("count")) result.count = 1;
    if (result.properties.includes("visible")) result.visible = true;
    if (result.properties.includes("enabled")) result.enabled = true;
    if (result.properties.includes("checked")) result.checked = false;
    if (result.properties.includes("text")) result.text = text;
    return result;
  }
  async setBreakpoint(input: { sourceUrl: string; line: number; column?: number }): Promise<DebuggerBreakpoint> { return { id: "mcp", sourceUrl: input.sourceUrl, line: input.line, column: input.column ?? null }; }
  async control(): Promise<DebuggerSnapshot> { return { paused: false, reason: null, callFrames: [], breakpoints: [] }; }
  async evaluate(): Promise<EvaluationResult> { return { value: null, type: "object", description: null }; }
}

describe("MCP server contract", () => {
  it("exposes the documented small tool surface", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    const client = new Client({ name: "web-debug-mcp-test-client", version: "0.1.0" });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "web_breakpoint_set",
      "web_browser_action",
      "web_debug_control",
      "web_debug_evaluate",
      "web_fix_verify",
      "web_issue_capture",
      "web_next_inspect",
      "web_project_detect",
      "web_replay_seek",
      "web_repro_record",
      "web_session_close",
      "web_session_start",
      "web_session_status",
    ]);
    for (const tool of listed.tools) {
      expect(tool.annotations).toEqual(WEB_DEBUG_TOOL_ANNOTATIONS[tool.name as keyof typeof WEB_DEBUG_TOOL_ANNOTATIONS]);
      expect(tool.outputSchema).toMatchObject({ type: "object", properties: expect.objectContaining({ ok: expect.anything(), artifacts: expect.anything(), warnings: expect.anything() }) });
      expect(JSON.stringify((tool.outputSchema as { properties?: { data?: unknown } }).properties?.data)).not.toBe("{}");
    }
    expect(JSON.stringify(listed.tools.find((tool) => tool.name === "web_project_detect")?.outputSchema)).toContain("frameworkDetections");
    expect(JSON.stringify(listed.tools.find((tool) => tool.name === "web_issue_capture")?.outputSchema)).toContain("changedSurfaces");
    expect(JSON.stringify(listed.tools.find((tool) => tool.name === "web_debug_evaluate")?.outputSchema)).toContain("description");
    const replayTool = listed.tools.find((tool) => tool.name === "web_replay_seek");
    expect(replayTool?.description).toContain("mutate live state");
    expect(replayTool?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
    const sessionTool = listed.tools.find((tool) => tool.name === "web_session_start");
    expect(sessionTool?.description).toContain("Chromium or Safari");
    expect(sessionTool?.inputSchema.properties).toHaveProperty("viewport");
    const reproTool = listed.tools.find((tool) => tool.name === "web_repro_record");
    expect(reproTool?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
    expect(reproTool?.inputSchema.properties).toEqual(expect.objectContaining({ sessionId: expect.anything(), failureSignature: expect.anything(), acceptanceChecks: expect.anything() }));
    const actionTool = listed.tools.find((tool) => tool.name === "web_browser_action");
    const actionSchema = JSON.stringify(actionTool?.inputSchema);
    for (const kind of ["press", "select", "check", "hover", "scroll"]) expect(actionSchema).toContain(`\"${kind}\"`);

    const result = asCallResult(await client.callTool({
      name: "web_project_detect",
      arguments: { projectRoot: resolve("fixtures/vanilla") },
    }));
    expect(result.isError).not.toBe(true);
    expect(structuredData(result)).toMatchObject({ frameworks: ["vanilla"] });
    const text = result.content?.find((item) => item.type === "text");
    expect(text && "text" in text ? text.text : "").toContain('"vanilla"');

    const legacy = asCallResult(await client.callTool({
      name: "web_repro_record",
      arguments: { name: "legacy", url: "http://127.0.0.1:4173/", actions: [], checks: [] },
    }));
    expect(legacy.isError).toBe(true);
    expect(legacy.structuredContent).toBeUndefined();
    expect(legacy.content.find((item) => item.type === "text" && typeof item.text === "string" && item.text.includes("Unrecognized key: \"checks\""))).toBeTruthy();

    const bareWait = asCallResult(await client.callTool({
      name: "web_browser_action",
      arguments: { sessionId: "00000000-0000-0000-0000-000000000000", action: { kind: "wait", timeoutMs: 10 } },
    }));
    expect(bareWait.isError).toBe(true);
    expect(bareWait.structuredContent).toBeUndefined();
    expect(bareWait.content.find((item) => item.type === "text" && typeof item.text === "string" && item.text.includes("Invalid arguments"))).toBeTruthy();

    const obsoleteCaptureInput = asCallResult(await client.callTool({
      name: "web_issue_capture",
      arguments: { sessionId: "00000000-0000-0000-0000-000000000000", captureScreenshot: true },
    }));
    expect(obsoleteCaptureInput.isError).toBe(true);
    expect(obsoleteCaptureInput.structuredContent).toBeUndefined();

    await client.close();
    await server.close();
  });

  it("executes both scenario tools through in-memory MCP, preserves the canonical wire shape, and forwards cancellation", async () => {
    const adapter = new McpScriptedAdapter();
    const manager = new SessionManager(() => adapter, { cleanupTimeoutMs: 0 });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer(manager);
    const client = new Client({ name: "mcp-scenario-client", version: "0.1.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const oversizedStart = asCallResult(await client.callTool({
      name: "web_session_start",
      arguments: { projectRoot: resolve("fixtures/vanilla"), url: `http://127.0.0.1:4173/?q=${"x".repeat(3_000)}` },
    }));
    expect(oversizedStart.isError).toBe(true);
    expect(manager.list()).toEqual([]);

    const startResult = asCallResult(await client.callTool({ name: "web_session_start", arguments: { projectRoot: resolve("fixtures/vanilla"), url: "http://127.0.0.1:4173/" } }));
    const session = structuredData(startResult) as { id: string };
    const secret = "mcp-secret-value";
    const recordProgress: Array<{ progress: number; total?: number; message?: string }> = [];
    const recordResult = asCallResult(await client.callTool({
      name: "web_repro_record",
      arguments: {
        sessionId: session.id,
        name: "MCP scenario",
        url: `http://127.0.0.1:4173/?token=${secret}`,
        actions: [{ kind: "fill", locator: { kind: "css", value: "#amount" }, value: secret }],
        failureSignature: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Bug", match: "contains", expected: "pass" }],
        acceptanceChecks: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Fixed", match: "contains" }],
        buildReference: { source: "caller", value: "build-before" },
      },
    }, undefined, { onprogress: (event) => { recordProgress.push(event); } }));
    expect(recordResult.isError).not.toBe(true);
    const scenario = structuredData(recordResult) as Record<string, any>;
    expect(scenario.schemaVersion).toBe(5);
    expect(scenario.baseline.status).toBe("reproduced");
    expect(scenario.url).toBe("http://127.0.0.1:4173/");
    expect(scenario).not.toHaveProperty("riskSignals");
    expect(scenario).not.toHaveProperty("representativeEvidence");
    expect(JSON.stringify(scenario)).not.toContain(secret);
    expect(recordProgress.map((event) => event.progress)).toEqual([0, 1, 2, 11]);
    expect(recordProgress.every((event) => event.total === 11)).toBe(true);

    const verifyProgress: Array<{ progress: number; total?: number; message?: string }> = [];
    const verifyResult = asCallResult(await client.callTool(
      { name: "web_fix_verify", arguments: { sessionId: session.id, scenarioId: scenario.id, buildReference: { source: "caller", value: "build-after" } } },
      undefined,
      { onprogress: (event) => { verifyProgress.push(event); } },
    ));
    expect(verifyResult.isError).not.toBe(true);
    const verification = structuredData(verifyResult) as Record<string, any>;
    expect(verification.schemaVersion).toBe(5);
    expect(verification.outcome).toBe("verified");
    expect(verification.level).toBe("quick");
    expect(verification).not.toHaveProperty("passed");
    expect(verification).not.toHaveProperty("effectiveLevel");
    expect(verification).not.toHaveProperty("representativeEvidence");
    expect(verification).not.toHaveProperty("escalationReasons");
    expect(verification).not.toHaveProperty("terminationReason");
    expect((verification.scenario as Record<string, unknown>).baseline).not.toHaveProperty("terminationReason");
    expect(JSON.stringify(verification)).not.toContain(secret);
    expect(verifyProgress.map((event) => event.progress)).toEqual([0, 1, 2, 11]);

    const captureResult = asCallResult(await client.callTool({ name: "web_issue_capture", arguments: { sessionId: session.id } }));
    expect(captureResult.isError).not.toBe(true);
    const capture = structuredData(captureResult) as Record<string, any>;
    expect(capture).toMatchObject({ schemaVersion: 4, profile: "summary" });
    expect(capture).not.toHaveProperty("details");
    expect(issueCaptureResultSchema.safeParse(capture).success).toBe(true);
    expect(issueCaptureResultSchema.safeParse({ ...capture, profile: "delta" }).success).toBe(false);
    expect(issueCaptureResultSchema.safeParse({ ...capture, changedSurfaces: ["dom"] }).success).toBe(false);
    expect(issueCaptureResultSchema.safeParse({ ...capture, profile: "full" }).success).toBe(false);
    expect(Buffer.byteLength(JSON.stringify(capture))).toBeLessThan(16 * 1024);
    const deltaResult = asCallResult(await client.callTool({ name: "web_issue_capture", arguments: { sessionId: session.id, view: { profile: "delta", cursor: capture.cursor, surfaces: ["dom"] } } }));
    expect(deltaResult.isError).not.toBe(true);
    expect(structuredData(deltaResult)).toMatchObject({ profile: "delta", fromCursor: capture.cursor, unchangedSurfaces: ["dom"], changedSurfaces: [] });

    const legacyBuildReference = asCallResult(await client.callTool({
      name: "web_repro_record",
      arguments: {
        sessionId: session.id,
        name: "legacy build shape",
        url: "http://127.0.0.1:4173/",
        actions: [],
        failureSignature: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Bug", match: "contains", expected: "pass" }],
        acceptanceChecks: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Fixed", match: "contains" }],
        buildReference: "legacy-build",
      },
    }));
    expect(legacyBuildReference.isError).toBe(true);

    adapter.hangActions = true;
    const controller = new AbortController();
    const cancellation = client.callTool({ name: "web_browser_action", arguments: { sessionId: session.id, action: { kind: "click", locator: { kind: "css", value: "#hang" } } } }, undefined, { signal: controller.signal });
    for (let attempt = 0; attempt < 5 && !adapter.actionStarted; attempt += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    expect(adapter.actionStarted).toBe(true);
    controller.abort();
    await cancellation.catch(() => undefined);
    for (let attempt = 0; attempt < 5 && !adapter.cancellationObserved; attempt += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    expect(adapter.cancellationObserved).toBe(true);
    let observedStatus = manager.status(session.id).status;
    for (let attempt = 0; attempt < 10 && observedStatus !== "failed"; attempt += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      observedStatus = manager.status(session.id).status;
    }
    expect(observedStatus).toBe("failed");
    await expect(manager.capture(session.id, { profile: "summary" })).rejects.toMatchObject({ code: "SESSION_UNUSABLE" });
    await manager.close(session.id);
    expect(adapter.closed).toBe(true);

    await client.close();
    await server.close();
  });
});

interface McpCallResult {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
}

function asCallResult(result: unknown): McpCallResult {
  if (!result || typeof result !== "object" || !Array.isArray((result as { content?: unknown }).content)) throw new Error("Expected an immediate MCP tool result.");
  return result as McpCallResult;
}

function structuredData(result: unknown): unknown {
  const callResult = asCallResult(result);
  expect(callResult.structuredContent).toMatchObject({ ok: true, artifacts: expect.any(Array), warnings: expect.any(Array) });
  return callResult.structuredContent?.data;
}
