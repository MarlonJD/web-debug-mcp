export type Framework = "vanilla" | "react" | "angular" | "vue" | "vite" | "next";

export type BrowserEngine = "chromium" | "safari";

/** Public 0.3.x limits. Keep these values in the domain so adapters and core
 * can share the same contract without duplicating magic numbers. */
export const MAX_SCENARIO_ACTIONS = 100;
export const MAX_LOCATOR_CHARS = 500;
export const MAX_ACCESSIBLE_NAME_CHARS = 300;
export const MAX_SCENARIO_NAME_CHARS = 200;
export const MAX_CHECKPOINT_NAME_CHARS = 80;
export const MAX_VIEWPORT_NAME_CHARS = 40;
export const MAX_PROPERTIES_PER_PROBE = 5;
export const MAX_CHECKPOINTS = 16;
export const MAX_CHECKPOINT_PROBES_TOTAL = 32;
export const MAX_PROBES_PER_CHECKPOINT = 8;
export const MAX_DECISIVE_OBSERVATIONS = 64;
export const MAX_VIEWPORTS = 4;
export const MAX_ATTEMPTS_PER_PHASE = 5;
export const MAX_MATRIX_EXECUTION_UNITS_PER_PHASE = 20;
export const MAX_AX_NODES = 128;
export const MAX_LOCATOR_SUGGESTIONS = 32;
export const MAX_AUTH_STATE_BYTES = 65_536;
export const MAX_AUTH_COOKIES = 32;
export const MAX_AUTH_ORIGINS = 8;
export const MAX_AUTH_LOCAL_STORAGE_PER_ORIGIN = 32;
export const MAX_AUTH_STORAGE_ITEMS_TOTAL = 128;
export const MAX_EVIDENCE_BUNDLE_BYTES = 98_304;
export const MAX_RESULT_BYTES = 262_144;
export const MAX_MCP_OPERATION_MS = 150_000;
export const MAX_ACTION_WAIT_MS = 30_000;
export const MAX_REPLAY_FRAMES = 8;
export const MAX_WEBMCP_ARGUMENT_KEYS = 64;
export const MAX_WEBMCP_ARGUMENT_DEPTH = 8;
export const MAX_WEBMCP_ARGUMENT_NODES = 128;
export const MAX_WEBMCP_ARGUMENT_KEY_CHARS = 100;
export const MAX_WEBMCP_ARGUMENT_STRING_BYTES = 2_000;
export const MAX_WEBMCP_ARGUMENT_BYTES = 16_384;
export const MAX_WEBMCP_RESULT_BYTES = 8_192;
export const MAX_WEBMCP_TOOLS = 16;
export const MAX_WEBMCP_TOOL_ORIGIN_CHARS = 2_048;
export const MAX_WEBMCP_TOOL_NAME_CHARS = 100;
export const MAX_WEBMCP_TOOL_TITLE_CHARS = 200;
export const MAX_WEBMCP_TOOL_DESCRIPTION_CHARS = 500;
export const MAX_WEBMCP_SCHEMA_BYTES = 8_192;
export const MAX_WEBMCP_DETAIL_BYTES = 32_768;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type BrowserLocator =
  | { kind: "css"; value: string }
  | { kind: "role"; role: string; name?: string }
  | { kind: "text"; text: string }
  | { kind: "label"; text: string }
  | { kind: "testId"; value: string };

export type LocatorProperty = "count" | "visible" | "enabled" | "checked" | "text";
export type LocatorProbeValue = number | boolean | string | null;

export interface LocatorProbeResult {
  locator: BrowserLocator;
  properties: LocatorProperty[];
  observedAt: string;
  provenance: "browser" | "webdriver";
  count?: number;
  visible?: boolean;
  enabled?: boolean;
  checked?: boolean;
  text?: string | null;
  warnings: string[];
}

export interface AccessibilityNode {
  role: string | null;
  name: string;
  selected: boolean | null;
  checked: boolean | null;
  disabled: boolean | null;
  depth: number;
  ignored: boolean;
  ignoredReason: string | null;
}

