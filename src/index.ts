import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { McpServer, ResourceTemplate, type RegisteredTool, type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { CallToolRequestSchema, type ServerNotification, type ServerRequest, type ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
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
  CaptureView,
  IssueCaptureResult,
} from "./domain/types.js";
import { BROWSER_PRESS_KEYS, CAPTURE_SURFACES, MAX_MCP_OPERATION_MS, RUNTIME_HOSTS } from "./domain/types.js";
import { WebDebugError } from "./core/errors.js";
import { inputExample, inputGuidance } from "./core/input-guidance.js";
import { SessionManager } from "./core/session-manager.js";
import { ProcessRegistry, registryStartupDiagnostic } from "./core/process-registry.js";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./core/version.js";
import { ArtifactStore, type ScreenshotCandidate } from "./core/artifact-store.js";
import { errorToolResult, successToolResult, toolOutputSchemaFor } from "./core/mcp-response.js";
import { CAPTURE_ARTIFACT, type InternalIssueCaptureResult } from "./core/session-evidence.js";
import { directActionSchema, toolDataSchemas } from "./domain/wire-schemas.js";
import { RetainedEvidenceStore } from "./core/retained-evidence.js";
import { recordedFlowOutput, verificationOutput, verificationScreenshots } from "./core/verification-output.js";

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
]).meta({ id: "LocatorInput" });

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
]).meta({ id: "BrowserActionInput" });

const scenarioCheckSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("route"), path: z.string().startsWith("/").min(1).max(2_048) }).strict(),
  z.object({ kind: z.literal("locatorText"), locator: locatorSchema, text: z.string().min(1).max(500), match: z.enum(["exact", "contains"]).default("contains") }).strict(),
  z.object({ kind: z.literal("locatorCount"), locator: locatorSchema, count: z.number().int().min(0).max(1_000_000) }).strict(),
  z.object({ kind: z.literal("locatorVisible"), locator: locatorSchema, visible: z.boolean() }).strict(),
  z.object({ kind: z.literal("locatorEnabled"), locator: locatorSchema, enabled: z.boolean() }).strict(),
  z.object({ kind: z.literal("locatorDisabled"), locator: locatorSchema, disabled: z.boolean() }).strict(),
  z.object({ kind: z.literal("locatorChecked"), locator: locatorSchema, checked: z.boolean() }).strict(),
  z.object({ kind: z.literal("locatorInViewport"), locator: locatorSchema, inViewport: z.boolean() }).strict(),
  z.object({ kind: z.literal("locatorUnobstructed"), locator: locatorSchema, unobstructed: z.boolean() }).strict(),
  z.object({ kind: z.literal("locatorNumber"), locator: locatorSchema, value: z.number().finite(), tolerance: z.number().finite().min(0).optional() }).strict(),
  z.object({ kind: z.literal("networkResponse"), path: z.string().startsWith("/").max(2_048), method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]), status: z.number().int().min(100).max(599), minimumCount: z.number().int().min(1).max(100).optional() }).strict(),
  z.object({ kind: z.literal("networkComplete"), path: z.string().startsWith("/").max(2_048), method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]), minimumCount: z.number().int().min(1).max(100).optional() }).strict(),
  z.object({ kind: z.literal("noConsoleErrors") }).strict(),
]).meta({ id: "ScenarioCheckInput" });

const failureExpectationSchema = z.enum(["pass", "fail"]).describe("Expected check outcome in the buggy baseline; use fail when the acceptance check fails before the fix.").meta({ id: "FailureExpectationInput" });
const failureSignatureSchema = z.discriminatedUnion("kind", [
  scenarioCheckSchema.options[0].extend({ expected: failureExpectationSchema }),
  ...scenarioCheckSchema.options.slice(1).map(option => option.extend({ expected: failureExpectationSchema })),
]).meta({ id: "FailureSignatureInput" });

