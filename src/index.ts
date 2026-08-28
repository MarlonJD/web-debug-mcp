import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import type {
  BrowserAction,
  BrowserLocator,
  FailureSignatureEntry,
  NextInspection,
  ScenarioCheck,
  ScenarioRiskSignals,
  OperationContext,
  VerificationLevel,
  ScenarioCheckpoint,
  ViewportContract,
} from "./domain/types.js";
import { MAX_MCP_OPERATION_MS } from "./domain/types.js";
import { WebDebugError, errorMessage } from "./core/errors.js";
import { SessionManager } from "./core/session-manager.js";
import { ProcessRegistry } from "./core/process-registry.js";
import { boundText, redactText, redactValue } from "./core/redaction.js";

const DEFAULT_PROJECT_ROOT = process.cwd();
const MCP_OPERATION_BUDGET_MS = MAX_MCP_OPERATION_MS;
const viewportSchema = z.object({
  width: z.number().int().min(320).max(3_840),
  height: z.number().int().min(240).max(2_160),
}).strict();

const locatorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("css"), value: z.string().min(1).max(500) }).strict(),
  z.object({ kind: z.literal("role"), role: z.string().min(1).max(100), name: z.string().min(1).max(300).optional() }).strict(),
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(500) }).strict(),
  z.object({ kind: z.literal("label"), text: z.string().min(1).max(500) }).strict(),
  z.object({ kind: z.literal("testId"), value: z.string().min(1).max(500) }).strict(),
]);

const locatorPropertySchema = z.enum(["count", "visible", "enabled", "checked", "text"]);
const probeExpectedSchema = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);

const browserActionSchema = z.union([
  z.object({ kind: z.literal("navigate"), url: z.string().url() }).strict(),
  z.object({ kind: z.literal("click"), locator: locatorSchema }).strict(),
  z.object({ kind: z.literal("fill"), locator: locatorSchema, value: z.string().max(10_000) }).strict(),
  z.object({ kind: z.literal("wait"), locator: locatorSchema, property: locatorPropertySchema, expected: probeExpectedSchema, timeoutMs: z.number().int().min(0).max(30_000).optional() }).strict(),
  z.object({ kind: z.literal("reload") }).strict(),
]);

const scenarioCheckSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("route"), path: z.string().startsWith("/").min(1).max(2_048) }).strict(),
  z.object({ kind: z.literal("locatorText"), locator: locatorSchema, text: z.string().min(1).max(500), match: z.enum(["exact", "contains"]).default("contains") }).strict(),
  z.object({ kind: z.literal("locatorCount"), locator: locatorSchema, count: z.number().int().min(0).max(1_000_000) }).strict(),
  z.object({ kind: z.literal("locatorVisible"), locator: locatorSchema, visible: z.boolean() }).strict(),
  z.object({ kind: z.literal("locatorEnabled"), locator: locatorSchema, enabled: z.boolean() }).strict(),
  z.object({ kind: z.literal("locatorDisabled"), locator: locatorSchema, disabled: z.boolean() }).strict(),
  z.object({ kind: z.literal("locatorChecked"), locator: locatorSchema, checked: z.boolean() }).strict(),
  z.object({ kind: z.literal("noConsoleErrors") }).strict(),
]);

const failureSignatureSchema = z.union([
  z.object({ kind: z.literal("route"), path: z.string().startsWith("/").min(1).max(2_048), expected: z.enum(["pass", "fail"]) }).strict(),
  z.object({ kind: z.literal("locatorText"), locator: locatorSchema, text: z.string().min(1).max(500), match: z.enum(["exact", "contains"]).default("contains"), expected: z.enum(["pass", "fail"]) }).strict(),
  z.object({ kind: z.literal("locatorCount"), locator: locatorSchema, count: z.number().int().min(0).max(1_000_000), expected: z.enum(["pass", "fail"]) }).strict(),
  z.object({ kind: z.literal("locatorVisible"), locator: locatorSchema, visible: z.boolean(), expected: z.enum(["pass", "fail"]) }).strict(),
  z.object({ kind: z.literal("locatorEnabled"), locator: locatorSchema, enabled: z.boolean(), expected: z.enum(["pass", "fail"]) }).strict(),
  z.object({ kind: z.literal("locatorDisabled"), locator: locatorSchema, disabled: z.boolean(), expected: z.enum(["pass", "fail"]) }).strict(),
  z.object({ kind: z.literal("locatorChecked"), locator: locatorSchema, checked: z.boolean(), expected: z.enum(["pass", "fail"]) }).strict(),
  z.object({ kind: z.literal("noConsoleErrors"), expected: z.enum(["pass", "fail"]) }).strict(),
]);