export interface LocatorSuggestion {
  locator: BrowserLocator;
  matchCount: number;
  uniqueAtCapture: boolean;
}

export interface AccessibilityDiagnostics {
  nodes: AccessibilityNode[];
  suggestions: LocatorSuggestion[];
  truncated: boolean;
  warnings: string[];
}

export type SessionStatus = "starting" | "ready" | "paused" | "failed" | "closed";

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ProjectCapabilities {
  browserTarget: boolean;
  react: boolean;
  angular: boolean;
  vue: boolean;
  vite: boolean;
  next: boolean;
  serverRuntime: boolean;
}

export type DetectionConfidence = "high" | "medium" | "low" | "none";
export type DetectionSignalSource = "config" | "entry" | "script" | "dependency" | "devDependency" | "peerDependency";

export interface DetectionSignal {
  source: DetectionSignalSource;
  value: string;
}

export interface FrameworkDetection {
  framework: Framework;
  confidence: Exclude<DetectionConfidence, "none">;
  selected: boolean;
  provenance: DetectionSignal[];
}

export interface WorkspaceCandidate {
  projectRoot: string;
  frameworks: Framework[];
  confidence: DetectionConfidence;
  ambiguous: boolean;
  markers: string[];
}

export interface WorkspaceDiscovery {
  declared: boolean;
  candidates: WorkspaceCandidate[];
  truncated: boolean;
  unsupportedPatterns: string[];
}

export interface ProjectDescriptor {
  schemaVersion: 2;
  projectRoot: string;
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | null;
  kind: "application" | "workspace" | "library" | "unknown";
  frameworks: Framework[];
  markers: string[];
  confidence: DetectionConfidence;
  ambiguous: boolean;
  frameworkDetections: FrameworkDetection[];
  workspace: WorkspaceDiscovery;
  projectCapabilities: ProjectCapabilities;
  warnings: string[];
}

export type RuntimeCapabilityState = "supported" | "degraded" | "unsupported";
export type RuntimeCapabilityProvenance =
  | "playwright"
  | "chromium-cdp"
  | "safari-webdriver"
  | "safari-bidi"
  | "performance-resource-timing"
  | "session-policy"
  | "webmcp-page-api";

export interface RuntimeCapability {
  state: RuntimeCapabilityState;
  provenance: RuntimeCapabilityProvenance[];
  reason?: string;
}

export interface BrowserRuntimeCapabilities {
  schemaVersion: 2;
  browser: BrowserEngine;
  transport: "chromium-launch" | "chromium-cdp-attach" | "safari-webdriver";
  actions: RuntimeCapability;
  locators: {
    css: RuntimeCapability;
    semantic: RuntimeCapability;
  };
  dom: RuntimeCapability;
  console: RuntimeCapability;
  network: RuntimeCapability;
  screenshots: RuntimeCapability;
  javascriptDebugger: RuntimeCapability;
  evaluation: RuntimeCapability;
  accessibility: RuntimeCapability;
  pageRuntimeEnrichment: RuntimeCapability;
  viewportMatrix: RuntimeCapability;
  tlsBypass: RuntimeCapability;
  authSeeding: RuntimeCapability;
  webmcp: RuntimeCapability;
}

export interface BrowserTarget {
  schemaVersion: 1;
  browser: BrowserEngine;
  remote: boolean;
  url: string;
  title: string;
  viewport: ViewportSize | null;
  isolated: boolean;
  /** The exact browser/page target selected for this session when the transport exposes one. */
  targetId?: string;
  /** Launch, attached CDP, or visible WebDriver transport mode. */
  mode?: "launch" | "attach" | "webdriver";
  isolation?: {
    browserProcess: boolean;
    context: boolean;
    profile: boolean;
    storage: boolean;
    cache: boolean;
    serviceWorkers: boolean;
    navigation: boolean;
    serverState: boolean;
  };
}

