import { z } from "zod";

import { CAPTURE_SURFACES } from "./types.js";

const warningSchema = z.string().max(500);
const frameworkSchema = z.enum(["vanilla", "react", "angular", "vue", "vite", "next"]);
const capabilityStateSchema = z.enum(["supported", "degraded", "unsupported"]);
const capabilityProvenanceSchema = z.enum([
  "playwright",
  "chromium-cdp",
  "safari-webdriver",
  "safari-bidi",
  "performance-resource-timing",
  "session-policy",
]);
const runtimeCapabilitySchema = z.object({
  state: capabilityStateSchema,
  provenance: z.array(capabilityProvenanceSchema).max(2),
  reason: z.string().max(500).optional(),
}).strict();
const viewportSchema = z.object({ width: z.number().int(), height: z.number().int() }).strict();

export const projectCapabilitiesSchema: z.ZodType = z.object({
  browserTarget: z.boolean(),
  react: z.boolean(),
  angular: z.boolean(),
  vue: z.boolean(),
  vite: z.boolean(),
  next: z.boolean(),
  serverRuntime: z.boolean(),
}).strict();

export const browserRuntimeCapabilitiesSchema: z.ZodType = z.object({
  schemaVersion: z.literal(1),
  browser: z.enum(["chromium", "safari"]),
  transport: z.enum(["chromium-launch", "chromium-cdp-attach", "safari-webdriver"]),
  actions: runtimeCapabilitySchema,
  locators: z.object({ css: runtimeCapabilitySchema, semantic: runtimeCapabilitySchema }).strict(),
  dom: runtimeCapabilitySchema,
  console: runtimeCapabilitySchema,
  network: runtimeCapabilitySchema,
  screenshots: runtimeCapabilitySchema,
  javascriptDebugger: runtimeCapabilitySchema,
  evaluation: runtimeCapabilitySchema,
  accessibility: runtimeCapabilitySchema,
  pageRuntimeEnrichment: runtimeCapabilitySchema,
  viewportMatrix: runtimeCapabilitySchema,
  tlsBypass: runtimeCapabilitySchema,
  authSeeding: runtimeCapabilitySchema,
}).strict();

const browserTargetSchema = z.object({
  browser: z.enum(["chromium", "safari"]),
  remote: z.boolean(),
  url: z.string().max(2_560),
  title: z.string().max(300),
  viewport: viewportSchema.nullable(),
  isolated: z.boolean(),
  targetId: z.string().max(200).optional(),
  mode: z.enum(["launch", "attach", "webdriver"]).optional(),
  isolation: z.object({
    browserProcess: z.boolean(),
    context: z.boolean(),
    profile: z.boolean(),
    storage: z.boolean(),
    cache: z.boolean(),
    serviceWorkers: z.boolean(),
    navigation: z.boolean(),
    serverState: z.boolean(),
  }).strict().optional(),
}).strict();

const detectionSignalSchema = z.object({
  source: z.enum(["config", "entry", "script", "dependency", "devDependency", "peerDependency"]),
  value: z.string().max(300),
}).strict();
const confidenceSchema = z.enum(["high", "medium", "low", "none"]);

export const projectDescriptorSchema: z.ZodType = z.object({
  schemaVersion: z.literal(2),
  projectRoot: z.string().max(4_096),
  packageManager: z.enum(["npm", "pnpm", "yarn", "bun"]).nullable(),
  kind: z.enum(["application", "workspace", "library", "unknown"]),
  frameworks: z.array(frameworkSchema).max(6),
  markers: z.array(z.string().max(300)).max(32),
  confidence: confidenceSchema,
  ambiguous: z.boolean(),
  frameworkDetections: z.array(z.object({
    framework: frameworkSchema,
    confidence: z.enum(["high", "medium", "low"]),
    selected: z.boolean(),
    provenance: z.array(detectionSignalSchema).max(8),
  }).strict()).max(6),
  workspace: z.object({
    declared: z.boolean(),
    candidates: z.array(z.object({
      projectRoot: z.string().max(4_096),
      frameworks: z.array(frameworkSchema).max(6),
      confidence: confidenceSchema,
      ambiguous: z.boolean(),
      markers: z.array(z.string().max(300)).max(12),
    }).strict()).max(32),
    truncated: z.boolean(),
    unsupportedPatterns: z.array(z.string().max(300)).max(32),
  }).strict(),
  projectCapabilities: projectCapabilitiesSchema,
  warnings: z.array(warningSchema).max(20),
}).strict();

