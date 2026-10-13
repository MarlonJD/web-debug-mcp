import { redactValue } from "./redaction.js";
import { redactExecutionDiagnostics } from "./diagnostic-redaction.js";
import type {
  BrowserSnapshot,
  DebugSessionSummary,
  EvidenceBundle,
  ProjectDescriptor,
  ReplayTimeline,
} from "../domain/types.js";

export function composeEvidence(
  project: ProjectDescriptor,
  session: DebugSessionSummary,
  browser: BrowserSnapshot,
  replay: ReplayTimeline,
): EvidenceBundle {
  const { execution, ...observations } = browser;
  return {
    schemaVersion: 4,
    capturedAt: new Date().toISOString(),
    session: { ...session },
    project: { ...project },
    browser: { ...redactValue(observations) as BrowserSnapshot, ...(execution !== undefined ? { execution: execution ? redactExecutionDiagnostics(execution) : null } : {}) },
    replay: redactValue(replay) as ReplayTimeline,
    redaction: {
      applied: true,
      policy: "default-sensitive-fields",
    },
  };
}
