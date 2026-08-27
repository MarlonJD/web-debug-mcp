import type {
  ActionResult,
  BrowserAction,
  BrowserSnapshot,
  BrowserTarget,
  BrowserEngine,
  DebuggerBreakpoint,
  DebuggerSnapshot,
  OperationContext,
  ViewportSize,
} from "../domain/types.js";

export interface BrowserStartOptions {
  url: string;
  targetId?: string;
  cdpEndpoint?: string;
  webdriverEndpoint?: string;
  executablePath?: string;
  headless?: boolean;
  allowRemote?: boolean;
  viewport?: ViewportSize;
}

export interface SnapshotOptions {
  artifactDir: string;
  captureScreenshot: boolean;
  /** Checks-only snapshots never request screenshots or optional framework enrichment. */
  checksOnly?: boolean;
  /** Manual replay frames may retain observer data for the following full capture. */
  retainNetwork?: boolean;
}

export interface EvaluationResult {
  value: unknown;
  type: string | null;
  description: string | null;
}

export interface BrowserAdapter {
  start(options: BrowserStartOptions, context?: OperationContext): Promise<BrowserTarget>;
  close(context?: OperationContext): Promise<void>;
  act(action: BrowserAction, context?: OperationContext): Promise<ActionResult>;
  snapshot(options: SnapshotOptions, context?: OperationContext): Promise<BrowserSnapshot>;
  /** Clear only observers owned by this adapter before an attached retry. */
  resetObservers?(context?: OperationContext): Promise<void>;
  /** Prepare the selected target for a replay attempt without claiming isolation. */
  prepareAttempt?(context?: OperationContext): Promise<void>;
  /** Return the exact selected target identity when the transport can provide it. */
  targetIdentity?(): string | null;
  /** Browser version or transport capability metadata, when available. */
  browserVersion?(): string | null;
  setBreakpoint(input: {
    sourceUrl: string;
    line: number;
    column?: number;
  }, context?: OperationContext): Promise<DebuggerBreakpoint>;
  control(action: "resume" | "stepOver" | "stepInto" | "stepOut", context?: OperationContext): Promise<DebuggerSnapshot>;
  evaluate(expression: string, allowSideEffects: boolean, context?: OperationContext): Promise<EvaluationResult>;
}

export type BrowserAdapterFactory = (options: {
  allowRemote?: boolean;
  browser?: BrowserEngine;
  webdriverEndpoint?: string;
  targetId?: string;
}) => BrowserAdapter;
