import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type {
  DirectBrowserAction,
  ReplayableBrowserAction,
  BrowserLocator,
  FailureSignatureEntry,
  NextInspection,
  ScenarioCheck,
  ScenarioRiskSignals,
  OperationContext,
  VerificationLevel,
  ScenarioCheckpoint,
  ViewportContract,
  EvidenceBundle,
  PublicReproScenario,
  VerificationResult,
  CaptureView,
  IssueCaptureResult,
} from "./domain/types.js";
import { BROWSER_PRESS_KEYS, CAPTURE_SURFACES, MAX_MCP_OPERATION_MS } from "./domain/types.js";
import { SessionManager } from "./core/session-manager.js";
import { ProcessRegistry, registryStartupDiagnostic } from "./core/process-registry.js";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./core/version.js";
import { ArtifactStore, type ScreenshotCandidate } from "./core/artifact-store.js";
import { errorToolResult, successToolResult, toolOutputSchemaFor } from "./core/mcp-response.js";
import { CAPTURE_ARTIFACT, type InternalIssueCaptureResult } from "./core/session-evidence.js";
import { directActionSchema, toolDataSchemas } from "./domain/wire-schemas.js";

export { ArtifactStore, ProcessRegistry, SessionManager };

const DEFAULT_PROJECT_ROOT = process.cwd();
const MCP_OPERATION_BUDGET_MS = MAX_MCP_OPERATION_MS;
export const WEB_DEBUG_TOOL_ANNOTATIONS = {
  web_project_detect: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  web_session_start: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  web_session_status: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  web_browser_action: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  web_issue_capture: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  web_next_inspect: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  web_replay_seek: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  web_breakpoint_set: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  web_debug_control: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  web_debug_evaluate: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  web_repro_record: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  web_fix_verify: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  web_session_close: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
} as const satisfies Record<string, ToolAnnotations>;
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
  z.object({ kind: z.literal("navigate"), url: z.string().max(2_048).url() }).strict(),
  z.object({ kind: z.literal("click"), locator: locatorSchema }).strict(),
  z.object({ kind: z.literal("fill"), locator: locatorSchema, value: z.string().max(10_000) }).strict(),
  z.object({ kind: z.literal("press"), locator: locatorSchema, key: z.enum(BROWSER_PRESS_KEYS) }).strict(),
  z.object({ kind: z.literal("select"), locator: locatorSchema, value: z.string().min(1).max(500) }).strict(),
  z.object({ kind: z.literal("check"), locator: locatorSchema, checked: z.boolean() }).strict(),
  z.object({ kind: z.literal("hover"), locator: locatorSchema }).strict(),
  z.object({ kind: z.literal("scroll"), locator: locatorSchema }).strict(),
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
const viewportContractSchema = z.object({
  name: z.string().min(1).max(40),
  width: z.number().int().min(320).max(3_840),
  height: z.number().int().min(240).max(2_160),
}).strict();

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
const captureSurfaceSchema = z.enum(CAPTURE_SURFACES);
const captureSurfacesSchema = z.array(captureSurfaceSchema).min(1).max(CAPTURE_SURFACES.length).refine(
  (surfaces) => new Set(surfaces).size === surfaces.length,
  { message: "Capture surfaces must be unique." },
);
const captureViewSchema = z.discriminatedUnion("profile", [
  z.object({ profile: z.literal("summary") }).strict(),
  z.object({ profile: z.literal("full") }).strict(),
  z.object({ profile: z.literal("include"), surfaces: captureSurfacesSchema }).strict(),
  z.object({ profile: z.literal("delta"), cursor: z.string().min(1).max(200), surfaces: captureSurfacesSchema.optional() }).strict(),
]);
const toolOutputSchemas = {
  web_project_detect: toolOutputSchemaFor(toolDataSchemas.web_project_detect),
  web_session_start: toolOutputSchemaFor(toolDataSchemas.web_session_start),
  web_session_status: toolOutputSchemaFor(toolDataSchemas.web_session_status),
  web_browser_action: toolOutputSchemaFor(toolDataSchemas.web_browser_action),
  web_issue_capture: toolOutputSchemaFor(toolDataSchemas.web_issue_capture),
  web_next_inspect: toolOutputSchemaFor(toolDataSchemas.web_next_inspect),
  web_replay_seek: toolOutputSchemaFor(toolDataSchemas.web_replay_seek),
  web_breakpoint_set: toolOutputSchemaFor(toolDataSchemas.web_breakpoint_set),
  web_debug_control: toolOutputSchemaFor(toolDataSchemas.web_debug_control),
  web_debug_evaluate: toolOutputSchemaFor(toolDataSchemas.web_debug_evaluate),
  web_repro_record: toolOutputSchemaFor(toolDataSchemas.web_repro_record),
  web_fix_verify: toolOutputSchemaFor(toolDataSchemas.web_fix_verify),
  web_session_close: toolOutputSchemaFor(toolDataSchemas.web_session_close),
} as const;

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