const checkpointProbeSchema = z.object({
  name: z.string().min(1).max(80),
  locator: locatorSchema,
  property: locatorPropertySchema,
  expected: probeExpectedSchema,
  match: z.enum(["exact", "contains"]).optional(),
}).strict();
const checkpointSchema = z.object({
  name: z.string().min(1).max(80),
  offset: z.number().int().min(0).max(100),
  probes: z.array(checkpointProbeSchema).max(8),
  route: z.string().startsWith("/").min(1).max(2_048).optional(),
}).strict();
const viewportContractSchema = z.union([
  z.object({ name: z.string().min(1).max(40), width: z.number().int().min(320).max(3_840), height: z.number().int().min(240).max(2_160) }).strict(),
  z.object({ name: z.string().min(1).max(40), size: viewportSchema }).strict().transform(({ name, size }) => ({ name, width: size.width, height: size.height })),
  z.object({ name: z.string().min(1).max(40), viewport: viewportSchema }).strict().transform(({ name, viewport }) => ({ name, width: viewport.width, height: viewport.height })),
]);

const risksSchema = z.object({
  async: z.boolean().optional(),
  timing: z.boolean().optional(),
  concurrency: z.boolean().optional(),
  browserStateLeakage: z.boolean().optional(),
  serverStateLeakage: z.boolean().optional(),
  priorFlakiness: z.boolean().optional(),
}).strict();

const buildReferenceSchema = z.object({
  source: z.literal("caller"),
  value: z.string().min(1).max(200),
}).strict();

const levelSchema = z.enum(["quick", "standard", "strict"]);

const nextInspectionSchema = z.union([
  z.object({
    kind: z.literal("compileRoute"),
    routeSpecifier: z.string().startsWith("/").min(1).max(500).optional(),
    path: z.string().startsWith("/").min(1).max(2_000).optional(),
  }).refine((input) => Boolean(input.routeSpecifier) !== Boolean(input.path), {
    message: "Provide exactly one of routeSpecifier or path for compileRoute.",
  }),
  z.object({
    kind: z.literal("resolveServerAction"),
    actionId: z.string().min(1).max(200),
  }),
]);