export interface DebugSessionSummary {
  schemaVersion: 3;
  id: string;
  projectRoot: string;
  url: string;
  status: SessionStatus;
  createdAt: string;
  artifactDir: string;
  target: BrowserTarget | null;
  projectCapabilities: ProjectCapabilities;
  runtimeCapabilities: BrowserRuntimeCapabilities | null;
  warnings: string[];
  /** Public mode metadata; paths and parsed auth values stay private. */
  tls?: "strict" | "allow-insecure-loopback";
  authFixture?: "seeded-disposable" | "none";
  artifactState?: "retained" | "deleted";
}

export const BROWSER_PRESS_KEYS = [
  "Enter",
  "Escape",
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Backspace",
  "Delete",
  "Space",
] as const;
export type BrowserPressKey = typeof BROWSER_PRESS_KEYS[number];

export type ReplayableBrowserAction =
  | { kind: "navigate"; url: string }
  | { kind: "click"; locator: BrowserLocator }
  | { kind: "fill"; locator: BrowserLocator; value: string }
  | { kind: "press"; locator: BrowserLocator; key: BrowserPressKey }
  | { kind: "select"; locator: BrowserLocator; value: string }
  | { kind: "check"; locator: BrowserLocator; checked: boolean }
  | { kind: "hover"; locator: BrowserLocator }
  | { kind: "scroll"; locator: BrowserLocator }
  | { kind: "wait"; locator: BrowserLocator; property: LocatorProperty; expected: LocatorProbeValue; timeoutMs?: number }
  | { kind: "reload" };

export interface WebMcpDirectAction {
  kind: "webmcp";
  origin: string;
  name: string;
  arguments: Record<string, JsonValue>;
  allowSideEffects: true;
  timeoutMs?: number;
}

export type DirectBrowserAction = ReplayableBrowserAction | WebMcpDirectAction;
/** Internal alias retained for replay/scenario code; it intentionally excludes WebMCP. */
export type BrowserAction = ReplayableBrowserAction;

export interface OperationContext {
  signal?: AbortSignal;
  /** Absolute monotonic deadline in milliseconds (performance.now()). */
  deadline?: number;
  attemptId?: string;
  /** Internal clock hook used by deterministic orchestration tests. */
  clock?: () => number;
  /** Internal cancellation hook owned by SessionManager leases. */
  abort?: () => void;
  /** Internal set used to keep late adapter work attached to its lease. */
  pending?: Set<Promise<void>>;
  /** Optional bounded progress sink used only for adaptive scenario phases. */
  progress?: (event: ScenarioProgressEvent) => Promise<void>;
}

export interface ScenarioProgressEvent {
  phase: "baseline" | "post-fix";
  event: "attempt-start" | "attempt-end";
  level: VerificationLevel;
  ordinal: number;
  termination?: AttemptTermination | string;
}

export interface ReplayableActionResult {
  schemaVersion: 1;
  kind: ReplayableBrowserAction["kind"];
  url: string;
  title: string;
}

export interface WebMcpActionResult {
  schemaVersion: 1;
  kind: "webmcp";
  url: string;
  title: string;
  toolResult: string | null;
}

export type ActionResult = ReplayableActionResult | WebMcpActionResult;
export type BrowserActionResult = ActionResult;

export interface ConsoleEntry {
  level: "log" | "info" | "debug" | "warning" | "error" | "pageerror";
  text: string;
  url?: string;
  line?: number;
  column?: number;
}

export interface NetworkEntry {
  requestId: string;
  method: string;
  url: string;
  resourceType: string;
  status: number | null;
  ok: boolean | null;
  nextActionId?: string;
  failure?: string;
}

export interface DomElementSummary {
  tag: string;
  id: string | null;
  role: string | null;
  text: string;
}

export interface DomSnapshot {
  bodyText: string;
  elements: DomElementSummary[];
}

export interface DebuggerCallFrame {
  functionName: string;
  url: string;
  line: number;
  column: number;
  scopeNames: string[];
  locals: Record<string, unknown>;
}

export interface DebuggerBreakpoint {
  id: string;
  sourceUrl: string;
  line: number;
  column: number | null;
}

export interface DebuggerSnapshot {
  paused: boolean;
  reason: string | null;
  callFrames: DebuggerCallFrame[];
  breakpoints: DebuggerBreakpoint[];
}