export const debugSessionSummarySchema: z.ZodType = z.object({
  schemaVersion: z.literal(2),
  id: z.string().uuid(),
  projectRoot: z.string().max(4_096),
  url: z.string().max(2_560),
  status: z.enum(["starting", "ready", "paused", "failed", "closed"]),
  createdAt: z.string().max(100),
  artifactDir: z.string().max(4_096),
  target: browserTargetSchema.nullable(),
  projectCapabilities: projectCapabilitiesSchema,
  runtimeCapabilities: browserRuntimeCapabilitiesSchema.nullable(),
  warnings: z.array(warningSchema).max(100),
  tls: z.enum(["strict", "allow-insecure-loopback"]).optional(),
  authFixture: z.enum(["seeded-disposable", "none"]).optional(),
  artifactState: z.enum(["retained", "deleted"]).optional(),
}).strict();

const locatorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("css"), value: z.string().max(500) }).strict(),
  z.object({ kind: z.literal("role"), role: z.string().max(100), name: z.string().max(300).optional() }).strict(),
  z.object({ kind: z.literal("text"), text: z.string().max(500) }).strict(),
  z.object({ kind: z.literal("label"), text: z.string().max(500) }).strict(),
  z.object({ kind: z.literal("testId"), value: z.string().max(500) }).strict(),
]);
const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("navigate"), url: z.string().max(2_560) }).strict(),
  z.object({ kind: z.literal("click"), locator: locatorSchema }).strict(),
  z.object({ kind: z.literal("fill"), locator: locatorSchema, value: z.string() }).strict(),
  z.object({ kind: z.literal("press"), locator: locatorSchema, key: z.string().max(40) }).strict(),
  z.object({ kind: z.literal("select"), locator: locatorSchema, value: z.string() }).strict(),
  z.object({ kind: z.literal("check"), locator: locatorSchema, checked: z.boolean() }).strict(),
  z.object({ kind: z.literal("hover"), locator: locatorSchema }).strict(),
  z.object({ kind: z.literal("scroll"), locator: locatorSchema }).strict(),
  z.object({ kind: z.literal("wait"), locator: locatorSchema, property: z.enum(["count", "visible", "enabled", "checked", "text"]), expected: z.union([z.number(), z.boolean(), z.string(), z.null()]), timeoutMs: z.number().int().optional() }).strict(),
  z.object({ kind: z.literal("reload") }).strict(),
]);

export const actionResultSchema: z.ZodType = z.object({
  kind: z.enum(["navigate", "click", "fill", "press", "select", "check", "hover", "scroll", "wait", "reload"]),
  url: z.string().max(2_560),
  title: z.string().max(300),
}).strict();

const consoleEntrySchema = z.object({
  level: z.enum(["log", "info", "debug", "warning", "error", "pageerror"]),
  text: z.string().max(2_000),
  url: z.string().max(2_560).optional(),
  line: z.number().int().optional(),
  column: z.number().int().optional(),
}).strict();
const networkEntrySchema = z.object({
  requestId: z.string().max(500),
  method: z.string().max(50),
  url: z.string().max(2_560),
  resourceType: z.string().max(100),
  status: z.number().int().nullable(),
  ok: z.boolean().nullable(),
  nextActionId: z.string().max(200).optional(),
  failure: z.string().max(500).optional(),
}).strict();
const domSchema = z.object({
  bodyText: z.string().max(4_000),
  elements: z.array(z.object({ tag: z.string(), id: z.string().nullable(), role: z.string().nullable(), text: z.string() }).strict()).max(50),
}).strict();