export function createServer(manager = new SessionManager(), registry?: ProcessRegistry): McpServer {
  const respondFor = <T>(operation: () => T | Promise<T>) => respond(operation, registry);
  const server = new McpServer(
    { name: "web-debug-mcp", version: "0.3.1" },
    {
      instructions:
        "Use this local server for bounded, evidence-first debugging of an explicitly selected local web target. Start with web_project_detect, then web_session_start and web_issue_capture. Browser actions and scenario checks use exact CSS or semantic locators backed by fresh live probes. Chromium supports isolated loopback TLS opt-in, project-contained disposable auth, computed accessibility diagnostics, named checkpoints, and bounded desktop/mobile matrices; auth-seeded sessions suppress screenshots. Safari remains CSS-only and reports semantic accessibility, TLS, auth, and matrix capabilities as unavailable. Remote targets and side effects require explicit opt-in. Data is bounded/redacted; close sessions when done.",
      capabilities: { tools: {} },
    },
  );

  server.registerTool(
    "web_project_detect",
    {
      title: "Detect web project capabilities",
      description: "Inspect known project markers and report supported browser/framework capabilities without starting a process.",
      inputSchema: z.object({ projectRoot: z.string().min(1).default(DEFAULT_PROJECT_ROOT) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ projectRoot }) => respondFor(() => manager.detect(projectRoot)),
  );

  server.registerTool(
    "web_session_start",
    {
      title: "Start web debug session",
      description: "Start or attach to an explicitly selected local Chromium or Safari page using an explicit URL and CDP, WebDriver, or executable settings. Chromium can opt into one guarded HTTPS loopback origin and a project-contained disposable auth fixture; attached Chromium can supply targetId to pin the exact page. Safari remains strict and CSS-only.",
      inputSchema: z.object({
        projectRoot: z.string().min(1).default(DEFAULT_PROJECT_ROOT),
        url: z.string().url(),
        targetId: z.string().min(1).max(200).optional(),
        browser: z.enum(["chromium", "safari"]).default("chromium"),
        cdpEndpoint: z.string().url().optional(),
        webdriverEndpoint: z.string().url().optional(),
        executablePath: z.string().min(1).optional(),
        headless: z.boolean().default(true),
        allowRemote: z.boolean().default(false),
        viewport: viewportSchema.optional(),
        tls: z.enum(["strict", "allow-insecure-loopback"]).default("strict"),
        authFixture: z.object({ kind: z.literal("playwrightStorageState"), path: z.string().min(1).max(2_048) }).strict().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input, extra) => respondFor(async () => { const result = await manager.start(input, requestContext(extra.signal)); await registry?.sessionStarted(); return result; }),
  );

  server.registerTool(
    "web_session_status",
    {
      title: "Read web debug session status",
      description: "List active sessions or read one session summary.",
      inputSchema: z.object({ sessionId: z.string().uuid().optional() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ sessionId }) => respondFor(() => (sessionId ? manager.status(sessionId) : manager.list())),
  );

  server.registerTool(
    "web_browser_action",
    {
      title: "Perform bounded browser action",
      description: "Navigate, click, fill, wait, or reload within the selected same-origin target; actions use exact locators and fresh live probe waits.",
      inputSchema: z.object({ sessionId: z.string().uuid(), action: browserActionSchema }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sessionId, action }, extra) => respondFor(() => manager.act(sessionId, action as BrowserAction, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_issue_capture",
    {
      title: "Capture bounded web issue evidence",
      description: "Combine browser state, DOM summary, console, network metadata, debugger/framework evidence, computed Chromium accessibility diagnostics, replay state, and an optional screenshot into one redacted evidence bundle. Auth-seeded sessions suppress screenshots.",
      inputSchema: z.object({ sessionId: z.string().uuid(), captureScreenshot: z.boolean().default(true) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ sessionId, captureScreenshot }, extra) => respondFor(() => manager.capture(sessionId, captureScreenshot, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_next_inspect",
    {
      title: "Inspect Next.js runtime",
      description: "Compile one Next.js route or resolve one Server Action through the selected local Next development server.",
      inputSchema: z.object({ sessionId: z.string().uuid(), inspection: nextInspectionSchema }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ sessionId, inspection }, extra) => respondFor(() => manager.inspectNext(sessionId, inspection as NextInspection, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_replay_seek",
    {
      title: "Seek captured web replay frame",
      description: "Return one retained, redacted replay frame; set restore=true to replay its safely restorable actions into the browser and mutate live state.",
      inputSchema: z.object({ sessionId: z.string().uuid(), frameIndex: z.number().int().min(0).max(10_000), restore: z.boolean().default(false) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sessionId, frameIndex, restore }, extra) => respondFor(() => manager.seekReplay(sessionId, frameIndex, restore, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_breakpoint_set",
    {
      title: "Set JavaScript breakpoint",
      description: "Set a breakpoint by source URL and one-based line number through the local Chromium debugger.",
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        sourceUrl: z.string().min(1).max(2_000),
        line: z.number().int().min(1),
        column: z.number().int().min(1).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sessionId, sourceUrl, line, column }, extra) => respondFor(() => manager.setBreakpoint(sessionId, { sourceUrl, line, column }, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_debug_control",
    {
      title: "Control paused JavaScript debugger",
      description: "Resume or step a paused local JavaScript target.",
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        action: z.enum(["resume", "stepOver", "stepInto", "stepOut"]),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sessionId, action }, extra) => respondFor(() => manager.control(sessionId, action, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_debug_evaluate",
    {
      title: "Evaluate JavaScript expression",
      description: "Evaluate an expression in the local page runtime. Side effects are rejected unless explicitly enabled.",
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        expression: z.string().min(1).max(5_000),
        allowSideEffects: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sessionId, expression, allowSideEffects }, extra) => respondFor(() => manager.evaluate(sessionId, expression, allowSideEffects, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_repro_record",
    {
      title: "Record reproducible web flow",
      description: "Execute and store a bounded pre-fix reproduction with exact locator checks, named ordered checkpoints, optional desktop/mobile viewport contracts and failure scope, and adaptive-risk signals.",
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        name: z.string().min(1).max(200),
        url: z.string().url(),
        actions: z.array(browserActionSchema).max(100),
        failureSignature: z.array(failureSignatureSchema).min(1).max(64),
        acceptanceChecks: z.array(scenarioCheckSchema).min(1).max(64),
        regressionChecks: z.array(scenarioCheckSchema).max(64).optional(),
        checkpoints: z.array(checkpointSchema).max(16).optional(),
        viewports: z.array(viewportContractSchema).max(4).optional(),
        failureViewports: z.array(z.string().min(1).max(40)).max(4).optional(),
        risks: risksSchema.optional(),
        requestedLevel: levelSchema.optional(),
        buildReference: buildReferenceSchema.optional(),
        serverStateReset: z.object({
          action: browserActionSchema.optional(),
          readyCheck: scenarioCheckSchema.optional(),
        }).strict().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sessionId, name, url, actions, failureSignature, acceptanceChecks, regressionChecks, checkpoints, viewports, failureViewports, risks, requestedLevel, buildReference, serverStateReset }, extra) =>
      respondFor(() => manager.recordScenario({
        sessionId,
        name,
        url,
        actions: actions as BrowserAction[],
        failureSignature: failureSignature as FailureSignatureEntry[],
        acceptanceChecks: acceptanceChecks as ScenarioCheck[],
        regressionChecks: regressionChecks as ScenarioCheck[] | undefined,
        checkpoints: checkpoints as ScenarioCheckpoint[] | undefined,
        viewports: viewports as ViewportContract[] | undefined,
        failureViewports: failureViewports as string[] | undefined,
        risks: risks as ScenarioRiskSignals | undefined,
        requestedLevel: requestedLevel as VerificationLevel | undefined,
        buildReference,
        serverStateReset: serverStateReset as { action?: BrowserAction; readyCheck?: ScenarioCheck } | undefined,
      }, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_fix_verify",
    {
      title: "Verify web fix against recorded flow",
      description: "Verify a stored pre-fix reproduction with adaptive bounded attempts and return verified, failed, or inconclusive evidence.",
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        scenarioId: z.string().uuid(),
        requestedLevel: levelSchema.optional(),
        buildReference: buildReferenceSchema.optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sessionId, scenarioId, requestedLevel, buildReference }, extra) => respondFor(() => manager.verifyScenario({ sessionId, scenarioId, requestedLevel: requestedLevel as VerificationLevel | undefined, buildReference }, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_session_close",
    {
      title: "Close web debug session",
      description: "Close the selected session and release any browser resources owned by it.",
      inputSchema: z.object({ sessionId: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ sessionId }) => respondFor(async () => { const result = await manager.close(sessionId); await registry?.sessionClosed(); return result; }),
  );

  return server;
}

function requestContext(signal?: AbortSignal): OperationContext {
  const now = performance.now();
  return { signal, clock: () => performance.now(), deadline: now + MCP_OPERATION_BUDGET_MS };
}

async function respond<T>(operation: () => T | Promise<T>, registry?: ProcessRegistry) {
  let accounted = false;
  try {
    if (registry) { await registry.beginRequest(); accounted = true; }
    const value = await operation();
    // Core/adapters apply redaction and bounds at their ownership boundary;
    // serializing here must not traverse the graph a second time and turn
    // valid nested evidence into depth-truncation markers.
    return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
  } catch (error) {
    const details = error instanceof WebDebugError ? { code: error.code, details: redactValue(error.details) } : undefined;
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: boundText(redactText(errorMessage(error)), 500), ...details }, null, 2) }],
    };
  } finally {
    if (accounted) await registry?.endRequest().catch(() => undefined);
  }
}

export async function startStdioServer(): Promise<void> {
  const manager = new SessionManager();
  const registry = new ProcessRegistry();
  await registry.start();
  const server = createServer(manager, registry);
  const transport = new StdioServerTransport();
  const shutdown = () => registry.requestShutdown(async () => { await manager.closeAll(); await server.close().catch(() => undefined); });
  registry.setShutdownHandler(async () => { await manager.closeAll(); await server.close().catch(() => undefined); });
  transport.onclose = () => { void shutdown(); };
  process.stdin.once("end", () => { void shutdown(); });
  process.stdin.once("close", () => { void shutdown(); });
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  try {
    await server.connect(transport);
  } catch (error) {
    await shutdown();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startStdioServer();
}
