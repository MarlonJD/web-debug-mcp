import { performance } from "node:perf_hooks";

import type { BrowserAdapter } from "../adapters/browser.js";
import type {
  AttemptSummary,
  AttemptTermination,
  BaselineStatus,
  BrowserAction,
  BrowserLocator,
  BrowserObservations,
  BrowserSnapshot,
  BrowserTarget,
  CheckExpectation,
  CheckObservation,
  EvidenceBundle,
  LocatorProperty,
  OperationContext,
  RateSummary,
  ScenarioCheck,
  VerificationLevel,
  VerificationResult,
} from "../domain/types.js";
import { MAX_ATTEMPTS_PER_PHASE, MAX_RESULT_BYTES } from "../domain/types.js";
import { WebDebugError, errorMessage } from "./errors.js";
import { actionSecrets, cloneJson, replaceSecrets, scrubText } from "./private-values.js";
import { boundText, redactText } from "./redaction.js";
import { emptyRateSummary, normalizeCheck, scrubAttemptSummary, scrubBuildReference, scrubPublicScenario } from "./scenario-contract.js";
import { pruneEvidence, serializedBytes } from "./session-evidence.js";

const MAX_OBSERVED_CHARS = 500;

export interface PhaseResult {
  level: VerificationLevel;
  status?: BaselineStatus;
  attempts: AttemptSummary[];
  evidence: EvidenceBundle | null;
  observedRate: RateSummary;
  warnings: string[];
  termination: string;
  flaky: boolean;
  viewportConsensus?: Record<string, string>;
}

export function evaluateCheck(check: ScenarioCheck, browser: BrowserSnapshot, expected?: CheckExpectation): CheckObservation {
  const normalized = normalizeCheck(check);
  const observations = browser.observations ?? defaultObservations(browser);
  if (normalized.kind === "route") {
    const surface = observations.url;
    const observed = boundText(browser.url, MAX_OBSERVED_CHARS);
    if (surface.state === "unavailable" || surface.freshness !== "fresh") return { ...normalized, ...(expected ? { expected } : {}), state: "unavailable", freshness: surface.freshness, provenance: surface.provenance, observed, warning: surface.warning ?? "URL observation is unavailable or stale." };
    let actualPath = browser.url;
    try { actualPath = new URL(browser.url).pathname; } catch { /* keep the bounded URL */ }
    return { ...normalized, ...(expected ? { expected } : {}), state: actualPath === normalized.path || browser.url === normalized.path ? "pass" : "fail", freshness: "fresh", provenance: surface.provenance, observed };
  }
  if (normalized.kind === "locatorText") {
    const observed = boundText(browser.dom.bodyText, MAX_OBSERVED_CHARS);
    const match = normalized.match === "exact" ? browser.dom.bodyText.trim() === normalized.text : browser.dom.bodyText.includes(normalized.text);
    return { ...normalized, ...(expected ? { expected } : {}), state: match ? "pass" : "fail", freshness: "fresh", provenance: "browser", observed };
  }
  if (normalized.kind === "noConsoleErrors") {
    const surface = observations.console;
    const observed = `${browser.console.filter((entry) => entry.level === "error" || entry.level === "pageerror").length} console error(s)`;
    if (surface.state === "unavailable" || surface.freshness !== "fresh") return { ...normalized, ...(expected ? { expected } : {}), state: "unavailable", freshness: surface.freshness, provenance: surface.provenance, observed, warning: surface.warning ?? "Console collection is unavailable or stale." };
    return { ...normalized, ...(expected ? { expected } : {}), state: browser.console.some((entry) => entry.level === "error" || entry.level === "pageerror") ? "fail" : "pass", freshness: "fresh", provenance: surface.provenance, observed };
  }
  return { ...normalized, ...(expected ? { expected } : {}), state: "unavailable", freshness: "unknown", provenance: "unknown", warning: "Live locator probe was not available for this adapter." };
}