export const debuggerBreakpointSchema: z.ZodType = z.object({
  id: z.string().max(500),
  sourceUrl: z.string().max(2_560),
  line: z.number().int(),
  column: z.number().int().nullable(),
}).strict();
const debuggerCallFrameSchema = z.object({
  functionName: z.string().max(500),
  url: z.string().max(2_560),
  line: z.number().int(),
  column: z.number().int(),
  scopeNames: z.array(z.string().max(100)).max(50),
  locals: z.record(z.string(), z.json()),
}).strict();
export const debuggerSnapshotSchema: z.ZodType = z.object({
  paused: z.boolean(),
  reason: z.string().max(500).nullable(),
  callFrames: z.array(debuggerCallFrameSchema).max(50),
  breakpoints: z.array(debuggerBreakpointSchema).max(100),
}).strict();

const observationsSchema = z.object({
  url: z.json(),
  dom: z.json(),
  console: z.json(),
}).strict();
const replayFrameSchema = z.object({
  index: z.number().int().nonnegative(),
  attemptId: z.string().nullable(),
  capturedAt: z.string().max(100),
  trigger: z.enum(["action", "capture"]),
  action: actionSchema.nullable(),
  url: z.string().max(2_560),
  title: z.string().max(300),
  dom: domSchema,
  console: z.array(consoleEntrySchema).max(20),
  network: z.array(networkEntrySchema).max(20),
  debugger: debuggerSnapshotSchema,
  react: z.json().nullable(),
  angular: z.json().nullable(),
  vue: z.json().nullable(),
}).strict();
const replayTimelineSchema = z.object({
  enabled: z.literal(true),
  maxFrames: z.number().int().positive(),
  truncated: z.boolean(),
  frames: z.array(replayFrameSchema).max(8),
}).strict();

const captureSurfaceSchema = z.enum(CAPTURE_SURFACES);
const captureDetailsSchema = z.object({
  dom: domSchema.optional(),
  console: z.array(consoleEntrySchema).max(100).optional(),
  network: z.array(networkEntrySchema).max(100).optional(),
  debugger: debuggerSnapshotSchema.optional(),
  react: z.json().nullable().optional(),
  angular: z.json().nullable().optional(),
  vue: z.json().nullable().optional(),
  next: z.json().nullable().optional(),
  vite: z.json().nullable().optional(),
  accessibility: z.json().nullable().optional(),
  replay: replayTimelineSchema.optional(),
  screenshot: z.object({ status: z.enum(["captured", "suppressed", "unavailable"]) }).strict().optional(),
}).strict();

const captureTargetSchema = z.object({
  browser: z.enum(["chromium", "safari"]),
  remote: z.boolean(),
  viewport: viewportSchema.nullable(),
  isolated: z.boolean(),
  mode: z.enum(["launch", "attach", "webdriver"]).optional(),
}).strict();

const captureCommonSchema = z.object({
  schemaVersion: z.literal(4),
  capturedAt: z.string().max(100),
  cursor: z.string().uuid(),
  session: z.object({
    id: z.string().uuid(),
    url: z.string().max(2_560),
    status: z.enum(["starting", "ready", "paused", "failed", "closed"]),
    target: captureTargetSchema.nullable(),
    projectCapabilities: projectCapabilitiesSchema,
    runtimeCapabilities: browserRuntimeCapabilitiesSchema.nullable(),
  }).strict(),
  project: z.object({
    frameworks: z.array(frameworkSchema).max(6),
    confidence: confidenceSchema,
    ambiguous: z.boolean(),
    projectCapabilities: projectCapabilitiesSchema,
  }).strict(),
  summary: z.object({
    title: z.string().max(300),
    viewport: viewportSchema.nullable(),
    bodyText: z.string().max(1_000),
    domElements: z.number().int().nonnegative(),
    console: z.object({ total: z.number().int().nonnegative(), errors: z.number().int().nonnegative(), warnings: z.number().int().nonnegative(), latestErrors: z.array(consoleEntrySchema).max(3) }).strict(),
    network: z.object({ total: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), latestFailures: z.array(networkEntrySchema).max(3) }).strict(),
    debugger: z.object({ paused: z.boolean(), reason: z.string().max(500).nullable(), callFrames: z.number().int().nonnegative(), breakpoints: z.number().int().nonnegative() }).strict(),
    runtimes: z.object({
      react: z.enum(["present", "not-detected", "unavailable"]),
      angular: z.enum(["present", "not-detected", "unavailable"]),
      vue: z.enum(["present", "not-detected", "unavailable"]),
      next: z.enum(["present", "not-detected", "unavailable"]),
      vite: z.enum(["present", "not-detected", "unavailable"]),
      accessibility: z.enum(["present", "not-detected", "unavailable"]),
    }).strict(),
    replay: z.object({ frames: z.number().int().nonnegative(), truncated: z.boolean(), oldestIndex: z.number().int().nullable(), newestIndex: z.number().int().nullable() }).strict(),
    observations: observationsSchema.nullable(),
  }).strict(),
  redaction: z.object({ applied: z.literal(true), policy: z.literal("default-sensitive-fields") }).strict(),
  warnings: z.array(warningSchema).max(10),
  truncation: z.object({ applied: z.boolean(), omittedSurfaces: z.array(captureSurfaceSchema).max(CAPTURE_SURFACES.length) }).strict(),
}).strict();

