import { createHash } from "node:crypto";

import type {
  AttemptSummary,
  ReplayableBrowserAction,
  BrowserLocator,
  BuildReference,
  CheckObservation,
  CheckpointProbe,
  FailureSignatureEntry,
  PrivateReproScenario,
  PublicReproScenario,
  RateSummary,
  ScenarioCheck,
  ScenarioCheckpoint,
  ScenarioRiskSignals,
  ServerStateResetContract,
  VerificationLevel,
  ViewportContract,
  ViewportSize,
  LocatorProperty,
} from "../domain/types.js";
import {
  BROWSER_PRESS_KEYS,
  MAX_ACCESSIBLE_NAME_CHARS,
  MAX_ATTEMPTS_PER_PHASE,
  MAX_CHECKPOINT_NAME_CHARS,
  MAX_CHECKPOINT_PROBES_TOTAL,
  MAX_CHECKPOINTS,
  MAX_DECISIVE_OBSERVATIONS,
  MAX_LOCATOR_CHARS,
  MAX_PROBES_PER_CHECKPOINT,
  MAX_RESULT_BYTES,
  MAX_SCENARIO_ACTIONS,
  MAX_SCENARIO_NAME_CHARS,
  MAX_VIEWPORT_NAME_CHARS,
  MAX_VIEWPORTS,
  VERIFICATION_PROFILES,
} from "../domain/types.js";
import { WebDebugError } from "./errors.js";
import { boundText, redactText, safeUrl } from "./redaction.js";
import { boundEvidence, serializedBytes } from "./session-evidence.js";
import {
  actionSecrets,
  cloneJson,
  isSensitiveInputAction,
  redactionMarker,
  replaceSecrets,
  scrubText,
} from "./private-values.js";

export interface RecordScenarioInput {
  sessionId: string;
  name: string;
  url: string;
  actions: ReplayableBrowserAction[];
  failureSignature: FailureSignatureEntry[];
  acceptanceChecks: ScenarioCheck[];
  regressionChecks?: ScenarioCheck[];
  risks?: ScenarioRiskSignals;
  requestedLevel?: VerificationLevel;
  buildReference?: BuildReference;
  serverStateReset?: ServerStateResetContract;
  checkpoints?: ScenarioCheckpoint[];
  viewports?: ViewportContract[];
  failureViewports?: string[];
}

export interface VerifyScenarioInput {
  sessionId: string;
  scenarioId: string;
  requestedLevel?: VerificationLevel;
  buildReference?: BuildReference;
}

export function createPrivateScenario(input: Omit<PrivateReproScenario, "actions" | "baseline" | "persistence" | "privateUrl"> & { privateActions: ReplayableBrowserAction[]; serverStateReset?: ServerStateResetContract }): PrivateReproScenario {
  return {
    schemaVersion: 6,
    id: input.id,
    sessionId: input.sessionId,
    name: input.name,
    url: publicScenarioUrl(input.url),
    privateUrl: input.url,
    actions: input.privateActions.map(sanitizeReplayAction) as ReplayableBrowserAction[],
    privateActions: input.privateActions,
    failureSignature: input.failureSignature,
    acceptanceChecks: input.acceptanceChecks,
    regressionChecks: input.regressionChecks,
    checkpoints: input.checkpoints,
    viewports: input.viewports,
    ...(input.failureViewports ? { failureViewports: input.failureViewports } : {}),
    authFixture: input.authFixture,
    tls: input.tls,
    risks: input.risks,
    ...(input.serverStateReset ? { serverStateReset: input.serverStateReset } : {}),
    requestedLevel: input.requestedLevel,
    buildReference: input.buildReference,
    environmentFingerprint: input.environmentFingerprint,
    contractHash: input.contractHash,
    persistence: "in-memory",
    createdAt: input.createdAt,
    baseline: { status: "inconclusive", level: input.requestedLevel, flaky: false, budget: { level: input.requestedLevel, ...profileFor(input.requestedLevel) }, attempts: [], observedRate: emptyRateSummary(), evidence: null, warnings: [], termination: "pending" },
  };
}