export async function evaluateCheckLive(adapter: BrowserAdapter, check: ScenarioCheck, browser: BrowserSnapshot, context: OperationContext, expected?: CheckExpectation): Promise<CheckObservation> {
  const normalized = normalizeCheck(check);
  if (!["locatorText", "locatorCount", "locatorVisible", "locatorEnabled", "locatorDisabled", "locatorChecked"].includes(normalized.kind)) return evaluateCheck(normalized, browser, expected);
  const property: LocatorProperty = normalized.kind === "locatorText" ? "text" : normalized.kind === "locatorCount" ? "count" : normalized.kind === "locatorVisible" ? "visible" : normalized.kind === "locatorEnabled" || normalized.kind === "locatorDisabled" ? "enabled" : "checked";
  try {
    const probe = await adapter.probe((normalized as Extract<ScenarioCheck, { locator: BrowserLocator }>).locator, [property], context);
    const observedValue = probe[property];
    const passes = normalized.kind === "locatorText"
      ? typeof observedValue === "string" && (normalized.match === "exact" ? observedValue === normalized.text : observedValue.includes(normalized.text))
      : normalized.kind === "locatorCount"
        ? observedValue === normalized.count
        : normalized.kind === "locatorVisible"
          ? observedValue === normalized.visible
          : normalized.kind === "locatorEnabled"
            ? observedValue === normalized.enabled
            : normalized.kind === "locatorDisabled"
              ? observedValue === !normalized.disabled
              : observedValue === (normalized as Extract<ScenarioCheck, { kind: "locatorChecked" }>).checked;
    return { ...normalized, ...(expected ? { expected } : {}), state: passes ? "pass" : "fail", freshness: "fresh", provenance: probe.provenance, observed: boundText(String(observedValue ?? ""), MAX_OBSERVED_CHARS), ...(probe.warnings.length ? { warning: probe.warnings.join("; ") } : {}) } as CheckObservation;
  } catch (error) {
    return { ...normalized, ...(expected ? { expected } : {}), state: "unavailable", freshness: "unknown", provenance: "unknown", warning: boundText(errorMessage(error), MAX_OBSERVED_CHARS) } as CheckObservation;
  }
}

export function unavailableCheck(check: ScenarioCheck, warning: string, expected?: CheckExpectation): CheckObservation {
  return { ...check, ...(expected ? { expected } : {}), state: "unavailable", freshness: "unknown", provenance: "unknown", warning: boundText(warning, MAX_OBSERVED_CHARS) };
}

export function classifyAttemptError(error: unknown, context: OperationContext): { termination: AttemptTermination; message: string; unavailable?: boolean; cancelled?: boolean } {
  const code = error instanceof WebDebugError ? error.code : "";
  const message = boundText(redactText(errorMessage(error)), MAX_OBSERVED_CHARS);
  if (code === "VERIFICATION_DEADLINE_EXCEEDED" || (context.deadline !== undefined && context.deadline <= (context.clock?.() ?? performance.now()))) return { termination: "budget-exhausted", message, unavailable: true };
  if (code === "REQUEST_CANCELLED" || context.signal?.aborted || isAbortError(error)) return { termination: "permanent", message: "request cancelled", cancelled: true, unavailable: true };
  if (code === "WAIT_TIMEOUT") return { termination: "retryable", message };
  if (["ATTEMPT_START_RETRYABLE", "BROWSER_DISCONNECTED", "BROWSER_START_RETRYABLE", "SESSION_NOT_READY"].includes(code)) return { termination: "retryable", message };
  if (!code && /browser|target closed|connection|disconnected|transport|launch/i.test(message)) return { termination: "retryable", message };
  if (["REQUIRED_OBSERVATION_UNAVAILABLE", "SERVER_STATE_RESET_UNAVAILABLE", "NEXT_UNAVAILABLE", "DEBUGGER_UNAVAILABLE"].includes(code)) return { termination: "permanent", message, unavailable: true };
  return { termination: "permanent", message };
}

export function isCancellationError(error: unknown, context: OperationContext): boolean {
  return context.signal?.aborted === true || error instanceof WebDebugError && error.code === "REQUEST_CANCELLED" || isAbortError(error);
}

