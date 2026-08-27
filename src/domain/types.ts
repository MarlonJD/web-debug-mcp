export type Framework = "vanilla" | "react" | "vite" | "next";

export type BrowserEngine = "chromium" | "safari";

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
}

export type BrowserAction =
  | { kind: "navigate"; url: string }
  | { kind: "click"; selector: string }
  | { kind: "fill"; selector: string; value: string }
  | { kind: "wait"; selector: string; text?: string; timeoutMs?: number }
  | { kind: "wait"; text: string; selector?: string; timeoutMs?: number }
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
  schemaVersion: 1;
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
}

export interface ScenarioCheck {
  kind: "urlContains" | "textContains" | "noConsoleErrors";
  value?: string;
}

export type CheckExpectation = "pass" | "fail";

export interface FailureSignatureEntry extends ScenarioCheck {
  expected: CheckExpectation;
}

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
  schemaVersion: 1;
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
  termination: string;
  terminationReason?: string;
  truncation?: { attempts?: boolean; evidence?: boolean; result?: boolean };
}

export interface PublicReproScenario {
  schemaVersion: 2;
  id: string;
  sessionId: string;
  name: string;
  url: string;
  actions: BrowserAction[];
  failureSignature: FailureSignatureEntry[];
  acceptanceChecks: ScenarioCheck[];
  regressionChecks: ScenarioCheck[];
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
}

export interface CheckObservation extends ScenarioCheck {
  state: ObservationState;
  freshness: ObservationFreshness;
  provenance: SurfaceObservation["provenance"];
  observed?: string;
  expected?: CheckExpectation;
  warning?: string;
}

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
  schemaVersion: 2;
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
  terminationReason?: string;
  truncation: {
    result: boolean;
    attempts: boolean;
    evidence: boolean;
    warnings: boolean;
  };
}