export type ReactRenderCause = "mount" | "props" | "state" | "props+state" | "parent";

export interface ReactCommitSummary {
  index: number;
  timestamp: number;
  rendererId: number | null;
  componentCount: number;
  changedComponentCount: number;
  durationMs: number | null;
}

export interface ReactComponentNode {
  name: string;
  source: { file: string; line: number; column: number } | null;
  props: Record<string, unknown>;
  hooks: unknown[];
  renderCount: number;
  renderCause: ReactRenderCause;
  propChanges: string[];
  hookChanges: number[];
  actualDurationMs: number | null;
  selfDurationMs: number | null;
  treeDurationMs: number | null;
  children: ReactComponentNode[];
}

export interface ReactFlamegraphNode {
  name: string;
  depth: number;
  source: { file: string; line: number; column: number } | null;
  renderCount: number;
  renderCause: ReactRenderCause;
  actualDurationMs: number | null;
  selfDurationMs: number | null;
  treeDurationMs: number | null;
}

export interface ReactSnapshot {
  detected: true;
  rendererCount: number;
  commitCount: number;
  commits: ReactCommitSummary[];
  profiler: {
    mode: "devtools-hook";
    capped: boolean;
  };
  components: ReactComponentNode[];
  flamegraph: ReactFlamegraphNode[];
  warnings: string[];
}

export interface AngularComponentNode {
  name: string;
  host: { tag: string; id: string | null } | null;
  state: Record<string, unknown>;
  sampleCount: number;
  changedStateKeys: string[];
  children: AngularComponentNode[];
}

export interface AngularSnapshot {
  detected: true;
  version: string | null;
  mode: "development";
  treeMode: "dom-host";
  snapshotCount: number;
  componentCount: number;
  components: AngularComponentNode[];
  truncated: boolean;
  warnings: string[];
}

export interface VueComponentNode {
  name: string;
  source: { file: string } | null;
  props: Record<string, unknown>;
  state: Record<string, unknown>;
  updateCount: number;
  changedPropKeys: string[];
  changedStateKeys: string[];
  children: VueComponentNode[];
}

export interface VueSnapshot {
  detected: true;
  version: string | null;
  appCount: number;
  componentCount: number;
  components: VueComponentNode[];
  truncated: boolean;
  warnings: string[];
}

export interface NextSnapshot {
  detected: true;
  endpoint: string;
  tools: string[];
  projectMetadata: unknown | null;
  errors: unknown | null;
  routes: unknown | null;
  logs: unknown | null;
  compilationIssues: unknown | null;
  pageMetadata: unknown | null;
  requestInsights: unknown | null;
  requestTraces: NextRequestTrace[];
  logTail: {
    file: string;
    text: string;
    truncated: boolean;
  } | null;
  serverActionExecutions: Array<{
    actionId: string;
    request: {
      requestId: string;
      method: string;
      url: string;
      status: number | null;
      ok: boolean | null;
    };
    resolution: unknown | null;
    trace: NextRequestTrace | null;
    warning?: string;
  }>;
  warnings: string[];
}

export interface NextRequestTrace {
  requestId: string;
  kind: string | null;
  route: string | null;
  url: string | null;
  status: string | null;
  startTime: number | null;
  durationMs: number | null;
  spans: Array<{
    name: string;
    startTime: number | null;
    durationMs: number | null;
    status: string | null;
    traceId: string | null;
    spanId: string | null;
    parentSpanId: string | null;
    attributes: Record<string, unknown>;
  }>;
  fetches: unknown[];
}

export type NextInspection =
  | { kind: "compileRoute"; routeSpecifier?: string; path?: string }
  | { kind: "resolveServerAction"; actionId: string };

export interface NextInspectionResult {
  detected: true;
  endpoint: string;
  kind: NextInspection["kind"];
  result: unknown | null;
  warnings: string[];
}

export interface ReplayFrame {
  index: number;
  attemptId: string | null;
  capturedAt: string;
  trigger: "action" | "capture";
  action: ReplayableBrowserAction | null;
  url: string;
  title: string;
  dom: DomSnapshot;
  console: ConsoleEntry[];
  network: NetworkEntry[];
  debugger: DebuggerSnapshot;
  react: ReactSnapshot | null;
  angular: AngularSnapshot | null;
  vue: VueSnapshot | null;
}

