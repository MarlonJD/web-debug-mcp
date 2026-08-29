export type Framework = "vanilla" | "react" | "vite" | "next";

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
  browser: boolean;
  javascriptDebugger: boolean;
  console: boolean;
  network: boolean;
  dom: boolean;
  screenshots: boolean;
  react: boolean;
  vite: boolean;
  next: boolean;
  serverRuntime: boolean;
}

export interface ProjectDescriptor {
  projectRoot: string;
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | null;
  frameworks: Framework[];
  markers: string[];
  capabilities: ProjectCapabilities;
  warnings: string[];
}

export interface BrowserTarget {
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
  id: string;
  projectRoot: string;
  url: string;
  status: SessionStatus;
  createdAt: string;
  artifactDir: string;
  target: BrowserTarget | null;
  capabilities: ProjectCapabilities;
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

export type BrowserAction =
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

export interface ActionResult {
  kind: BrowserAction["kind"];
  url: string;
  title: string;
}

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
  action: BrowserAction | null;
  url: string;
  title: string;
  dom: DomSnapshot;
  console: ConsoleEntry[];
  network: NetworkEntry[];
  debugger: DebuggerSnapshot;
  react: ReactSnapshot | null;
}

export interface ReplayTimeline {
  enabled: true;
  maxFrames: number;
  truncated: boolean;
  frames: ReplayFrame[];
}

export interface ReplaySeekResult {
  sessionId: string;
  frame: ReplayFrame;
  restored: boolean;
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
  next: NextSnapshot | null;
  vite: ViteSnapshot | null;
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
  schemaVersion: 2;
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
  action?: BrowserAction;
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
  schemaVersion: 2;
  projectRoot: string;
  descriptor: string;
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
  schemaVersion: 4;
  id: string;
  sessionId: string;
  name: string;
  url: string;
  actions: BrowserAction[];
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
  privateActions: BrowserAction[];
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
  schemaVersion: 4;
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