export function publicScenario(scenario: PrivateReproScenario): PublicReproScenario {
  const { privateActions: _privateActions, privateUrl: _privateUrl, ...publicValue } = scenario;
  const result = cloneJson({
    ...publicValue,
    actions: scenario.privateActions.map(sanitizeReplayAction),
    failureSignature: cloneSignature(scenario.failureSignature),
    acceptanceChecks: cloneChecks(scenario.acceptanceChecks),
    regressionChecks: cloneChecks(scenario.regressionChecks),
    ...(scenario.serverStateReset ? {
      serverStateReset: {
        ...scenario.serverStateReset,
        ...(scenario.serverStateReset.action ? { action: sanitizeReplayAction(scenario.serverStateReset.action) } : {}),
      },
    } : {}),
    baseline: { ...scenario.baseline, attempts: scenario.baseline.attempts.slice(0, MAX_ATTEMPTS_PER_PHASE), evidence: scenario.baseline.evidence ? boundEvidence(scenario.baseline.evidence) : null },
  }) as PublicReproScenario;
  const sanitized = scrubPublicScenario(result, scenario.privateActions);
  if (serializedBytes(sanitized) > MAX_RESULT_BYTES) {
    sanitized.baseline.evidence = null;
    sanitized.baseline.truncation = { evidence: true, attempts: sanitized.baseline.attempts.length > 2, result: true };
    sanitized.baseline.attempts = sanitized.baseline.attempts.slice(0, 2);
    sanitized.baseline.warnings = [...sanitized.baseline.warnings.slice(0, 10), "Scenario result was deterministically truncated to 256 KiB."];
  }
  return sanitized;
}

export function normalizeAction(action: ReplayableBrowserAction): ReplayableBrowserAction {
  return { ...action } as ReplayableBrowserAction;
}

export function normalizeFailureEntry(entry: FailureSignatureEntry): FailureSignatureEntry {
  return normalizeCheck(entry) as FailureSignatureEntry;
}

export function normalizeCheck(check: ScenarioCheck): ScenarioCheck {
  return { ...check } as ScenarioCheck;
}

export function normalizeCheckpoints(checkpoints: ScenarioCheckpoint[], actionCount: number): ScenarioCheckpoint[] {
  if (!Array.isArray(checkpoints)) throw new WebDebugError("CHECKPOINTS_INVALID", "checkpoints must be an array.");
  if (checkpoints.length > MAX_CHECKPOINTS) throw new WebDebugError("CHECKPOINT_LIMIT", `At most ${MAX_CHECKPOINTS} checkpoints are allowed.`);
  const names = new Set<string>();
  const offsets = new Set<number>();
  let totalProbes = 0;
  const normalized: ScenarioCheckpoint[] = [];
  for (const raw of checkpoints) {
    if (!raw || typeof raw.name !== "string" || raw.name.trim().length === 0 || raw.name.length > MAX_CHECKPOINT_NAME_CHARS || !Number.isInteger(raw.offset) || raw.offset < 0 || raw.offset > actionCount || !Array.isArray(raw.probes)) throw new WebDebugError("CHECKPOINT_INVALID", "Checkpoint names, offsets, and probes must be bounded.");
    if (names.has(raw.name) || offsets.has(raw.offset)) throw new WebDebugError("CHECKPOINT_ORDER_INVALID", "Checkpoint names and offsets must be unique and strictly increasing.");
    names.add(raw.name);
    offsets.add(raw.offset);
    totalProbes += raw.probes.length;
    if (raw.probes.length === 0 && !raw.route) throw new WebDebugError("CHECKPOINT_PROBE_INVALID", "Each checkpoint must include a probe or route observation.");
    if (raw.probes.length > MAX_PROBES_PER_CHECKPOINT || totalProbes > MAX_CHECKPOINT_PROBES_TOTAL) throw new WebDebugError("CHECKPOINT_PROBE_LIMIT", `Checkpoint probes are limited to ${MAX_PROBES_PER_CHECKPOINT} per checkpoint and ${MAX_CHECKPOINT_PROBES_TOTAL} total.`);
    const probes: CheckpointProbe[] = raw.probes.map((probe) => {
      if (!probe || typeof probe.name !== "string" || probe.name.length === 0 || probe.name.length > MAX_CHECKPOINT_NAME_CHARS || !probe.locator || typeof probe.property !== "string" || !["count", "visible", "enabled", "checked", "text"].includes(probe.property) || probe.expected === undefined) throw new WebDebugError("CHECKPOINT_PROBE_INVALID", "Checkpoint probes require unique bounded names, locators, properties, and expectations.");
      validateLocatorCore(probe.locator);
      return { ...probe, locator: { ...probe.locator }, property: probe.property as LocatorProperty };
    });
    if (new Set(probes.map((probe) => probe.name)).size !== probes.length) throw new WebDebugError("CHECKPOINT_PROBE_NAME_INVALID", "Checkpoint probe names must be unique within a checkpoint.");
    normalized.push({ name: raw.name, offset: raw.offset, probes, ...(raw.route ? { route: raw.route } : {}) });
  }
  for (let index = 1; index < normalized.length; index += 1) if (normalized[index]!.offset <= normalized[index - 1]!.offset) throw new WebDebugError("CHECKPOINT_ORDER_INVALID", "Checkpoint offsets must be strictly increasing.");
  return normalized;
}

