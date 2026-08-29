import { redactValue } from "./redaction.js";
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
  return {
    schemaVersion: 3,
    capturedAt: new Date().toISOString(),
    session: { ...session },
    project: { ...project },
    browser: redactValue(browser) as BrowserSnapshot,
    replay: redactValue(replay) as ReplayTimeline,
    redaction: {
      applied: true,
      policy: "default-sensitive-fields",
    },
  };
}
