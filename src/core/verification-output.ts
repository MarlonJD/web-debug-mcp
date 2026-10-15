import type { EvidenceBundle, PublicReproScenario, ScenarioBaseline, ScenarioCompletion, VerificationResult } from "../domain/types.js";
import type { ScreenshotCandidate } from "./artifact-store.js";
import type { EvidenceReference } from "./retained-evidence.js";
import { RetainedEvidenceStore } from "./retained-evidence.js";

const VERIFICATION_SCREENSHOTS = Symbol("verification-screenshots");

export type RecordedFlowSummary = {
  schemaVersion: 7;
  profile: "summary";
  id: string;
  sessionId: string;
  name: string;
  contractHash: string;
  persistence: "in-memory";
  createdAt: string;
  minimumPostFixAttempts: number;
  completion?: ScenarioCompletion;
  baseline: Omit<ScenarioBaseline, "evidence"> & { evidence: EvidenceReference | null };
};
export type VerificationSummary = Omit<VerificationResult, "schemaVersion" | "scenario" | "environmentFingerprint" | "evidence"> & {
  schemaVersion: 7;
  profile: "summary";
  sessionId: string;
  scenarioId: string;
  minimumPostFixAttempts: number;
  evidence: { baseline: EvidenceReference | null; postFix: EvidenceReference | null };
};

/** Project the same authoritative result; no checks or browser work are skipped for summary output. */
export function recordedFlowOutput(value: PublicReproScenario, store: RetainedEvidenceStore): RecordedFlowSummary {
  return withScreenshots({
    schemaVersion: 7, profile: "summary", id: value.id, sessionId: value.sessionId,
    name: value.name, contractHash: value.contractHash, persistence: value.persistence, createdAt: value.createdAt,
    minimumPostFixAttempts: value.minimumPostFixAttempts ?? 1,
    ...(value.completion ? { completion: value.completion } : {}),
    baseline: { ...value.baseline, evidence: store.retain(value.sessionId, value.baseline.evidence) },
  }, [["baseline", value.baseline.evidence]]);
}

export function verificationOutput(value: VerificationResult, store: RetainedEvidenceStore): VerificationSummary {
  const { scenario, environmentFingerprint: _fingerprint, evidence, schemaVersion: _version, ...result } = value;
  return withScreenshots({
    ...result, schemaVersion: 7, profile: "summary", sessionId: scenario.sessionId, scenarioId: scenario.id,
    minimumPostFixAttempts: scenario.minimumPostFixAttempts ?? 1,
    evidence: { baseline: store.retain(scenario.sessionId, evidence.baseline), postFix: store.retain(scenario.sessionId, evidence.postFix) },
  }, [["baseline", evidence.baseline], ["post-fix", evidence.postFix]]);
}

function withScreenshots<T>(result: T, phases: Array<[string, EvidenceBundle | null]>): T {
  const candidates = phases.flatMap(([name, evidence]): ScreenshotCandidate[] => evidence?.browser.screenshotPath
    ? [{ path: evidence.browser.screenshotPath, artifactDir: evidence.session.artifactDir, name: `${name}.png`, delivery: "resource" }] : []);
  Object.defineProperty(result, VERIFICATION_SCREENSHOTS, { value: candidates });
  return result;
}

export function verificationScreenshots(result: unknown): ScreenshotCandidate[] {
  return (result as { [VERIFICATION_SCREENSHOTS]?: ScreenshotCandidate[] })[VERIFICATION_SCREENSHOTS] ?? [];
}