export function normalizeViewports(viewports?: ViewportContract[], fallback?: ViewportSize): ViewportContract[] {
  if (!viewports || viewports.length === 0) return [{ name: "default", width: fallback?.width ?? 1_440, height: fallback?.height ?? 900 }];
  if (viewports.length > MAX_VIEWPORTS) throw new WebDebugError("VIEWPORT_LIMIT", `At most ${MAX_VIEWPORTS} viewports are allowed.`);
  const names = new Set<string>();
  return viewports.map((raw) => {
    const width = raw.width;
    const height = raw.height;
    if (!raw || typeof raw.name !== "string" || raw.name.length === 0 || raw.name.length > MAX_VIEWPORT_NAME_CHARS || names.has(raw.name) || !Number.isInteger(width) || !Number.isInteger(height) || width < 320 || width > 3_840 || height < 240 || height > 2_160) throw new WebDebugError("VIEWPORT_INVALID", "Viewport names and dimensions must be unique and bounded.");
    names.add(raw.name);
    return { name: raw.name, width, height };
  });
}

export function validateScenarioInput(input: RecordScenarioInput): void {
  if (!input.sessionId) throw new WebDebugError("SESSION_REQUIRED", "sessionId is required to own a recorded scenario.");
  if (typeof input.name !== "string" || !input.name.trim()) throw new WebDebugError("SCENARIO_NAME_EMPTY", "Scenario name cannot be empty.");
  if (input.name.length > MAX_SCENARIO_NAME_CHARS) throw new WebDebugError("SCENARIO_NAME_LIMIT", `Scenario names are limited to ${MAX_SCENARIO_NAME_CHARS} characters.`);
  if (!Array.isArray(input.actions)) throw new WebDebugError("SCENARIO_ACTIONS_REQUIRED", "actions must be an array.");
  if (!Array.isArray(input.failureSignature) || !input.failureSignature.length) throw new WebDebugError("FAILURE_SIGNATURE_REQUIRED", "failureSignature must contain at least one check.");
  if (!Array.isArray(input.acceptanceChecks) || !input.acceptanceChecks.length) throw new WebDebugError("ACCEPTANCE_CHECKS_REQUIRED", "acceptanceChecks must contain at least one check.");
  if (input.actions.length > MAX_SCENARIO_ACTIONS) throw new WebDebugError("SCENARIO_ACTION_LIMIT", `A scenario may contain at most ${MAX_SCENARIO_ACTIONS} actions.`);
  if (input.failureSignature.length > MAX_DECISIVE_OBSERVATIONS || input.acceptanceChecks.length > MAX_DECISIVE_OBSERVATIONS || (input.regressionChecks?.length ?? 0) > MAX_DECISIVE_OBSERVATIONS) throw new WebDebugError("SCENARIO_CHECK_LIMIT", `A scenario may contain at most ${MAX_DECISIVE_OBSERVATIONS} checks per group.`);
  if (input.regressionChecks !== undefined && !Array.isArray(input.regressionChecks)) throw new WebDebugError("REGRESSION_CHECKS_INVALID", "regressionChecks must be an array.");
  for (const action of input.actions) validateAction(action);
  for (const check of [...input.failureSignature, ...input.acceptanceChecks, ...(input.regressionChecks ?? [])]) validateCheck(check);
  normalizeCheckpoints(input.checkpoints ?? [], input.actions.length);
  normalizeViewports(input.viewports);
  if (input.failureViewports && input.failureViewports.length > MAX_VIEWPORTS) throw new WebDebugError("VIEWPORT_LIMIT", `At most ${MAX_VIEWPORTS} failure viewports may be named.`);
  if (input.failureViewports) {
    const names = new Set(normalizeViewports(input.viewports).map((viewport) => viewport.name));
    if (new Set(input.failureViewports).size !== input.failureViewports.length || input.failureViewports.some((name) => !names.has(name))) throw new WebDebugError("FAILURE_VIEWPORT_INVALID", "failureViewports must name unique declared viewport entries.");
  }
  const checkpointObservationCount = (input.checkpoints ?? []).reduce((total, checkpoint) => total + (checkpoint.probes?.length ?? 0) + (checkpoint.route ? 1 : 0), 0);
  const decisiveObservationCount = input.failureSignature.length + input.acceptanceChecks.length + (input.regressionChecks?.length ?? 0) + checkpointObservationCount + (input.serverStateReset?.readyCheck ? 1 : 0);
  if (decisiveObservationCount > MAX_DECISIVE_OBSERVATIONS) throw new WebDebugError("DECISIVE_OBSERVATION_LIMIT", `The scenario exceeded the ${MAX_DECISIVE_OBSERVATIONS}-observation contract before execution.`);
}

