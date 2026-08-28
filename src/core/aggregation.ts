import { createHash } from "node:crypto";

import type {
  CheckObservation,
  MatrixAttemptSummary,
  ObservationState,
  ViewportObservation,
} from "../domain/types.js";
import { MAX_DECISIVE_OBSERVATIONS, MAX_EVIDENCE_BUNDLE_BYTES, MAX_RESULT_BYTES } from "../domain/types.js";

export interface ProbeObservationInput {
  key: string;
  state: ObservationState;
  freshness: "fresh" | "stale" | "unknown";
  provenance: string;
  observed?: unknown;
}

export interface ViewportAggregationInput {
  name: string;
  width: number;
  height: number;
  observations: ProbeObservationInput[];
  checkpoints?: ProbeObservationInput[];
}

export interface PureViewportVerdict extends ViewportObservation {
  observations: ProbeObservationInput[];
}

export interface PureAttemptVerdict {
  verdict: "pass" | "fail" | "unavailable" | "inconclusive";
  viewports: PureViewportVerdict[];
}

/** Stable canonical digest for decisive observation comparisons. */
export function observationDigest(observations: readonly ProbeObservationInput[]): string {
  const canonical = observations.map((observation) => ({ key: observation.key, state: observation.state, freshness: observation.freshness, provenance: observation.provenance, observed: observation.observed })).sort((left, right) => left.key.localeCompare(right.key));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function aggregateViewport(input: ViewportAggregationInput): PureViewportVerdict {
  const observations = [...input.observations];
  const checkpoints = [...(input.checkpoints ?? [])];
  const all = [...observations, ...checkpoints];
  const unavailable = all.filter((observation) => observation.state === "unavailable" || observation.freshness !== "fresh");
  const failures = all.filter((observation) => observation.state === "fail");
  const verdict: PureViewportVerdict["verdict"] = unavailable.length > 0 ? "unavailable" : failures.length > 0 ? "fail" : "pass";
  return {
    name: input.name,
    width: input.width,
    height: input.height,
    verdict,
    observationCount: observations.length,
    checkpointCount: checkpoints.length,
    failingObservations: failures.map((observation) => observation.key).slice(0, MAX_DECISIVE_OBSERVATIONS),
    unavailableObservations: unavailable.map((observation) => observation.key).slice(0, MAX_DECISIVE_OBSERVATIONS),
    digest: observationDigest(all),
    elapsedMs: 0,
    warnings: [],
    observations,
  };
}

export function aggregateAttempt(viewports: readonly PureViewportVerdict[]): PureAttemptVerdict {
  const ordered = [...viewports];
  const verdict = ordered.some((viewport) => viewport.verdict === "unavailable") ? "unavailable" : ordered.some((viewport) => viewport.verdict === "fail") ? "fail" : ordered.length > 0 && ordered.every((viewport) => viewport.verdict === "pass") ? "pass" : "inconclusive";
  return { verdict, viewports: ordered };
}

/** A requested failure scope is an exact name set, never inferred from size. */
export function aggregateBaselineWithFailureViewports(viewports: readonly PureViewportVerdict[], failureViewports?: readonly string[]): "pass" | "fail" | "inconclusive" {
  if (viewports.length === 0 || viewports.some((viewport) => viewport.verdict === "unavailable" || viewport.verdict === "inconclusive")) return "inconclusive";
  const requested = failureViewports ? new Set(failureViewports) : new Set(viewports.map((viewport) => viewport.name));
  const names = new Set(viewports.map((viewport) => viewport.name));
  if ([...requested].some((name) => !names.has(name))) return "inconclusive";
  const reproduced = viewports.filter((viewport) => viewport.verdict === "pass").map((viewport) => viewport.name);
  const reproducedSet = new Set(reproduced);
  return [...requested].every((name) => reproducedSet.has(name)) && viewports.filter((viewport) => !requested.has(viewport.name)).every((viewport) => viewport.verdict === "fail") ? "pass" : "fail";
}

export function aggregatePostFixEveryViewport(viewports: readonly PureViewportVerdict[]): "pass" | "fail" | "inconclusive" {
  if (viewports.some((viewport) => viewport.verdict === "unavailable" || viewport.verdict === "inconclusive")) return "inconclusive";
  return viewports.length > 0 && viewports.every((viewport) => viewport.verdict === "pass") ? "pass" : "fail";
}

export function aggregatePhase(attempts: readonly PureAttemptVerdict[], requiredPasses: number, requiredMatches = requiredPasses): "pass" | "fail" | "inconclusive" {
  const passes = attempts.filter((attempt) => attempt.verdict === "pass").length;
  const failures = attempts.filter((attempt) => attempt.verdict === "fail").length;
  if (passes >= requiredPasses) return "pass";
  if (failures >= requiredMatches) return "fail";
  return "inconclusive";
}

export function compileViewportConsensus(baseline: readonly PureViewportVerdict[]): Map<string, string> | null {
  const byName = new Map<string, string>();
  for (const viewport of baseline) {
    if (viewport.verdict !== "pass") return null;
    const prior = byName.get(viewport.name);
    if (prior && prior !== viewport.digest) return null;
    byName.set(viewport.name, viewport.digest);
  }
  return byName;
}

/** Remove optional data only after a final verdict exists. */
export function pruneBoundedResult<T>(value: T, maxBytes = MAX_RESULT_BYTES): { value: T; truncated: boolean; reason?: string } {
  const clone = structuredClone(value);
  if (serializedBytes(clone) <= maxBytes) return { value: clone, truncated: false };
  const mutable = clone as any;
  if (mutable?.evidence) {
    mutable.evidence = null;
    if (serializedBytes(mutable) <= maxBytes) return { value: mutable, truncated: true, reason: "optional evidence removed" };
  }
  if (mutable?.warnings && Array.isArray(mutable.warnings)) mutable.warnings = mutable.warnings.slice(0, 20);
  if (mutable?.attempts && Array.isArray(mutable.attempts)) mutable.attempts = mutable.attempts.slice(0, 2);
  if (serializedBytes(mutable) <= maxBytes) return { value: mutable, truncated: true, reason: "optional detail removed" };
  return { value: { outcome: "inconclusive", termination: "RESULT_LIMIT_EXCEEDED", warnings: ["The bounded result exceeded its serialized size limit."] } as T, truncated: true, reason: "RESULT_LIMIT_EXCEEDED" };
}

export function evidenceWithinBound(value: unknown): boolean { return serializedBytes(value) <= MAX_EVIDENCE_BUNDLE_BYTES; }
export function resultWithinBound(value: unknown): boolean { return serializedBytes(value) <= MAX_RESULT_BYTES; }
function serializedBytes(value: unknown): number { return Buffer.byteLength(JSON.stringify(value)); }

// Keep these imports part of this module's public contract for consumers that
// build pure aggregation inputs from adapter check observations.
export function checkObservationInput(check: CheckObservation, key: string): ProbeObservationInput {
  return { key, state: check.state, freshness: check.freshness, provenance: check.provenance, observed: check.observed };
}

export type { MatrixAttemptSummary };
