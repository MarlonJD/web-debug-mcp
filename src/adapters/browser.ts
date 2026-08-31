import type {
  ActionResult,
  DirectBrowserAction,
  BrowserLocator,
  BrowserSnapshot,
  BrowserTarget,
  BrowserEngine,
  BrowserRuntimeCapabilities,
  Framework,
  DebuggerBreakpoint,
  DebuggerSnapshot,
  OperationContext,
  LocatorProbeResult,
  LocatorProperty,
  PlaywrightStorageState,
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
  /** Private core-detected page runtimes used to select target-scoped bridges. */
  frameworks?: Framework[];
  /** Elevated modes are private core-validated settings. They are not
   * serialized into public session summaries. */
  tls?: "strict" | "allow-insecure-loopback";
  approvedOrigin?: string;
  authState?: PlaywrightStorageState;
  authFixture?: "seeded-disposable" | "none";
}

export interface SnapshotOptions {
  artifactDir: string;
  captureScreenshot: boolean;
  /** Checks-only snapshots never request screenshots or optional framework enrichment. */
  checksOnly?: boolean;
  /** Manual replay frames may retain observer data for the following full capture. */
  retainNetwork?: boolean;
  /** Auth-seeded contexts never produce pixels. */
  suppressScreenshot?: boolean;
  accessibility?: boolean;
}

export interface EvaluationResult {
  value: unknown;
  type: string | null;
  description: string | null;
}

export interface BrowserAdapter {
  start(options: BrowserStartOptions, context?: OperationContext): Promise<BrowserTarget>;
  close(context?: OperationContext): Promise<void>;
  act(action: DirectBrowserAction, context?: OperationContext): Promise<ActionResult>;
  probe(locator: BrowserLocator, properties: LocatorProperty[], context?: OperationContext): Promise<LocatorProbeResult>;
  snapshot(options: SnapshotOptions, context?: OperationContext): Promise<BrowserSnapshot>;
  /** Clear only observers owned by this adapter before an attached retry. */
  resetObservers?(context?: OperationContext): Promise<void>;
  /** Prepare the selected target for a replay attempt without claiming isolation. */
  prepareAttempt?(context?: OperationContext): Promise<void>;
  /** Return the exact selected target identity when the transport can provide it. */
  targetIdentity?(): string | null;
  /** Browser version or transport capability metadata, when available. */
  browserVersion?(): string | null;
  /** Capabilities negotiated from the selected live browser transport. */
  runtimeCapabilities(): BrowserRuntimeCapabilities;
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