export function validateAction(action: ReplayableBrowserAction): void {
  const normalized = normalizeAction(action);
  if ((normalized as { kind?: string }).kind === "webmcp") throw new WebDebugError("WEBMCP_ACTION_NOT_REPLAYABLE", "WebMCP direct actions cannot be recorded or replayed as scenario actions.");
  if ("locator" in normalized) validateLocatorCore(normalized.locator);
  if (normalized.kind === "wait" && (!normalized.locator || !normalized.property || normalized.expected === undefined)) throw new WebDebugError("WAIT_CONDITION_REQUIRED", "A wait must name a locator, property, and expected value.");
  if (normalized.kind === "fill" && (typeof normalized.value !== "string" || normalized.value.length > 10_000)) throw new WebDebugError("FILL_VALUE_INVALID", "Fill values are limited to 10,000 characters.");
  if (normalized.kind === "select" && (!normalized.value || normalized.value.length > MAX_LOCATOR_CHARS)) throw new WebDebugError("SELECT_VALUE_INVALID", `Select values are limited to ${MAX_LOCATOR_CHARS} characters.`);
  if (normalized.kind === "press" && !BROWSER_PRESS_KEYS.includes(normalized.key)) throw new WebDebugError("PRESS_KEY_INVALID", "The key is outside the bounded browser press allowlist.");
}

export function scenarioContractHash(input: Pick<RecordScenarioInput, "url" | "actions" | "failureSignature" | "acceptanceChecks" | "regressionChecks" | "risks" | "serverStateReset"> & { checkpoints?: ScenarioCheckpoint[]; viewports?: ViewportContract[]; failureViewports?: string[]; tls: "strict" | "allow-insecure-loopback"; authFixture: "seeded-disposable" | "none" }): string {
  const canonical = {
    schemaVersion: 6,
    url: canonicalUrl(input.url),
    actions: input.actions.map((action) => sanitizeReplayAction(action)),
    failureSignature: cloneSignature(input.failureSignature),
    acceptanceChecks: cloneChecks(input.acceptanceChecks),
    regressionChecks: cloneChecks(input.regressionChecks ?? []),
    checkpoints: cloneJson(input.checkpoints ?? []),
    viewports: cloneJson(input.viewports ?? []),
    failureViewports: [...(input.failureViewports ?? [])],
    tls: input.tls,
    authFixture: input.authFixture,
    risks: mergeRisks(input.risks),
    serverStateReset: input.serverStateReset ? { ...input.serverStateReset, action: input.serverStateReset.action ? sanitizeReplayAction(input.serverStateReset.action) : undefined } : null,
  };
  return createHash("sha256").update(stableStringify(canonical)).digest("hex");
}

