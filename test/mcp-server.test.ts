import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import type { ActionResult, BrowserAction, BrowserSnapshot, BrowserTarget, DebuggerBreakpoint, DebuggerSnapshot, EvaluationResult, OperationContext } from "../src/domain/types.js";
import type { BrowserAdapter, BrowserStartOptions, SnapshotOptions } from "../src/adapters/browser.js";
import { SessionManager } from "../src/core/session-manager.js";
import { createServer } from "../src/index.js";

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

  async start(options: BrowserStartOptions): Promise<BrowserTarget> {
    this.target.url = options.url;
    return { ...this.target };
  }
  async close(): Promise<void> { this.closed = true; this.release?.(); }
  targetIdentity(): string | null { return this.target.targetId ?? null; }
  browserVersion(): string | null { return "mcp-scripted"; }
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
    return {
      url: this.target.url,
      title: this.target.title,
      viewport: this.target.viewport,
      dom: { bodyText, elements: [] },
      console: [],
      network: [],
      screenshotPath: null,
      debugger: { paused: false, reason: null, callFrames: [], breakpoints: [] },
      react: null,
      next: null,
      vite: null,
      warnings: [],
      observations: {
        url: { state: "pass", freshness: "fresh", provenance: "browser" },
        dom: { state: "pass", freshness: "fresh", provenance: "browser" },
        console: { state: "pass", freshness: "fresh", provenance: "browser" },
      },
    };
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
    const replayTool = listed.tools.find((tool) => tool.name === "web_replay_seek");
    expect(replayTool?.description).toContain("mutate live state");
    expect(replayTool?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
    const sessionTool = listed.tools.find((tool) => tool.name === "web_session_start");
    expect(sessionTool?.description).toContain("Chromium or Safari");
    expect(sessionTool?.inputSchema.properties).toHaveProperty("viewport");
    const reproTool = listed.tools.find((tool) => tool.name === "web_repro_record");
    expect(reproTool?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
    expect(reproTool?.inputSchema.properties).toEqual(expect.objectContaining({ sessionId: expect.anything(), failureSignature: expect.anything(), acceptanceChecks: expect.anything() }));

    const result = await client.callTool({
      name: "web_project_detect",
      arguments: { projectRoot: resolve("fixtures/vanilla") },
    });
    expect(result.isError).not.toBe(true);
    const text = result.content?.find((item) => item.type === "text");
    expect(text && "text" in text ? text.text : "").toContain('"vanilla"');

    const legacy = await client.callTool({
      name: "web_repro_record",
      arguments: { name: "legacy", url: "http://127.0.0.1:4173/", actions: [], checks: [] },
    });
    expect(legacy.isError).toBe(true);
    expect(legacy.content?.find((item) => item.type === "text" && item.text.includes("Unrecognized key: \"checks\""))).toBeTruthy();

    const bareWait = await client.callTool({
      name: "web_browser_action",
      arguments: { sessionId: "00000000-0000-0000-0000-000000000000", action: { kind: "wait", timeoutMs: 10 } },
    });
    expect(bareWait.isError).toBe(true);
    expect(bareWait.content?.find((item) => item.type === "text" && item.text.includes("Invalid arguments"))).toBeTruthy();

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

    const startResult = await client.callTool({ name: "web_session_start", arguments: { projectRoot: resolve("fixtures/vanilla"), url: "http://127.0.0.1:4173/" } });
    const session = JSON.parse(startResult.content?.find((item) => item.type === "text")?.text ?? "{}");
    const secret = "mcp-secret-value";
    const recordResult = await client.callTool({
      name: "web_repro_record",
      arguments: {
        sessionId: session.id,
        name: "MCP scenario",
        url: `http://127.0.0.1:4173/?token=${secret}`,
        actions: [{ kind: "fill", selector: "#amount", value: secret }],
        failureSignature: [{ kind: "textContains", value: "Bug", expected: "pass" }],
        acceptanceChecks: [{ kind: "textContains", value: "Fixed" }],
        buildReference: { source: "caller", value: "build-before" },
      },
    });
    expect(recordResult.isError).not.toBe(true);
    const scenario = JSON.parse(recordResult.content?.find((item) => item.type === "text")?.text ?? "{}");
    expect(scenario.baseline.status).toBe("reproduced");
    expect(scenario.url).toBe("http://127.0.0.1:4173/");
    expect(scenario).not.toHaveProperty("riskSignals");
    expect(scenario).not.toHaveProperty("representativeEvidence");
    expect(JSON.stringify(scenario)).not.toContain(secret);

    const verifyResult = await client.callTool({ name: "web_fix_verify", arguments: { sessionId: session.id, scenarioId: scenario.id, buildReference: { source: "caller", value: "build-after" } } });
    expect(verifyResult.isError).not.toBe(true);
    const verification = JSON.parse(verifyResult.content?.find((item) => item.type === "text")?.text ?? "{}");
    expect(verification.outcome).toBe("verified");
    expect(verification.level).toBe("quick");
    expect(verification).not.toHaveProperty("passed");
    expect(verification).not.toHaveProperty("effectiveLevel");
    expect(verification).not.toHaveProperty("representativeEvidence");
    expect(verification).not.toHaveProperty("escalationReasons");
    expect(JSON.stringify(verification)).not.toContain(secret);

    const legacyBuildReference = await client.callTool({
      name: "web_repro_record",
      arguments: {
        sessionId: session.id,
        name: "legacy build shape",
        url: "http://127.0.0.1:4173/",
        actions: [],
        failureSignature: [{ kind: "textContains", value: "Bug", expected: "pass" }],
        acceptanceChecks: [{ kind: "textContains", value: "Fixed" }],
        buildReference: "legacy-build",
      },
    });
    expect(legacyBuildReference.isError).toBe(true);

    adapter.hangActions = true;
    const controller = new AbortController();
    const cancellation = client.callTool({ name: "web_browser_action", arguments: { sessionId: session.id, action: { kind: "click", selector: "#hang" } } }, undefined, { signal: controller.signal });
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
    await expect(manager.capture(session.id, false)).rejects.toMatchObject({ code: "SESSION_UNUSABLE" });
    await manager.close(session.id);
    expect(adapter.closed).toBe(true);

    await client.close();
    await server.close();
  });
});