export interface ReplayTimeline {
  enabled: true;
  maxFrames: number;
  truncated: boolean;
  restorable: boolean;
  restoreBlockedReason: string | null;
  frames: ReplayFrame[];
}

export interface ReplaySeekResult {
  schemaVersion: 1;
  sessionId: string;
  frame: ReplayFrame;
  restored: boolean;
  restorable: boolean;
  restoreBlockedReason: string | null;
  availableFrames: number;
  oldestFrameIndex: number;
  newestFrameIndex: number;
}

export interface ViteModuleSummary {
  id: string | null;
  url: string;
  file: string | null;
  type: "js" | "css" | "asset";
  importers: string[];
  importedModules: string[];
  acceptedHmrDeps: string[];
  isSelfAccepting: boolean | null;
  lastHMRTimestamp: number;
  transform: ViteTransformSummary | null;
}

export interface ViteTransformDiff {
  patch: string;
  addedLines: number;
  removedLines: number;
  truncated: boolean;
}

export interface ViteSourceMapSummary {
  present: boolean;
  sourceCount: number;
  sources: string[];
  namesCount: number;
  mappingLength: number;
  file: string | null;
}

export interface ViteTransformSummary {
  codeLength: number;
  truncated: boolean;
  deps: string[];
  dynamicDeps: string[];
  sourceMap: ViteSourceMapSummary;
}

export interface ViteSnapshot {
  detected: true;
  endpoint: string;
  root: string;
  moduleCount: number;
  modules: ViteModuleSummary[];
  hmr: {
    active: boolean;
    lastUpdate: {
      file: string;
      timestamp: number;
      moduleCount: number;
      transformDiff: ViteTransformDiff | null;
      transformProvenance: {
        before: ViteTransformSummary | null;
        after: ViteTransformSummary | null;
      } | null;
    } | null;
  };
  warnings: string[];
}

export interface WebMcpCaptureTool {
  origin: string;
  name: string;
  title: string | null;
  description: string;
  inputSchemaJson: string | null;
  annotations: {
    readOnlyHint: boolean | null;
    untrustedContentHint: boolean | null;
  };
  untrusted: true;
}

export interface WebMcpCaptureDetail {
  provenance: "webmcp-page-api";
  observedAt: string;
  total: number;
  truncated: boolean;
  tools: WebMcpCaptureTool[];
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  viewport: ViewportSize | null;
  dom: DomSnapshot;
  console: ConsoleEntry[];
  network: NetworkEntry[];
  screenshotPath: string | null;
  debugger: DebuggerSnapshot;
  react: ReactSnapshot | null;
  angular: AngularSnapshot | null;
  vue: VueSnapshot | null;
  next: NextSnapshot | null;
  vite: ViteSnapshot | null;
  webmcp: WebMcpCaptureDetail | null;
  accessibility?: AccessibilityDiagnostics | null;
  warnings: string[];
  /** Lightweight observation provenance used by adaptive verification. */
  observations?: BrowserObservations;
}

export type ObservationState = "pass" | "fail" | "unavailable";
export type ObservationFreshness = "fresh" | "stale" | "unknown";

export interface SurfaceObservation {
  state: ObservationState;
  freshness: ObservationFreshness;
  provenance: "browser" | "cached" | "webdriver-bidi" | "performance-resource-timing" | "unknown";
  observed?: string;
  warning?: string;
}

export interface BrowserObservations {
  url: SurfaceObservation;
  dom: SurfaceObservation;
  console: SurfaceObservation;
}

export interface EvidenceBundle {
  schemaVersion: 4;
  attemptId?: string;
  phase?: "baseline" | "post-fix" | "manual";
  capturedAt: string;
  session: DebugSessionSummary;
  project: ProjectDescriptor;
  browser: BrowserSnapshot;
  replay: ReplayTimeline;
  redaction: {
    applied: true;
    policy: "default-sensitive-fields";
  };
  truncation?: { optional?: boolean };
}

