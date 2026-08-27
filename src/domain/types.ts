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
  | { kind: "wait"; selector?: string; text?: string; timeoutMs?: number }
  | { kind: "reload" };

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
}

export interface EvidenceBundle {
  schemaVersion: 1;
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

export interface ReproScenario {
  id: string;
  name: string;
  url: string;
  actions: BrowserAction[];
  checks: ScenarioCheck[];
  createdAt: string;
}

export interface VerificationResult {
  scenario: ReproScenario;
  passed: boolean;
  checks: Array<ScenarioCheck & { passed: boolean; observed?: string }>;
  evidence: EvidenceBundle;
}
