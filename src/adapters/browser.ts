import type {
  ActionResult,
  BrowserAction,
  BrowserSnapshot,
  BrowserTarget,
  BrowserEngine,
  DebuggerBreakpoint,
  DebuggerSnapshot,
} from "../domain/types.js";

export interface BrowserStartOptions {
  url: string;
  cdpEndpoint?: string;
  webdriverEndpoint?: string;
  executablePath?: string;
  headless?: boolean;
  allowRemote?: boolean;
}

export interface SnapshotOptions {
  artifactDir: string;
  captureScreenshot: boolean;
}

export interface EvaluationResult {
  value: unknown;
  type: string | null;
  description: string | null;
}

export interface BrowserAdapter {
  start(options: BrowserStartOptions): Promise<BrowserTarget>;
  close(): Promise<void>;
  act(action: BrowserAction): Promise<ActionResult>;
  snapshot(options: SnapshotOptions): Promise<BrowserSnapshot>;
  setBreakpoint(input: {
    sourceUrl: string;
    line: number;
    column?: number;
  }): Promise<DebuggerBreakpoint>;
  control(action: "resume" | "stepOver" | "stepInto" | "stepOut"): Promise<DebuggerSnapshot>;
  evaluate(expression: string, allowSideEffects: boolean): Promise<EvaluationResult>;
}

export type BrowserAdapterFactory = (options: {
  allowRemote?: boolean;
  browser?: BrowserEngine;
  webdriverEndpoint?: string;
}) => BrowserAdapter;