export const CAPTURE_SURFACES = [
  "dom",
  "console",
  "network",
  "debugger",
  "react",
  "angular",
  "vue",
  "next",
  "vite",
  "accessibility",
  "replay",
  "screenshot",
  "webmcp",
] as const;
export type CaptureSurface = typeof CAPTURE_SURFACES[number];

export type CaptureView =
  | { profile: "summary" }
  | { profile: "full" }
  | { profile: "include"; surfaces: CaptureSurface[] }
  | { profile: "delta"; cursor: string; surfaces?: CaptureSurface[] };

export interface CaptureSummary {
  title: string;
  viewport: ViewportSize | null;
  bodyText: string;
  domElements: number;
  console: {
    total: number;
    errors: number;
    warnings: number;
    latestErrors: ConsoleEntry[];
  };
  network: {
    total: number;
    failed: number;
    pending: number;
    latestFailures: NetworkEntry[];
  };
  debugger: {
    paused: boolean;
    reason: string | null;
    callFrames: number;
    breakpoints: number;
  };
  runtimes: Record<"react" | "angular" | "vue" | "next" | "vite" | "accessibility", "present" | "not-detected" | "unavailable">;
  replay: {
    frames: number;
    truncated: boolean;
    oldestIndex: number | null;
    newestIndex: number | null;
    restorable: boolean;
    restoreBlockedReason: string | null;
  };
  webmcp: {
    state: RuntimeCapabilityState;
    callableTools: number;
    truncated: boolean;
  };
  observations: BrowserObservations | null;
}

export interface CaptureDetails {
  dom?: DomSnapshot;
  console?: ConsoleEntry[];
  network?: NetworkEntry[];
  debugger?: DebuggerSnapshot;
  react?: ReactSnapshot | null;
  angular?: AngularSnapshot | null;
  vue?: VueSnapshot | null;
  next?: NextSnapshot | null;
  vite?: ViteSnapshot | null;
  accessibility?: AccessibilityDiagnostics | null;
  replay?: ReplayTimeline;
  screenshot?: { status: "captured" | "suppressed" | "unavailable" };
  webmcp?: WebMcpCaptureDetail | null;
}

export interface IssueCaptureResult {
  schemaVersion: 5;
  profile: "summary" | "full" | "include" | "delta";
  capturedAt: string;
  cursor: string;
  session: {
    id: string;
    url: string;
    status: SessionStatus;
    target: Pick<BrowserTarget, "schemaVersion" | "browser" | "remote" | "viewport" | "isolated" | "mode"> | null;
    projectCapabilities: ProjectCapabilities;
    runtimeCapabilities: BrowserRuntimeCapabilities | null;
  };
  project: {
    frameworks: Framework[];
    confidence: DetectionConfidence;
    ambiguous: boolean;
    projectCapabilities: ProjectCapabilities;
  };
  summary: CaptureSummary;
  redaction: {
    applied: true;
    policy: "default-sensitive-fields";
  };
  warnings: string[];
  truncation: {
    applied: boolean;
    omittedSurfaces: CaptureSurface[];
  };
  includedSurfaces?: CaptureSurface[];
  fromCursor?: string;
  changedSurfaces?: CaptureSurface[];
  unchangedSurfaces?: CaptureSurface[];
  details?: CaptureDetails;
}

export type ScenarioCheck =
  | { kind: "route"; path: string }
  | { kind: "locatorText"; locator: BrowserLocator; text: string; match?: "exact" | "contains" }
  | { kind: "locatorCount"; locator: BrowserLocator; count: number }
  | { kind: "locatorVisible"; locator: BrowserLocator; visible: boolean }
  | { kind: "locatorEnabled"; locator: BrowserLocator; enabled: boolean }
  | { kind: "locatorDisabled"; locator: BrowserLocator; disabled: boolean }
  | { kind: "locatorChecked"; locator: BrowserLocator; checked: boolean }
  | { kind: "noConsoleErrors" };

export type CheckExpectation = "pass" | "fail";

export type FailureSignatureEntry = ScenarioCheck & {
  expected: CheckExpectation;
};