export function createServer(manager = new SessionManager(), registry?: ProcessRegistry, artifactStore = new ArtifactStore()): McpServer {
  const activeSessionCount = () => manager.list().length;
  const respondFor = <T>(toolName: keyof typeof toolDataSchemas, operation: () => T | Promise<T>, screenshots?: (value: T) => ScreenshotCandidate[]) => respond(operation, registry, artifactStore, activeSessionCount, toolDataSchemas[toolName], screenshots);
  const server = new McpServer(
    { name: PACKAGE_NAME, version: PACKAGE_VERSION },
    {
      instructions:
        "Use this local server for bounded, evidence-first debugging of an explicitly selected local web target. For an explicit Web Debug request, call web_project_detect first; if the bundled tool is unavailable, report MCP_CLIENT_BINDING_UNAVAILABLE and stop without substituting Playwright, Puppeteer, raw CDP, a direct SDK transport, or a naked server process. Then use web_session_start and web_issue_capture. Project eligibility and the selected browser's negotiated runtime capabilities are reported separately. Capture defaults to a compact non-pixel summary; request full, included, or cursor-based delta surfaces only when needed. Browser actions and scenario checks use exact CSS or semantic locators backed by fresh live probes. Chromium supports isolated loopback TLS opt-in, project-contained disposable auth, computed accessibility diagnostics, named checkpoints, bounded desktop/mobile matrices, and an opt-in direct-only WebMCP page action with truthful page-API provenance; auth-seeded or post-WebMCP sessions suppress screenshots. Safari remains CSS-only and reports semantic accessibility, TLS, auth, matrix, and WebMCP capabilities as unavailable. Remote targets and side effects require explicit opt-in. Data is bounded/redacted; close sessions when done.",
      capabilities: { tools: {} },
    },
  );

  server.registerResource(
    "captured-screenshot",
    new ResourceTemplate("web-debug://artifact/{id}", { list: undefined }),
    { title: "Captured Web Debug screenshot", description: "A bounded screenshot captured by web-debug-mcp.", mimeType: "image/png" },
    async (uri, { id }) => {
      let requestStarted = false;
      try {
        if (registry) {
          await registry.beginRequest();
          requestStarted = true;
        }
        return await artifactStore.read(String(id), uri);
      } finally {
        if (requestStarted) await registry!.endRequest(activeSessionCount).catch(() => undefined);
      }
    },
  );

  server.registerTool(
    "web_project_detect",
    {
      title: "Detect web project eligibility",
      description: "Inspect the exact root, distinguish confirmed application markers from weak dependency candidates, and report bounded workspace candidates without starting a process or selecting a child.",
      inputSchema: z.object({ projectRoot: z.string().min(1).max(4_096).default(DEFAULT_PROJECT_ROOT) }),
      outputSchema: toolOutputSchemas.web_project_detect,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_project_detect,
    },
    async ({ projectRoot }) => respondFor("web_project_detect", () => manager.detect(projectRoot)),
  );

  server.registerTool(
    "web_session_start",
    {
      title: "Start web debug session",
      description: "Start or attach to an explicitly selected local Chromium or Safari page using an explicit URL and CDP, WebDriver, or executable settings. Chromium can opt into one guarded HTTPS loopback origin and a project-contained disposable auth fixture; attached Chromium can supply targetId to pin the exact page. Safari remains strict and CSS-only.",
      inputSchema: z.object({
        projectRoot: z.string().min(1).max(4_096).default(DEFAULT_PROJECT_ROOT),
        url: z.string().max(2_048).url(),
        targetId: z.string().min(1).max(200).optional(),
        browser: z.enum(["chromium", "safari"]).default("chromium"),
        cdpEndpoint: z.string().max(2_048).url().optional(),
        webdriverEndpoint: z.string().max(2_048).url().optional(),
        executablePath: z.string().min(1).max(4_096).optional(),
        headless: z.boolean().default(true),
        allowRemote: z.boolean().default(false),
        viewport: viewportSchema.optional(),
        tls: z.enum(["strict", "allow-insecure-loopback"]).default("strict"),
        authFixture: z.object({ kind: z.literal("playwrightStorageState"), path: z.string().min(1).max(2_048) }).strict().optional(),
      }),
      outputSchema: toolOutputSchemas.web_session_start,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_session_start,
    },
    async (input, extra) => respondFor("web_session_start", () => manager.start(input, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_session_status",
    {
      title: "Read web debug session status",
      description: "List active sessions or read one summary with separate project eligibility and negotiated live runtime capabilities.",
      inputSchema: z.object({ sessionId: z.string().uuid().optional() }),
      outputSchema: toolOutputSchemas.web_session_status,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_session_status,
    },
    async ({ sessionId }) => respondFor("web_session_status", () => (sessionId ? manager.status(sessionId) : manager.list())),
  );

  server.registerTool(
    "web_browser_action",
    {
      title: "Perform bounded browser action",
      description: "Navigate, click, fill, press, select, check, hover, scroll, wait, or reload with exact locators, or execute one explicitly authorized direct WebMCP page tool. WebMCP calls are bounded, opaque, non-replayable, and never retried.",
      inputSchema: z.object({ sessionId: z.string().uuid(), action: directActionSchema }),
      outputSchema: toolOutputSchemas.web_browser_action,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_browser_action,
    },
    async ({ sessionId, action }, extra) => respondFor("web_browser_action", () => manager.act(sessionId, action as DirectBrowserAction, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_issue_capture",
    {
      title: "Capture bounded web issue evidence",
      description: "Capture redacted browser evidence with a compact summary by default, or explicitly request full, selected, or cursor-based changed surfaces. WebMCP metadata is discover-only and untrusted; screenshots are opt-in through full/include and remain suppressed for private input, auth-seeded sessions, or any session after a direct WebMCP attempt.",
      inputSchema: z.object({ sessionId: z.string().uuid(), view: captureViewSchema.default({ profile: "summary" }) }).strict(),
      outputSchema: toolOutputSchemas.web_issue_capture,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_issue_capture,
    },
    async ({ sessionId, view }, extra) => respondFor("web_issue_capture",
      () => manager.capture(sessionId, view as CaptureView, requestContext(extra.signal)),
      (value) => screenshotCandidatesFromCapture(value),
    ),
  );

  server.registerTool(
    "web_next_inspect",
    {
      title: "Inspect Next.js runtime",
      description: "Compile one Next.js route or resolve one Server Action through the selected local Next development server.",
      inputSchema: z.object({ sessionId: z.string().uuid(), inspection: nextInspectionSchema }),
      outputSchema: toolOutputSchemas.web_next_inspect,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_next_inspect,
    },
    async ({ sessionId, inspection }, extra) => respondFor("web_next_inspect", () => manager.inspectNext(sessionId, inspection as NextInspection, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_replay_seek",
    {
      title: "Seek captured web replay frame",
      description: "Return one retained, redacted replay frame; set restore=true to replay its safely restorable actions into the browser and mutate live state.",
      inputSchema: z.object({ sessionId: z.string().uuid(), frameIndex: z.number().int().min(0).max(10_000), restore: z.boolean().default(false) }),
      outputSchema: toolOutputSchemas.web_replay_seek,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_replay_seek,
    },
    async ({ sessionId, frameIndex, restore }, extra) => respondFor("web_replay_seek", () => manager.seekReplay(sessionId, frameIndex, restore, requestContext(extra.signal))),
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
      outputSchema: toolOutputSchemas.web_breakpoint_set,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_breakpoint_set,
    },
    async ({ sessionId, sourceUrl, line, column }, extra) => respondFor("web_breakpoint_set", () => manager.setBreakpoint(sessionId, { sourceUrl, line, column }, requestContext(extra.signal))),
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
      outputSchema: toolOutputSchemas.web_debug_control,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_debug_control,
    },
    async ({ sessionId, action }, extra) => respondFor("web_debug_control", () => manager.control(sessionId, action, requestContext(extra.signal))),
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
      outputSchema: toolOutputSchemas.web_debug_evaluate,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_debug_evaluate,
    },
    async ({ sessionId, expression, allowSideEffects }, extra) => respondFor("web_debug_evaluate", () => manager.evaluate(sessionId, expression, allowSideEffects, requestContext(extra.signal))),
  );

  server.registerTool(
    "web_repro_record",
    {
      title: "Record reproducible web flow",
      description: "Execute and store a bounded pre-fix reproduction with exact locator checks, named ordered checkpoints, optional desktop/mobile viewport contracts and failure scope, and adaptive-risk signals.",
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        name: z.string().min(1).max(200),
        url: z.string().max(2_048).url(),
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
      outputSchema: toolOutputSchemas.web_repro_record,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_repro_record,
    },
    async ({ sessionId, name, url, actions, failureSignature, acceptanceChecks, regressionChecks, checkpoints, viewports, failureViewports, risks, requestedLevel, buildReference, serverStateReset }, extra) =>
      respondFor("web_repro_record", () => runWithProgress(extra, "baseline", (operation) => manager.recordScenario({
        sessionId,
        name,
        url,
        actions: actions as ReplayableBrowserAction[],
        failureSignature: failureSignature as FailureSignatureEntry[],
        acceptanceChecks: acceptanceChecks as ScenarioCheck[],
        regressionChecks: regressionChecks as ScenarioCheck[] | undefined,
        checkpoints: checkpoints as ScenarioCheckpoint[] | undefined,
        viewports: viewports as ViewportContract[] | undefined,
        failureViewports: failureViewports as string[] | undefined,
        risks: risks as ScenarioRiskSignals | undefined,
        requestedLevel: requestedLevel as VerificationLevel | undefined,
        buildReference,
        serverStateReset: serverStateReset as { action?: ReplayableBrowserAction; readyCheck?: ScenarioCheck } | undefined,
      }, operation)), (value) => screenshotCandidatesFromScenario(value)),
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
      outputSchema: toolOutputSchemas.web_fix_verify,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_fix_verify,
    },
    async ({ sessionId, scenarioId, requestedLevel, buildReference }, extra) => respondFor("web_fix_verify",
      () => runWithProgress(extra, "post-fix", (operation) => manager.verifyScenario({ sessionId, scenarioId, requestedLevel: requestedLevel as VerificationLevel | undefined, buildReference }, operation)),
      (value) => screenshotCandidatesFromVerification(value),
    ),
  );

  server.registerTool(
    "web_session_close",
    {
      title: "Close web debug session",
      description: "Close the selected session and release any browser resources owned by it.",
      inputSchema: z.object({ sessionId: z.string().uuid(), artifactPolicy: z.enum(["retain", "delete"]).default("retain") }),
      outputSchema: toolOutputSchemas.web_session_close,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_session_close,
    },
    async ({ sessionId, artifactPolicy }) => respondFor("web_session_close", () => manager.close(sessionId, artifactPolicy)),
  );

  return server;
}

function requestContext(signal?: AbortSignal): OperationContext {
  const now = performance.now();
  return { signal, clock: () => performance.now(), deadline: now + MCP_OPERATION_BUDGET_MS };
}

async function runWithProgress<T>(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  phase: "baseline" | "post-fix",
  operation: (context: OperationContext) => Promise<T>,
): Promise<T> {
  const token = extra._meta?.progressToken;
  let lastProgress = 0;
  const send = async (progress: number, message: string): Promise<void> => {
    if (token === undefined) return;
    const boundedProgress = Math.max(lastProgress, Math.min(11, progress));
    lastProgress = boundedProgress;
    await extra.sendNotification({
      method: "notifications/progress",
      params: { progressToken: token, progress: boundedProgress, total: 11, message },
    }).catch(() => undefined);
  };
  const context = requestContext(extra.signal);
  context.progress = async (event) => {
    const progress = event.event === "attempt-start" ? (event.ordinal * 2) - 1 : event.ordinal * 2;
    const termination = event.termination ? ` (${String(event.termination).slice(0, 80)})` : "";
    await send(progress, `${event.phase} ${event.event} ${event.ordinal} at ${event.level}${termination}`);
  };
  await send(0, `${phase} phase started`);
  try {
    return await operation(context);
  } finally {
    await send(11, `${phase} phase finished`);
  }
}

async function respond<T>(
  operation: () => T | Promise<T>,
  registry: ProcessRegistry | undefined,
  artifactStore: ArtifactStore,
  activeSessionCount: () => number,
  dataSchema: z.ZodType,
  screenshots?: (value: T) => ScreenshotCandidate[],
) {
  let accounted = false;
  try {
    if (registry) { await registry.beginRequest(); accounted = true; }
    const value = await operation();
    return await successToolResult(value, artifactStore, screenshots?.(value) ?? [], dataSchema);
  } catch (error) {
    return errorToolResult(error);
  } finally {
    if (accounted) await registry?.endRequest(activeSessionCount).catch(() => undefined);
  }
}

function screenshotCandidatesFromEvidence(evidence: EvidenceBundle | null | undefined, name: string): ScreenshotCandidate[] {
  const candidate = evidence as Partial<EvidenceBundle> | null | undefined;
  const path = candidate?.browser?.screenshotPath;
  const artifactDir = candidate?.session?.artifactDir;
  if (!path || !artifactDir) return [];
  return [{ path, artifactDir, name: `${name}.png` }];
}

function screenshotCandidatesFromCapture(result: IssueCaptureResult): ScreenshotCandidate[] {
  const artifact = (result as InternalIssueCaptureResult)[CAPTURE_ARTIFACT];
  return artifact ? [{ path: artifact.path, artifactDir: artifact.artifactDir, name: "issue-capture.png" }] : [];
}

function screenshotCandidatesFromScenario(scenario: PublicReproScenario): ScreenshotCandidate[] {
  return screenshotCandidatesFromEvidence((scenario as Partial<PublicReproScenario>).baseline?.evidence, "baseline");
}

function screenshotCandidatesFromVerification(result: VerificationResult): ScreenshotCandidate[] {
  const evidence = (result as Partial<VerificationResult>).evidence;
  return [
    ...screenshotCandidatesFromEvidence(evidence?.baseline, "baseline"),
    ...screenshotCandidatesFromEvidence(evidence?.postFix, "post-fix"),
  ];
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
  try {
    await startStdioServer();
  } catch (error) {
    process.stderr.write(`${registryStartupDiagnostic(error)}\n`);
    process.exitCode = 1;
  }
}
