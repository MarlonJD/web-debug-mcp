import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { EvidenceBundle, PublicReproScenario, VerificationResult } from "../src/domain/types.js";
import { RetainedEvidenceStore } from "../src/core/retained-evidence.js";
import { recordedFlowOutput, verificationOutput } from "../src/core/verification-output.js";

const SESSION = "00000000-0000-4000-8000-000000000001";
function evidence(index = 0): EvidenceBundle {
  return {
    schemaVersion: 4, capturedAt: new Date(index).toISOString(), attemptId: `attempt-${index}`,
    session: { id: SESSION, artifactDir: "/private/owned" },
    browser: { screenshotPath: "/private/owned/pixels.png", dom: { bodyText: "Observed " + "state ".repeat(3_000) } },
  } as EvidenceBundle;
}

describe("session-owned recorded evidence", () => {
  it("deduplicates immutable observations, preserves hashes, and omits filesystem handles", () => {
    const store = new RetainedEvidenceStore(() => true);
    const input = evidence();
    const first = store.retain(SESSION, input)!;
    expect(store.retain(SESSION, input)).toEqual(first);
    input.browser.dom.bodyText = "Later mutation";
    const record = store.get(first.uri, SESSION);
    expect(record.evidence.browser.dom.bodyText).toContain("Observed");
    expect(JSON.stringify(record)).not.toContain("/private/owned");
    expect(first.sha256).toBe(createHash("sha256").update(JSON.stringify(record.evidence)).digest("hex"));
    expect(first.bytes).toBe(Buffer.byteLength(JSON.stringify(record.evidence)));
    expect(() => store.get(first.uri, "another-session")).toThrow(/unavailable/);
    expect(() => store.retain("another-session", record.evidence)).toThrow(/different session/);
  });

  it("evicts bounded history and expires on time, close and explicit privacy invalidation", () => {
    let now = 0;
    let active = true;
    const store = new RetainedEvidenceStore(() => active, () => now);
    const oldest = store.retain(SESSION, evidence(0))!;
    for (let n = 1; n <= 8; n++) store.retain(SESSION, evidence(n));
    expect(() => store.get(oldest.uri)).toThrow(/unavailable/);
    const latest = store.retain(SESSION, evidence(8))!;
    now = 3_600_000;
    expect(() => store.get(latest.uri)).toThrow(/unavailable/);
    const next = store.retain(SESSION, evidence(9))!;
    store.invalidate(SESSION);
    expect(() => store.get(next.uri)).toThrow(/unavailable/);
    const last = store.retain(SESSION, evidence(10))!;
    active = false;
    expect(() => store.get(last.uri)).toThrow(/unavailable/);
    expect(store.retain(SESSION, evidence(11))).toBeNull();
  });

  it("rejects oversized observations without registering a partial capture", () => {
    const store = new RetainedEvidenceStore(() => true);
    const oversized = evidence(); oversized.browser.dom.bodyText = "x".repeat(100_000);
    expect(() => store.retain(SESSION, oversized)).toThrow(/96 KiB/);
  });

  it.each(["verified", "failed", "inconclusive"] as const)("keeps %s verdicts and all attempt observations intact while reducing output", (outcome) => {
    const store = new RetainedEvidenceStore(() => true);
    const phase = { status: "reproduced", level: "standard", flaky: false, budget: { level: "standard", maxAttempts: 3, budgetMs: 60_000 }, attempts: [{ attemptId: "attempt-1", checks: [{ kind: "noConsoleErrors", state: "pass", freshness: "fresh", provenance: "browser" }] }], observedRate: { decisive: 1, rate: 1 }, evidence: evidence(), warnings: [], termination: "baseline-match" };
    const scenario = { schemaVersion: 6, id: "scenario", sessionId: SESSION, name: "flow", contractHash: "a".repeat(64), persistence: "in-memory", createdAt: "now", baseline: phase } as unknown as PublicReproScenario;
    const value = { schemaVersion: 6, outcome, scenario, baseline: { ...phase, evidence: undefined }, postFix: { attempts: phase.attempts }, evidence: { baseline: evidence(), postFix: evidence(1) }, environmentFingerprint: { origin: "http://127.0.0.1" } } as unknown as VerificationResult;
    const summary = verificationOutput(value, store);
    expect(summary).toMatchObject({ outcome, baseline: { attempts: phase.attempts }, postFix: value.postFix });
    expect(Buffer.byteLength(JSON.stringify(summary))).toBeLessThan(Buffer.byteLength(JSON.stringify(value)) / 3);
    const recorded = recordedFlowOutput(scenario, store);
    expect(recorded.baseline.attempts).toEqual(scenario.baseline.attempts);
  });
});