export async function reportScenarioProgress(context: OperationContext, event: Parameters<NonNullable<OperationContext["progress"]>>[0]): Promise<void> {
  await context.progress?.(event).catch(() => undefined);
}

export function phaseResult(level: VerificationLevel, status: BaselineStatus | undefined, attempts: AttemptSummary[], evidence: EvidenceBundle | null, observedRate: RateSummary, warnings: string[], termination: string, flaky: boolean): PhaseResult {
  const viewportConsensus = deriveViewportConsensus(attempts);
  return { level, ...(status ? { status } : {}), attempts: attempts.slice(0, MAX_ATTEMPTS_PER_PHASE), evidence, observedRate, warnings: warnings.slice(0, 20), termination, flaky, ...(viewportConsensus ? { viewportConsensus } : {}) };
}

export function emptyPhase(level: VerificationLevel, termination: string, warning: string): PhaseResult {
  return phaseResult(level, undefined, [], null, emptyRateSummary(), [warning], termination, false);
}

export function baselineRate(attempts: AttemptSummary[]): RateSummary {
  const decisive = attempts.filter((attempt) => attempt.match !== undefined).length;
  const matches = attempts.filter((attempt) => attempt.match === true).length;
  return { matches, decisive, rate: decisive ? matches / decisive : null, retryable: attempts.filter((attempt) => attempt.termination === "retryable").length, unavailable: attempts.filter((attempt) => attempt.availableChecks < attempt.checks.length).length, cancelled: attempts.filter((attempt) => attempt.error === "request cancelled").length, exhausted: attempts.filter((attempt) => attempt.termination === "budget-exhausted").length };
}

export function postFixRate(attempts: AttemptSummary[]): RateSummary {
  const decisive = attempts.filter((attempt) => attempt.passed !== undefined).length;
  const passes = attempts.filter((attempt) => attempt.passed === true).length;
  const failures = attempts.filter((attempt) => attempt.passed === false).length;
  return { passes, failures, decisive, rate: decisive ? passes / decisive : null, retryable: attempts.filter((attempt) => attempt.termination === "retryable").length, unavailable: attempts.filter((attempt) => attempt.availableChecks < attempt.checks.length).length, cancelled: attempts.filter((attempt) => attempt.error === "request cancelled").length, exhausted: attempts.filter((attempt) => attempt.termination === "budget-exhausted").length };
}

export function resetFacts(target: BrowserTarget | null, first: boolean, forcedMode?: AttemptSummary["reset"]["mode"]): AttemptSummary["reset"] {
  const mode = forcedMode ?? (target?.browser === "safari" ? "webdriver-target" : target?.isolated ? "fresh-launch" : target ? "attached-target" : "none");
  const isolated = target?.isolated ?? false;
  return { mode, isolated, browserProfile: isolated ? "fresh" : first ? "unavailable" : "retained", storage: isolated ? "fresh" : "unavailable", cache: isolated ? "fresh" : "unavailable", serviceWorkers: isolated ? "fresh" : "unavailable", serverState: "not-reset" };
}

export function isolationResult(target: BrowserTarget | null, reset: "fresh" | "retained" | "insufficient") {
  const isolation = target?.isolation ?? { browserProcess: Boolean(target?.isolated), context: Boolean(target?.isolated), profile: Boolean(target?.isolated), storage: Boolean(target?.isolated), cache: Boolean(target?.isolated), serviceWorkers: Boolean(target?.isolated), navigation: Boolean(target?.isolated), serverState: false };
  return { ...isolation, reset };
}

export function scrubChecks(checks: CheckObservation[], actions: BrowserAction[]): CheckObservation[] {
  const secrets = actionSecrets(actions);
  if (secrets.length === 0) return checks;
  return checks.map((check) => replaceSecrets(check, secrets) as CheckObservation);
}