export const issueCaptureResultSchema: z.ZodType = z.discriminatedUnion("profile", [
  captureCommonSchema.extend({ profile: z.literal("summary") }).strict(),
  captureCommonSchema.extend({ profile: z.literal("full"), details: captureDetailsSchema }).strict(),
  captureCommonSchema.extend({
    profile: z.literal("include"),
    includedSurfaces: z.array(captureSurfaceSchema).min(1).max(CAPTURE_SURFACES.length),
    details: captureDetailsSchema,
  }).strict(),
  captureCommonSchema.extend({
    profile: z.literal("delta"),
    fromCursor: z.string().max(200),
    changedSurfaces: z.array(captureSurfaceSchema).max(CAPTURE_SURFACES.length),
    unchangedSurfaces: z.array(captureSurfaceSchema).max(CAPTURE_SURFACES.length),
    details: captureDetailsSchema,
  }).strict(),
]);

export const nextInspectionResultSchema: z.ZodType = z.object({
  detected: z.literal(true),
  endpoint: z.string().max(2_560),
  kind: z.enum(["compileRoute", "resolveServerAction"]),
  result: z.json().nullable(),
  warnings: z.array(warningSchema).max(20),
}).strict();

export const replaySeekResultSchema: z.ZodType = z.object({
  sessionId: z.string().uuid(),
  frame: replayFrameSchema,
  restored: z.boolean(),
  availableFrames: z.number().int().nonnegative(),
  oldestFrameIndex: z.number().int().nonnegative(),
  newestFrameIndex: z.number().int().nonnegative(),
}).strict();

export const evaluationResultSchema: z.ZodType = z.object({
  value: z.json(),
  type: z.string().max(100).nullable(),
  description: z.string().max(2_000).nullable(),
}).strict();

const environmentFingerprintSchema = z.object({
  schemaVersion: z.literal(3),
  projectRoot: z.string().max(4_096),
  descriptor: z.string().max(500),
  projectFrameworks: z.array(frameworkSchema).max(6),
  projectConfidence: confidenceSchema,
  projectAmbiguous: z.boolean(),
  origin: z.string().max(2_560),
  path: z.string().max(2_560),
  browser: z.enum(["chromium", "safari"]).nullable(),
  browserVersion: z.string().max(200).nullable(),
  adapterMode: z.enum(["launch", "attach", "webdriver"]).nullable(),
  targetId: z.string().max(200).nullable(),
  remote: z.boolean(),
  isolated: z.boolean(),
  viewport: viewportSchema.nullable(),
  tls: z.enum(["strict", "allow-insecure-loopback"]),
  authFixture: z.enum(["seeded-disposable", "none"]),
  runtimeTransport: z.enum(["chromium-launch", "chromium-cdp-attach", "safari-webdriver"]).nullable(),
  runtimeCapabilityStates: z.record(z.string(), capabilityStateSchema),
  nodeVersion: z.string().max(100),
  platform: z.string().max(100),
  architecture: z.string().max(100),
}).strict();