export interface ScenarioRiskSignals {
  async?: boolean;
  timing?: boolean;
  concurrency?: boolean;
  browserStateLeakage?: boolean;
  serverStateLeakage?: boolean;
  priorFlakiness?: boolean;
}

export interface ServerStateResetContract {
  action?: ReplayableBrowserAction;
  readyCheck?: ScenarioCheck;
}

export interface CheckpointProbe {
  name: string;
  locator: BrowserLocator;
  property: LocatorProperty;
  expected: LocatorProbeValue;
  match?: "exact" | "contains";
}

export interface ScenarioCheckpoint {
  name: string;
  offset: number;
  probes: CheckpointProbe[];
  route?: string;
}

export interface ViewportContract {
  name: string;
  width: number;
  height: number;
}

export interface ViewportObservation {
  name: string;
  width: number;
  height: number;
  verdict: "pass" | "fail" | "unavailable" | "inconclusive";
  observationCount: number;
  checkpointCount: number;
  failingObservations: string[];
  unavailableObservations: string[];
  digest: string;
  checkpointDigest?: string;
  elapsedMs: number;
  warnings: string[];
}

export interface MatrixAttemptSummary {
  phase: "baseline" | "post-fix";
  attemptId: string;
  ordinal: number;
  verdict: "pass" | "fail" | "unavailable" | "inconclusive";
  viewports: ViewportObservation[];
  elapsedMs: number;
  warnings: string[];
}

export type VerificationLevel = "quick" | "standard" | "strict";
export type VerificationOutcome = "verified" | "failed" | "inconclusive";
export type BaselineStatus = "reproduced" | "not_reproduced" | "inconclusive";
export type AttemptTermination =
  | "decisive-match"
  | "decisive-non-match"
  | "retryable"
  | "permanent"
  | "budget-exhausted";

export interface VerificationProfile {
  maxAttempts: number;
  budgetMs: number;
}

export interface PhaseBudget {
  level: VerificationLevel;
  maxAttempts: number;
  budgetMs: number;
}

export const VERIFICATION_PROFILES: Record<VerificationLevel, VerificationProfile> = {
  quick: { maxAttempts: 1, budgetMs: 15_000 },
  standard: { maxAttempts: 3, budgetMs: 60_000 },
  strict: { maxAttempts: 5, budgetMs: 120_000 },
};

export interface BuildReference {
  source: "caller" | "unavailable";
  value?: string;
}

export interface EnvironmentFingerprint {
  schemaVersion: 4;
  projectRoot: string;
  descriptor: string;
  projectFrameworks: Framework[];
  projectConfidence: DetectionConfidence;
  projectAmbiguous: boolean;
  origin: string;
  path: string;
  browser: BrowserEngine | null;
  browserVersion: string | null;
  adapterMode: "launch" | "attach" | "webdriver" | null;
  targetId: string | null;
  remote: boolean;
  isolated: boolean;
  viewport: ViewportSize | null;
  tls: "strict" | "allow-insecure-loopback";
  authFixture: "seeded-disposable" | "none";
  runtimeTransport: BrowserRuntimeCapabilities["transport"] | null;
  runtimeCapabilityStates: Record<string, RuntimeCapabilityState>;
  nodeVersion: string;
  platform: string;
  architecture: string;
}

export interface ScenarioBaseline {
  status: BaselineStatus;
  level: VerificationLevel;
  flaky: boolean;
  budget: PhaseBudget;
  attempts: AttemptSummary[];
  observedRate: RateSummary;
  evidence: EvidenceBundle | null;
  warnings: string[];
  viewportConsensus?: Record<string, string>;
  termination: string;
  truncation?: { attempts?: boolean; evidence?: boolean; result?: boolean };
}

