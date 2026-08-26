export type Framework = "vanilla" | "react" | "vite" | "next";

export type SessionStatus = "starting" | "ready" | "paused" | "failed" | "closed";

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
  url: string;
  title: string;
  viewport: { width: number; height: number } | null;
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

export interface ReactComponentNode {
  name: string;
  source: { file: string; line: number; column: number } | null;
  props: Record<string, unknown>;
  hooks: unknown[];
  renderCount: number;
  children: ReactComponentNode[];
}

export interface ReactSnapshot {
  detected: true;
  rendererCount: number;
  commitCount: number;
  components: ReactComponentNode[];
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
  logTail: {
    file: string;
    text: string;
    truncated: boolean;
  } | null;
  warnings: string[];
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
}

export interface ViteSnapshot {
  detected: true;
  endpoint: string;
  root: string;
  moduleCount: number;
  modules: ViteModuleSummary[];
  hmr: {
    active: boolean;
    lastUpdate: { file: string; timestamp: number; moduleCount: number } | null;
  };
  warnings: string[];
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  viewport: { width: number; height: number } | null;
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