export const publicReproScenarioSchema: z.ZodType = z.object({
  schemaVersion: z.literal(5),
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  name: z.string().max(200),
  url: z.string().max(2_560),
  actions: z.array(actionSchema).max(100),
  failureSignature: z.array(z.json()).max(64),
  acceptanceChecks: z.array(z.json()).max(64),
  regressionChecks: z.array(z.json()).max(64),
  checkpoints: z.array(z.json()).max(16),
  viewports: z.array(viewportSchema.extend({ name: z.string().max(40) }).strict()).max(4),
  failureViewports: z.array(z.string().max(40)).max(4).optional(),
  authFixture: z.enum(["seeded-disposable", "none"]),
  tls: z.enum(["strict", "allow-insecure-loopback"]),
  risks: z.json(),
  serverStateReset: z.json().optional(),
  requestedLevel: z.enum(["quick", "standard", "strict"]),
  buildReference: z.json(),
  environmentFingerprint: environmentFingerprintSchema,
  contractHash: z.string().length(64),
  persistence: z.literal("in-memory"),
  createdAt: z.string().max(100),
  baseline: z.object({
    status: z.enum(["reproduced", "not_reproduced", "inconclusive"]),
    level: z.enum(["quick", "standard", "strict"]),
    flaky: z.boolean(),
    budget: z.json(),
    attempts: z.array(z.json()).max(5),
    observedRate: z.json(),
    evidence: z.json().nullable(),
    warnings: z.array(warningSchema).max(100),
    viewportConsensus: z.record(z.string(), z.string()).optional(),
    termination: z.string().max(500),
    truncation: z.json().optional(),
  }).strict(),
}).strict();

export const verificationResultSchema: z.ZodType = z.object({
  schemaVersion: z.literal(5),
  outcome: z.enum(["verified", "failed", "inconclusive"]),
  level: z.enum(["quick", "standard", "strict"]),
  requestedLevel: z.enum(["quick", "standard", "strict"]),
  escalations: z.array(warningSchema).max(100),
  flaky: z.boolean(),
  scenario: publicReproScenarioSchema,
  baseline: z.json(),
  postFix: z.json(),
  observedRates: z.json(),
  budget: z.json(),
  cleanup: z.json(),
  evidence: z.object({ baseline: z.json().nullable(), postFix: z.json().nullable() }).strict(),
  environmentFingerprint: environmentFingerprintSchema,
  contractHash: z.string().length(64),
  buildReference: z.json(),
  isolation: z.json(),
  persistence: z.literal("in-memory"),
  warnings: z.array(warningSchema).max(100),
  termination: z.string().max(500),
  truncation: z.json(),
}).strict();

export const sessionStatusResultSchema: z.ZodType = z.union([debugSessionSummarySchema, z.array(debugSessionSummarySchema).max(8)]);

export type WebDebugToolName =
  | "web_project_detect"
  | "web_session_start"
  | "web_session_status"
  | "web_browser_action"
  | "web_issue_capture"
  | "web_next_inspect"
  | "web_replay_seek"
  | "web_breakpoint_set"
  | "web_debug_control"
  | "web_debug_evaluate"
  | "web_repro_record"
  | "web_fix_verify"
  | "web_session_close";

export const toolDataSchemas: Record<WebDebugToolName, z.ZodType> = {
  web_project_detect: projectDescriptorSchema,
  web_session_start: debugSessionSummarySchema,
  web_session_status: sessionStatusResultSchema,
  web_browser_action: actionResultSchema,
  web_issue_capture: issueCaptureResultSchema,
  web_next_inspect: nextInspectionResultSchema,
  web_replay_seek: replaySeekResultSchema,
  web_breakpoint_set: debuggerBreakpointSchema,
  web_debug_control: debuggerSnapshotSchema,
  web_debug_evaluate: evaluationResultSchema,
  web_repro_record: publicReproScenarioSchema,
  web_fix_verify: verificationResultSchema,
  web_session_close: debugSessionSummarySchema,
};