export interface PublicReproScenario {
  schemaVersion: 6;
  id: string;
  sessionId: string;
  name: string;
  url: string;
  actions: ReplayableBrowserAction[];
  failureSignature: FailureSignatureEntry[];
  acceptanceChecks: ScenarioCheck[];
  regressionChecks: ScenarioCheck[];
  checkpoints: ScenarioCheckpoint[];
  viewports: ViewportContract[];
  failureViewports?: string[];
  authFixture: "seeded-disposable" | "none";
  tls: "strict" | "allow-insecure-loopback";
  risks: ScenarioRiskSignals;
  serverStateReset?: ServerStateResetContract;
  requestedLevel: VerificationLevel;
  buildReference: BuildReference;
  environmentFingerprint: EnvironmentFingerprint;
  contractHash: string;
  persistence: "in-memory";
  createdAt: string;
  baseline: ScenarioBaseline;
}

export interface PrivateReproScenario extends PublicReproScenario {
  /** Raw URL retained only in the private in-memory scenario for replay. */
  privateUrl: string;
  privateActions: ReplayableBrowserAction[];
  privateAuthState?: PlaywrightStorageState;
}

export interface PlaywrightStorageCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

export interface PlaywrightStorageOrigin {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
}

export interface PlaywrightStorageState {
  cookies: PlaywrightStorageCookie[];
  origins: PlaywrightStorageOrigin[];
}

export type CheckObservation = ScenarioCheck & {
  state: ObservationState;
  freshness: ObservationFreshness;
  provenance: SurfaceObservation["provenance"];
  observed?: string;
  expected?: CheckExpectation | LocatorProbeValue;
  warning?: string;
};

export interface AttemptSummary {
  phase: "baseline" | "post-fix";
  attemptId: string;
  ordinal: number;
  startedAt: string;
  elapsedMs: number;
  termination: AttemptTermination;
  match?: boolean;
  passed?: boolean;
  checks: CheckObservation[];
  checkpoints?: Array<{
    name: string;
    offset: number;
    observations: CheckObservation[];
    state: ObservationState;
  }>;
  availableChecks: number;
  decisiveChecks: number;
  retryable: boolean;
  conflict?: boolean;
  reset: {
    mode: "fresh-launch" | "attached-target" | "webdriver-target" | "none";
    isolated: boolean;
    browserProfile: "fresh" | "retained" | "unavailable";
    storage: "fresh" | "retained" | "unavailable";
    cache: "fresh" | "retained" | "unavailable";
    serviceWorkers: "fresh" | "retained" | "unavailable";
    serverState: "not-reset" | "reset-by-scenario" | "unavailable";
  };
  error?: string;
  truncation?: { checks?: boolean; error?: boolean };
  viewport?: ViewportObservation;
  viewports?: ViewportObservation[];
}

export interface RateSummary {
  matches?: number;
  passes?: number;
  failures?: number;
  decisive: number;
  rate: number | null;
  retryable: number;
  unavailable: number;
  cancelled: number;
  exhausted: number;
}

export interface VerificationResult {
  schemaVersion: 6;
  outcome: VerificationOutcome;
  level: VerificationLevel;
  requestedLevel: VerificationLevel;
  escalations: string[];
  flaky: boolean;
  scenario: PublicReproScenario;
  baseline: {
    status: BaselineStatus;
    flaky: boolean;
    attempts: AttemptSummary[];
    observedRate: RateSummary;
  };
  postFix: {
    attempts: AttemptSummary[];
    observedRate: RateSummary;
  };
  observedRates: {
    baseline: RateSummary;
    postFix: RateSummary;
  };
  budget: {
    baseline: PhaseBudget;
    postFix: PhaseBudget;
  };
  cleanup: {
    budgetMs: 5_000;
    status: "deferred-to-session-close" | "complete" | "incomplete";
  };
  evidence: {
    baseline: EvidenceBundle | null;
    postFix: EvidenceBundle | null;
  };
  environmentFingerprint: EnvironmentFingerprint;
  contractHash: string;
  buildReference: {
    baseline: BuildReference;
    postFix: BuildReference;
  };
  isolation: NonNullable<BrowserTarget["isolation"]> & { reset: "fresh" | "retained" | "insufficient" };
  persistence: "in-memory";
  warnings: string[];
  termination: string;
  truncation: {
    result: boolean;
    attempts: boolean;
    evidence: boolean;
    warnings: boolean;
  };
}