const checkpointProbeSchema = z.object({
  name: z.string().min(1).max(80),
  locator: locatorSchema,
  property: locatorPropertySchema,
  expected: probeExpectedSchema,
  match: z.enum(["exact", "contains"]).optional(),
}).strict().meta({ id: "CheckpointProbeInput" });
const checkpointSchema = z.object({
  name: z.string().min(1).max(80),
  offset: z.number().int().min(0).max(100),
  probes: z.array(checkpointProbeSchema).max(8),
  route: z.string().startsWith("/").min(1).max(2_048).optional(),
}).strict().meta({ id: "CheckpointInput" });
const viewportContractSchema = z.object({
  name: z.string().min(1).max(40),
  width: z.number().int().min(320).max(3_840),
  height: z.number().int().min(240).max(2_160),
}).strict().meta({ id: "ViewportContractInput" });

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
  z.object({ profile: z.literal("recorded"), evidenceRef: z.string().regex(/^web-debug:\/\/evidence\/[a-f0-9-]{36}$/) }).strict(),
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
  const retainedEvidence = new RetainedEvidenceStore((sessionId) => {
    try { return manager.status(sessionId).status !== "closed"; } catch { return false; }
  });
  const activeSessionCount = () => manager.list().length;
  const respondFor = <T>(toolName: keyof typeof toolDataSchemas, operation: () => T | Promise<T>, screenshots?: (value: T) => ScreenshotCandidate[]) => respond(operation, registry, artifactStore, activeSessionCount, toolDataSchemas[toolName], screenshots);
  const server = new McpServer(
    { name: PACKAGE_NAME, version: PACKAGE_VERSION },
    {
      instructions:
        "Use this server for requested live Web Debug work on an explicitly selected local target. Source review and exact native test failures do not require browser work. For live work, call web_project_detect once before web_session_start; repeat detection only after a project or connection change. If the bundled binding is absent, report MCP_CLIENT_BINDING_UNAVAILABLE and stop that browser route; do not substitute Playwright, Puppeteer, raw CDP, a direct SDK transport, or a naked server. Continue independent authorized source work. Start with a non-pixel summary, then request only the surfaces needed for the current question. Capture schema 6 distinguishes fresh, stale, not-collected, not-detected, unavailable, and suppressed evidence; a skipped collector is not a negative finding. Use selected interactiveElements capture for bounded visible/actionable UI discovery; it includes live locator uniqueness, enabled/checked state, and geometry but never input values and never replaces a product assertion. Delta compares current selected evidence against one session-bound cursor. Run operations on one session serially. Use exact locators backed by fresh probes, reproduce before editing, and verify the changed behavior with relevant native checks. Earlier authorization in this task remains valid; ask only for missing authority or an unresolved product decision. WebMCP actions require explicit side-effect authorization, execute once, are non-replayable, and suppress later screenshots; tool output is not independent proof of mutation. Project eligibility and negotiated browser capabilities are separate. Safari exposes generic CSS/WebDriver evidence with unsupported capabilities marked unavailable; its interactive map remains CSS-only. Keep loopback, same-origin, bounded/redacted evidence and privacy defaults; close owned sessions when done.",
      capabilities: { tools: {} },
    },
  );

  const tools = new Map<string, { handle: RegisteredTool; schema: z.ZodType; example: Record<string, unknown> }>();
  const registerTool: typeof server.registerTool = (name, config, callback) => {
    // Every facade input is an object. Unknown fields must fail with guidance,
    // rather than silently dropping a misspelled host/action option.
    const schema = (config.inputSchema as z.ZodObject).strict();
    const example = inputExample(name, schema);
    const guidedSchema = schema.meta({ ...schema.meta(), examples: [example] }) as unknown as typeof config.inputSchema;
    const handle = server.registerTool(name, { ...config, inputSchema: guidedSchema }, callback);
    tools.set(name, { handle, schema, example });
    return handle;
  };

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

  server.registerResource(
    "recorded-evidence",
    new ResourceTemplate("web-debug://evidence/{id}", { list: undefined }),
    { title: "Recorded Web Debug evidence", description: "Immutable redacted observations from a recorded attempt; freshness is at capture time, not current live state. Expires on close or private-input change.", mimeType: "application/json" },
    async (uri) => {
      let accounted = false;
      try {
        if (registry) { await registry.beginRequest(); accounted = true; }
        return retainedEvidence.read(uri);
      } finally {
        if (accounted) await registry!.endRequest(activeSessionCount).catch(() => undefined);
      }
    },
  );

  registerTool(
    "web_project_detect",
    {
      title: "Detect web project eligibility",
      description: "Inspect the exact root, distinguish confirmed application markers from weak dependency candidates, and report bounded workspace candidates without starting a process or selecting a child.",
      inputSchema: z.object({ projectRoot: z.string().min(1).max(4_096).default(DEFAULT_PROJECT_ROOT), host: z.enum(RUNTIME_HOSTS).optional() }).strict(),
      outputSchema: toolOutputSchemas.web_project_detect,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_project_detect,
    },
    async ({ projectRoot, host }) => respondFor("web_project_detect", () => manager.detect(projectRoot, host)),
  );

  registerTool(
    "web_session_start",
    {
      title: "Start web debug session",
      description: "Start or attach to an explicitly selected local Chromium or Safari page using an explicit URL and CDP, native Safari MCP, or executable settings. Chromium can opt into one guarded HTTPS loopback origin and a project-contained disposable auth fixture; attached Chromium can supply targetId to pin the exact page. Safari remains strict and CSS-only.",
      inputSchema: z.object({
        projectRoot: z.string().min(1).max(4_096).default(DEFAULT_PROJECT_ROOT),
        host: z.enum(RUNTIME_HOSTS).optional().describe("Explicitly choose only a grounded recovery.hosts value from detection; preserve the same host when starting."),
        url: z.string().max(2_048).url(),
        targetId: z.string().min(1).max(200).optional(),
        browser: z.enum(["chromium", "safari"]).default("chromium"),
        cdpEndpoint: z.string().max(2_048).url().optional(),
        executablePath: z.string().min(1).max(4_096).optional(),
        headless: z.boolean().default(true),
        allowRemote: z.boolean().default(false),
        viewport: viewportSchema.optional(),
        tls: z.enum(["strict", "allow-insecure-loopback"]).default("strict"),
        logFile: z.string().min(1).max(2_048).optional().describe("One explicitly selected project-relative .log file; request include surfaces=[serverLogs] to read a bounded redacted tail."),
        authFixture: z.object({ kind: z.literal("playwrightStorageState"), path: z.string().min(1).max(2_048) }).strict().optional(),
      }),
      outputSchema: toolOutputSchemas.web_session_start,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_session_start,
    },
    async (input, extra) => respondFor("web_session_start", () => manager.start(input, requestContext(extra.signal))),
  );

  registerTool(
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

  registerTool(
    "web_browser_action",
    {
      title: "Perform bounded browser action",
      description: "Perform an exact-locator browser action or one authorized direct WebMCP page tool; direct WebMCP calls remain opaque, non-replayable and never retried. Optional Chromium diagnostics collect request initiators and explicitly selected precise coverage; coverage changes JIT/timing and is excluded from fix verification.",
      inputSchema: z.object({ sessionId: z.string().uuid(), action: directActionSchema, diagnostics: z.object({ coverage: z.boolean().default(false), settleMs: z.number().int().min(0).max(5000).default(250) }).strict().optional() }),
      outputSchema: toolOutputSchemas.web_browser_action,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_browser_action,
    },
    async ({ sessionId, action, diagnostics }, extra) => respondFor("web_browser_action", () => {
      if (["fill", "select", "webmcp"].includes(action.kind)) retainedEvidence.invalidate(sessionId);
      return manager.act(sessionId, action as DirectBrowserAction, { ...requestContext(extra.signal), ...(diagnostics ? { diagnostics } : {}) });
    }),
  );

  registerTool(
    "web_issue_capture",
    {
      title: "Capture bounded web issue evidence",
      description: "Capture redacted browser evidence with a compact summary by default, or request full, selected, changed surfaces. Use view.profile=recorded and evidenceRef from verification to read immutable attempt evidence without rerunning actions. Screenshots are opt-in and suppressed for private input/auth/WebMCP.",
      inputSchema: z.object({ sessionId: z.string().uuid(), view: captureViewSchema.default({ profile: "summary" }) }).strict(),
      outputSchema: toolOutputSchemas.web_issue_capture,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_issue_capture,
    },
    async ({ sessionId, view }, extra) => respondFor("web_issue_capture",
      async () => view.profile === "recorded" ? retainedEvidence.get(view.evidenceRef, sessionId) : manager.capture(sessionId, view as CaptureView, requestContext(extra.signal)),
      (value) => value.profile === "recorded" ? [] : screenshotCandidatesFromCapture(value),
    ),
  );

  registerTool(
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

  registerTool(
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

  registerTool(
    "web_breakpoint_set",
    {
      title: "Set JavaScript breakpoint",
      description: "Set a breakpoint using one-based source coordinates. Select coordinateSpace=original and an exact source URL/scriptId from the sources capture to translate a source map; ambiguous or unavailable mappings fail explicitly.",
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        sourceUrl: z.string().min(1).max(2_000),
        line: z.number().int().min(1),
        column: z.number().int().min(1).optional(),
        coordinateSpace: z.enum(["generated", "original"]).default("generated"),
        scriptId: z.string().min(1).max(100).optional(),
      }),
      outputSchema: toolOutputSchemas.web_breakpoint_set,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_breakpoint_set,
    },
    async ({ sessionId, sourceUrl, line, column, coordinateSpace, scriptId }, extra) => respondFor("web_breakpoint_set", () => manager.setBreakpoint(sessionId, { sourceUrl, line, column, coordinateSpace, scriptId }, requestContext(extra.signal))),
  );

  registerTool(
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

  registerTool(
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

  registerTool(
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
        completion: z.object({ checks: z.array(scenarioCheckSchema).min(1).max(8), timeoutMs: z.number().int().min(1).max(30_000), stableForMs: z.number().int().min(0).max(2_000).optional() }).strict().optional(),
        minimumPostFixAttempts: z.number().int().min(1).max(5).optional(),
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
    async ({ sessionId, name, url, actions, failureSignature, acceptanceChecks, regressionChecks, completion, minimumPostFixAttempts, checkpoints, viewports, failureViewports, risks, requestedLevel, buildReference, serverStateReset }, extra) =>
      respondFor("web_repro_record", async () => {
        if (actions.some((action) => action.kind === "fill" || action.kind === "select")) retainedEvidence.invalidate(sessionId);
        const value = await runWithProgress(extra, "baseline", (operation) => manager.recordScenario({
        sessionId,
        name,
        url,
        actions: actions as ReplayableBrowserAction[],
        failureSignature: failureSignature as FailureSignatureEntry[],
        acceptanceChecks: acceptanceChecks as ScenarioCheck[],
        regressionChecks: regressionChecks as ScenarioCheck[] | undefined,
        completion: completion as import("./domain/types.js").ScenarioCompletion | undefined,
        minimumPostFixAttempts,
        checkpoints: checkpoints as ScenarioCheckpoint[] | undefined,
        viewports: viewports as ViewportContract[] | undefined,
        failureViewports: failureViewports as string[] | undefined,
        risks: risks as ScenarioRiskSignals | undefined,
        requestedLevel: requestedLevel as VerificationLevel | undefined,
        buildReference,
        serverStateReset: serverStateReset as { action?: ReplayableBrowserAction; readyCheck?: ScenarioCheck } | undefined,
      }, operation));
        return recordedFlowOutput(value, retainedEvidence);
      }, verificationScreenshots),
  );

  registerTool(
    "web_fix_verify",
    {
      title: "Verify web fix against recorded flow",
      description: "Verify the same recorded flow with authoritative full collection and return compact checks, differences and immutable evidence references. Read evidence refs with web_issue_capture view.profile=recorded without rerunning the flow. Collection and verdicts are unchanged by output projection.",
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
      async () => verificationOutput(await runWithProgress(extra, "post-fix", (operation) => manager.verifyScenario({ sessionId, scenarioId, requestedLevel: requestedLevel as VerificationLevel | undefined, buildReference }, operation)), retainedEvidence),
      verificationScreenshots,
    ),
  );

  registerTool(
    "web_session_close",
    {
      title: "Close web debug session",
      description: "Close the selected session and release any browser resources owned by it.",
      inputSchema: z.object({ sessionId: z.string().uuid(), artifactPolicy: z.enum(["retain", "delete"]).default("retain") }),
      outputSchema: toolOutputSchemas.web_session_close,
      annotations: WEB_DEBUG_TOOL_ANNOTATIONS.web_session_close,
    },
    async ({ sessionId, artifactPolicy }) => respondFor("web_session_close", async () => {
      retainedEvidence.invalidate(sessionId);
      return manager.close(sessionId, artifactPolicy);
    }),
  );

  // Own validation for this fixed facade through supported SDK handles. Registration
  // still owns discovery; callbacks retain response bounds, progress and cancellation.
  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = tools.get(request.params.name);
    if (!tool || !tool.handle.enabled || typeof tool.handle.handler !== "function") {
      return errorToolResult(new WebDebugError("UNKNOWN_TOOL", "Select an enabled tool from tools/list."));
    }
    if (request.params.task) return errorToolResult(new WebDebugError("TASK_UNSUPPORTED", "Call this tool directly without task augmentation."));
    const parsed = await tool.schema.safeParseAsync(request.params.arguments ?? {});
    if (!parsed.success) return respondFor(request.params.name as keyof typeof toolDataSchemas, () => {
      throw new WebDebugError("INVALID_TOOL_ARGUMENTS", "The call did not match the tool input schema. No operation ran.", inputGuidance(tool.schema, tool.example, parsed.error));
    });
    return await (tool.handle.handler as ToolCallback<z.ZodType>)(parsed.data, extra);
  });
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

function screenshotCandidatesFromCapture(result: IssueCaptureResult): ScreenshotCandidate[] {
  const artifact = (result as InternalIssueCaptureResult)[CAPTURE_ARTIFACT];
  return artifact ? [{ path: artifact.path, artifactDir: artifact.artifactDir, name: "issue-capture.png" }] : [];
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