export function mergeRisks(first?: ScenarioRiskSignals): ScenarioRiskSignals {
  return { async: Boolean(first?.async), timing: Boolean(first?.timing), concurrency: Boolean(first?.concurrency), browserStateLeakage: Boolean(first?.browserStateLeakage), serverStateLeakage: Boolean(first?.serverStateLeakage), priorFlakiness: Boolean(first?.priorFlakiness) };
}

export function effectiveRequestedLevel(requested: VerificationLevel | undefined, risks?: ScenarioRiskSignals): VerificationLevel {
  return maxLevel(requested ?? "quick", risks?.priorFlakiness ? "strict" : risks && (risks.async || risks.timing || risks.concurrency || risks.browserStateLeakage || risks.serverStateLeakage) ? "standard" : "quick");
}

export function initialRiskWarnings(risks: ScenarioRiskSignals, level: VerificationLevel): string[] {
  const reasons: string[] = [];
  if (risks.priorFlakiness) reasons.push("prior-flakiness risk selected strict verification.");
  else if (risks.async) reasons.push("async risk selected standard verification.");
  if (risks.timing) reasons.push("timing risk selected standard verification.");
  if (risks.concurrency) reasons.push("concurrency risk selected standard verification.");
  if (risks.browserStateLeakage) reasons.push("browser-state-leakage risk selected standard verification.");
  if (risks.serverStateLeakage) reasons.push("server-state-leakage risk selected standard verification.");
  if (level === "strict" && reasons.length === 0) reasons.push("strict verification was explicitly requested.");
  return reasons;
}

export function maxLevel(first: VerificationLevel, second: VerificationLevel): VerificationLevel {
  const rank: Record<VerificationLevel, number> = { quick: 0, standard: 1, strict: 2 };
  return rank[first] >= rank[second] ? first : second;
}

export function profileFor(level: VerificationLevel) {
  return { ...VERIFICATION_PROFILES[level] };
}

export function normalizeBuildReference(value?: BuildReference): BuildReference {
  if (value?.source === "caller" && value.value?.trim()) return { source: "caller", value: boundText(redactText(value.value), 200) };
  return { source: "unavailable" };
}

export function cloneActions(actions: ReplayableBrowserAction[]): ReplayableBrowserAction[] { return actions.map((action) => ({ ...action } as ReplayableBrowserAction)); }
export function cloneChecks(checks: ScenarioCheck[]): ScenarioCheck[] { return checks.map((check) => ({ ...check })); }
export function cloneSignature(signature: FailureSignatureEntry[]): FailureSignatureEntry[] { return signature.map((entry) => ({ ...entry })); }

export function sanitizeReplayAction(action: ReplayableBrowserAction | null): ReplayableBrowserAction | null {
  if (!action) return null;
  if ((action as { kind?: string }).kind === "webmcp") throw new WebDebugError("WEBMCP_ACTION_NOT_REPLAYABLE", "WebMCP direct actions cannot be recorded or replayed as scenario actions.");
  if (isSensitiveInputAction(action)) {
    const marker = "[REDACTED_REPLAY_INPUT]";
    return { ...action, value: marker.includes(action.value) ? redactionMarker(action.value, [action.value]) : marker } as ReplayableBrowserAction;
  }
  if (action.kind === "navigate") return { ...action, url: safeUrl(action.url) };
  return { ...action };
}