export function scrubVerificationResult(result: VerificationResult, actions: BrowserAction[]): VerificationResult {
  const secrets = actionSecrets(actions);
  if (secrets.length === 0) return result;
  const sanitized = cloneJson(result);
  sanitized.scenario = scrubPublicScenario(sanitized.scenario, actions);
  sanitized.baseline.attempts = sanitized.baseline.attempts.map((attempt) => scrubAttemptSummary(attempt, secrets));
  sanitized.postFix.attempts = sanitized.postFix.attempts.map((attempt) => scrubAttemptSummary(attempt, secrets));
  sanitized.evidence = {
    baseline: sanitized.evidence.baseline ? replaceSecrets(sanitized.evidence.baseline, secrets) as EvidenceBundle : null,
    postFix: sanitized.evidence.postFix ? replaceSecrets(sanitized.evidence.postFix, secrets) as EvidenceBundle : null,
  };
  sanitized.escalations = sanitized.escalations.map((warning) => scrubText(warning, secrets));
  sanitized.warnings = sanitized.warnings.map((warning) => scrubText(warning, secrets));
  sanitized.buildReference = {
    baseline: scrubBuildReference(sanitized.buildReference.baseline, secrets),
    postFix: scrubBuildReference(sanitized.buildReference.postFix, secrets),
  };
  return sanitized;
}

export function boundVerificationResult(result: VerificationResult): VerificationResult {
  const value = cloneJson(result);
  value.scenario.baseline.evidence = null;
  value.warnings = value.warnings.slice(0, 20).map((warning) => boundText(warning, 500));
  value.baseline.attempts = value.baseline.attempts.slice(0, MAX_ATTEMPTS_PER_PHASE);
  value.postFix.attempts = value.postFix.attempts.slice(0, MAX_ATTEMPTS_PER_PHASE);
  value.truncation = { result: false, attempts: false, evidence: Boolean(value.evidence.baseline?.truncation?.optional || value.evidence.postFix?.truncation?.optional), warnings: result.warnings.length > 20 };
  if (serializedBytes(value) <= MAX_RESULT_BYTES) return value;
  value.truncation.evidence = true;
  value.scenario.baseline.evidence = null;
  value.evidence.baseline = null;
  if (value.evidence.postFix) value.evidence.postFix = pruneEvidence(value.evidence.postFix);
  if (serializedBytes(value) > MAX_RESULT_BYTES) {
    value.truncation.attempts = true;
    value.baseline.attempts = value.baseline.attempts.slice(0, 2);
    value.postFix.attempts = value.postFix.attempts.slice(0, 2);
  }
  if (serializedBytes(value) > MAX_RESULT_BYTES) {
    value.truncation.result = true;
    value.evidence.postFix = null;
    value.warnings = [...value.warnings.slice(0, 9), "Verification result was deterministically truncated to 256 KiB."];
  }
  if (serializedBytes(value) > MAX_RESULT_BYTES) {
    value.truncation.result = true;
    value.scenario.baseline.attempts = [];
    value.baseline.attempts = [];
    value.postFix.attempts = [];
    value.outcome = "inconclusive";
    value.termination = "RESULT_LIMIT_EXCEEDED";
    value.warnings = ["Verification result was deterministically truncated to 256 KiB."];
  }
  return value;
}

function defaultObservations(browser: BrowserSnapshot): BrowserObservations {
  return { url: { state: "pass", freshness: "fresh", provenance: "browser", observed: browser.url }, dom: { state: "pass", freshness: browser.debugger.paused ? "stale" : "fresh", provenance: browser.debugger.paused ? "cached" : "browser" }, console: { state: "pass", freshness: "fresh", provenance: "browser" } };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || /aborted|cancelled/i.test(error.message));
}

function deriveViewportConsensus(attempts: AttemptSummary[]): Record<string, string> | undefined {
  const summaries = attempts.flatMap((attempt) => attempt.viewports ? [attempt.viewports] : []);
  if (summaries.length === 0) return undefined;
  const consensus: Record<string, string> = {};
  for (const summary of summaries) {
    for (const viewport of summary) {
      if (!viewport.checkpointDigest) continue;
      if (consensus[viewport.name] !== undefined && consensus[viewport.name] !== viewport.checkpointDigest) return undefined;
      consensus[viewport.name] = viewport.checkpointDigest;
    }
  }
  return Object.keys(consensus).length > 0 ? consensus : undefined;
}
