/** All public source coordinates are one-based; coverage offsets are UTF-16, end-exclusive. */
export interface SourceLocation { url: string; line: number; column: number }
export interface SourceReference {
  scriptId: string;
  scriptHash: string | null;
  generated: SourceLocation;
  original: SourceLocation | null;
  mapping: "mapped" | "unavailable";
  reason?: string;
}
export interface SourceInventory {
  schemaVersion: 1;
  scope: "main-frame-default-world";
  scripts: Array<{ scriptId: string; url: string; hash: string | null; sources: string[]; mapping: "available" | "unavailable"; reason?: string }>;
  truncated: boolean;
}
export interface DiagnosticOptions { coverage?: boolean; settleMs?: number }
export interface ExecutionDiagnostics {
  schemaVersion: 1;
  actionId: string;
  startedAt: string;
  durationMs: number;
  association: "temporal-window";
  react?: { commitsBefore: number; commitsAfter: number };
  coverage: {
    state: "collected" | "not-requested" | "unavailable";
    backendStart: number | null;
    backendEnd: number | null;
    scripts: Array<{
      scriptId: string;
      url: string;
      hash: string | null;
      functions: Array<{
        name: string;
        blockCoverage: boolean;
        ranges: Array<{ startOffset: number; endOffset: number; count: number; source: SourceReference | null }>;
      }>;
    }>;
  };
  requests: DiagnosticRequest[];
  truncated: boolean;
  cleanup: "complete";
  warnings: string[];
}
export interface DiagnosticRequest {
  requestId: string;
  method: string;
  url: string;
  status: number | null;
  startMs: number;
  endMs: number | null;
  initiator: SourceReference | null;
  initiatorType: string;
  /** CDP initiator evidence connects the request to code, not necessarily to the UI action. */
  association: "cdp-initiator" | "unavailable";
}
export interface BehaviorSummary {
  consoleErrors: string[];
  requests: Array<{ key: string; count: number; failed: number; pending: number }>;
  react: { commits: number; changedKeys: string[] } | null;
  execution: string[] | null;
  requestCompletionOrder: string[] | null;
  truncated: boolean;
}
export interface BehaviorDifference {
  schemaVersion: 1;
  diagnosticOnly: true;
  state: "compared" | "unavailable";
  console: { added: string[]; removed: string[] };
  requests: Array<{ key: string; before: number; after: number; failedBefore: number; failedAfter: number; pendingBefore: number; pendingAfter: number }>;
  react: { commitsBefore: number; commitsAfter: number; addedKeys: string[]; removedKeys: string[] } | null;
  execution: { added: string[]; removed: string[] } | null;
  requestCompletionOrder: { before: string[]; after: string[] } | null;
  truncated: boolean;
  warnings: string[];
}
export interface BreakpointInput {
  sourceUrl: string;
  line: number;
  column?: number;
  coordinateSpace?: "generated" | "original";
  scriptId?: string;
}
