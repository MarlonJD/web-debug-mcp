import { redactValue } from "./redaction.js";
import type {
  BrowserSnapshot,
  DebugSessionSummary,
  EvidenceBundle,
  ProjectDescriptor,
} from "../domain/types.js";

export function composeEvidence(
  project: ProjectDescriptor,
  session: DebugSessionSummary,
  browser: BrowserSnapshot,
): EvidenceBundle {
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    session: { ...session },
    project: { ...project },
    browser: redactValue(browser) as BrowserSnapshot,
    redaction: {
      applied: true,
      policy: "default-sensitive-fields",
    },
  };
}