export function scrubPublicScenario(scenario: PublicReproScenario, actions: ReplayableBrowserAction[]): PublicReproScenario {
  const secrets = actionSecrets(actions);
  if (secrets.length === 0) return scenario;
  const sanitized = cloneJson(scenario);
  sanitized.name = scrubText(sanitized.name, secrets);
  sanitized.actions = sanitized.actions.map((action) => replaceSecrets(action, secrets) as ReplayableBrowserAction);
  sanitized.failureSignature = sanitized.failureSignature.map((entry) => replaceSecrets(entry, secrets) as FailureSignatureEntry);
  sanitized.acceptanceChecks = sanitized.acceptanceChecks.map((check) => replaceSecrets(check, secrets) as ScenarioCheck);
  sanitized.regressionChecks = sanitized.regressionChecks.map((check) => replaceSecrets(check, secrets) as ScenarioCheck);
  if (sanitized.serverStateReset) sanitized.serverStateReset = replaceSecrets(sanitized.serverStateReset, secrets) as ServerStateResetContract;
  sanitized.baseline.attempts = sanitized.baseline.attempts.map((attempt) => scrubAttemptSummary(attempt, secrets));
  sanitized.baseline.evidence = sanitized.baseline.evidence ? replaceSecrets(sanitized.baseline.evidence, secrets) as typeof sanitized.baseline.evidence : null;
  sanitized.baseline.warnings = sanitized.baseline.warnings.map((warning) => scrubText(warning, secrets));
  sanitized.buildReference = scrubBuildReference(sanitized.buildReference, secrets);
  return sanitized;
}

export function emptyRateSummary(): RateSummary {
  return { decisive: 0, rate: null, retryable: 0, unavailable: 0, cancelled: 0, exhausted: 0 };
}

function validateCheck(check: ScenarioCheck): void {
  const normalized = normalizeCheck(check);
  if ("locator" in normalized) validateLocatorCore(normalized.locator);
  if (normalized.kind === "route" && (!normalized.path || !normalized.path.startsWith("/"))) throw new WebDebugError("CHECK_VALUE_REQUIRED", "A route check requires an absolute path.");
  if (normalized.kind === "locatorText" && (!normalized.text || !normalized.text.trim())) throw new WebDebugError("CHECK_VALUE_REQUIRED", "A locator text check requires non-empty text.");
  if (normalized.kind === "locatorCount" && (!Number.isInteger(normalized.count) || normalized.count < 0)) throw new WebDebugError("CHECK_VALUE_INVALID", "A locator count check requires a non-negative integer.");
}

function validateLocatorCore(locator: BrowserLocator): void {
  if (!locator || typeof locator !== "object" || !["css", "role", "text", "label", "testId"].includes(locator.kind)) throw new WebDebugError("LOCATOR_INVALID", "A browser locator must use one supported exact strategy.");
  const value = "value" in locator ? locator.value : "text" in locator ? locator.text : locator.role;
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LOCATOR_CHARS) throw new WebDebugError("LOCATOR_INVALID", `Locator values are limited to ${MAX_LOCATOR_CHARS} characters.`);
  if (locator.kind === "role" && locator.name !== undefined && (typeof locator.name !== "string" || locator.name.length > MAX_ACCESSIBLE_NAME_CHARS)) throw new WebDebugError("LOCATOR_INVALID", `Accessible names are limited to ${MAX_ACCESSIBLE_NAME_CHARS} characters.`);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function canonicalUrl(url: string): string {
  try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname}`; }
  catch { return safeUrl(url); }
}

function publicScenarioUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return safeUrl(parsed.toString());
  } catch {
    return safeUrl(url);
  }
}

export function scrubAttemptSummary(attempt: AttemptSummary, secrets: string[]): AttemptSummary {
  const sanitized = cloneJson(attempt);
  sanitized.checks = sanitized.checks.map((check) => replaceSecrets(check, secrets) as CheckObservation);
  if (sanitized.error) sanitized.error = scrubText(sanitized.error, secrets);
  return sanitized;
}

export function scrubBuildReference(reference: BuildReference, secrets: string[]): BuildReference {
  return reference.value ? { ...reference, value: scrubText(reference.value, secrets) } : reference;
}
