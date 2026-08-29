import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { mkdtemp, readdir, rm } from "node:fs/promises";

import { ChromiumAdapter } from "../adapters/chromium.js";
import type { BrowserAdapter, BrowserAdapterFactory, BrowserStartOptions } from "../adapters/browser.js";
import { NextAdapter } from "../adapters/next.js";
import { SafariAdapter } from "../adapters/safari.js";
import { ViteAdapter } from "../adapters/vite.js";
import type {
  ActionResult,
  AttemptSummary,
  AttemptTermination,
  BaselineStatus,
  BrowserAction,
  BrowserLocator,
  BrowserObservations,
  BrowserSnapshot,
  BrowserTarget,
  BuildReference,
  CheckExpectation,
  CheckObservation,
  DebugSessionSummary,
  EnvironmentFingerprint,
  EvidenceBundle,
  FailureSignatureEntry,
  NextInspection,
  NextInspectionResult,
  OperationContext,
  PrivateReproScenario,
  ProjectDescriptor,
  PublicReproScenario,
  RateSummary,
  ReplayFrame,
  ReplaySeekResult,
  ReplayTimeline,
  ScenarioCheck,
  ScenarioRiskSignals,
  ServerStateResetContract,
  VerificationLevel,
  VerificationOutcome,
  VerificationResult,
  ViewportSize,
  CheckpointProbe,
  ScenarioCheckpoint,
  ViewportContract,
  LocatorProperty,
  LocatorProbeResult,
  PlaywrightStorageState,
} from "../domain/types.js";
import {
  MAX_SCENARIO_ACTIONS,
  MAX_LOCATOR_CHARS,
  MAX_ACCESSIBLE_NAME_CHARS,
  MAX_SCENARIO_NAME_CHARS,
  MAX_CHECKPOINT_NAME_CHARS,
  MAX_VIEWPORT_NAME_CHARS,
  MAX_CHECKPOINTS,
  MAX_CHECKPOINT_PROBES_TOTAL,
  MAX_PROBES_PER_CHECKPOINT,
  MAX_DECISIVE_OBSERVATIONS,
  MAX_VIEWPORTS,
  MAX_MATRIX_EXECUTION_UNITS_PER_PHASE,
  MAX_EVIDENCE_BUNDLE_BYTES,
  MAX_RESULT_BYTES as DOMAIN_MAX_RESULT_BYTES,
  BROWSER_PRESS_KEYS,
} from "../domain/types.js";
import { detectProject } from "./capabilities.js";
import { WebDebugError, errorMessage } from "./errors.js";
import { composeEvidence } from "./evidence.js";
import { boundText, redactText, redactValue, safeUrl } from "./redaction.js";
import { loadAuthStorageState } from "./auth-state.js";
import { observationDigest } from "./aggregation.js";
import { enforceSessionArtifactPolicy } from "./artifact-store.js";

export interface StartSessionInput {
  projectRoot: string;
  url: string;
  targetId?: string;
  browser?: "chromium" | "safari";
  cdpEndpoint?: string;
  webdriverEndpoint?: string;
  executablePath?: string;
  headless?: boolean;
  allowRemote?: boolean;
  viewport?: ViewportSize;
  tls?: "strict" | "allow-insecure-loopback";
  authFixture?: { kind: "playwrightStorageState"; path: string };
}

export interface RecordScenarioInput {
  sessionId: string;
  name: string;
  url: string;
  actions: BrowserAction[];
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

export interface SessionManagerOptions {
  now?: () => number;
  timestamp?: () => string;
  cleanupTimeoutMs?: number;
}

interface Lease {
  controller: AbortController;
  promise: Promise<unknown>;
}

interface ManagedSession {
  descriptor: ProjectDescriptor;
  summary: DebugSessionSummary;
  adapter: BrowserAdapter;
  nextAdapter: NextAdapter | null;
  viteAdapter: ViteAdapter | null;
  replayFrames: ReplayFrame[];
  replayNextIndex: number;
  replayTruncated: boolean;
  scenarios: Map<string, PrivateReproScenario>;
  redactionSecrets: Set<string>;
  startOptions: BrowserStartOptions;
  authFixture: "seeded-disposable" | "none";
  tls: "strict" | "allow-insecure-loopback";
  selectedTargetId: string | null;
  lease: Lease | null;
  closing: boolean;
  unusable: boolean;
  closePromise: Promise<DebugSessionSummary> | null;
}

interface AttemptRun {
  summary: AttemptSummary;
  browser: BrowserSnapshot | null;
  evidence: EvidenceBundle | null;
  match: boolean | undefined;
  passed: boolean | undefined;
}

interface PhaseResult {
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

const MAX_SESSIONS = 8;
const MAX_CLOSED_SESSION_TOMBSTONES = 32;
const MAX_SCENARIOS_PER_SESSION = 10;
const MAX_ATTEMPTS_PER_PHASE = 5;
const MAX_REPLAY_FRAMES = 8;
const MAX_OBSERVED_CHARS = 500;
const MAX_RESULT_BYTES = DOMAIN_MAX_RESULT_BYTES;
const CLEANUP_TIMEOUT_MS = 5_000;
const OPTIONAL_ENRICHMENT_BUDGET_MS = 2_000;
const OPTIONAL_ENRICHMENT_CLEANUP_MS = 250;
const ARTIFACT_DELETE_TIMEOUT_MS = 2_000;

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly closedSessions = new Map<string, DebugSessionSummary>();
  private readonly now: () => number;
  private readonly timestamp: () => string;
  private readonly cleanupTimeoutMs: number;

  constructor(
    private readonly adapterFactory: BrowserAdapterFactory = ({ browser, webdriverEndpoint }) =>
      browser === "safari" ? new SafariAdapter(webdriverEndpoint) : new ChromiumAdapter(),
    options: SessionManagerOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
    this.timestamp = options.timestamp ?? (() => new Date().toISOString());
    this.cleanupTimeoutMs = Math.min(Math.max(options.cleanupTimeoutMs ?? CLEANUP_TIMEOUT_MS, 0), CLEANUP_TIMEOUT_MS);
  }

  detect(projectRoot: string): ProjectDescriptor { return detectProject(projectRoot); }

  async start(input: StartSessionInput, context: OperationContext = {}): Promise<DebugSessionSummary> {
    if (this.activeSessionCount() >= MAX_SESSIONS) throw new WebDebugError("SESSION_LIMIT_REACHED", `At most ${MAX_SESSIONS} sessions may be active.`);
    throwIfCancelled(context);
    assertAllowedTargetUrl(input.url, input.allowRemote ?? false);
    const descriptor = detectProject(input.projectRoot);
    const id = randomUUID();
    const browser = input.browser ?? "chromium";
    if (browser === "chromium" && input.webdriverEndpoint) throw new WebDebugError("WEBDRIVER_BROWSER_MISMATCH", "webdriverEndpoint requires browser=safari.");
    const tls = input.tls ?? "strict";
    let authState: PlaywrightStorageState | undefined;
    let authSecrets: string[] = [];
    if (input.authFixture) {
      if (browser === "safari") throw new WebDebugError("SAFARI_AUTH_UNAVAILABLE", "Safari WebDriver does not support disposable auth-state seeding.");
      if (browser !== "chromium" || input.cdpEndpoint || input.allowRemote || !isLoopback(new URL(input.url).hostname)) {
        throw new WebDebugError("AUTH_FIXTURE_UNAVAILABLE", "Disposable auth seeding requires an isolated Chromium launch at a loopback origin.");
      }
      const loaded = await loadAuthStorageState(input.authFixture.path, descriptor.projectRoot, new URL(input.url).origin);
      authState = loaded.state;
      authSecrets = loaded.secrets;
    }
    if (tls === "allow-insecure-loopback") {
      if (browser === "safari") throw new WebDebugError("SAFARI_TLS_UNAVAILABLE", "Safari WebDriver does not support the guarded loopback TLS bypass.");
      if (browser !== "chromium" || input.cdpEndpoint || input.allowRemote || !isLoopback(new URL(input.url).hostname) || new URL(input.url).protocol !== "https:") {
        throw new WebDebugError("TLS_BYPASS_UNAVAILABLE", "Loopback TLS bypass requires an isolated Chromium launch at an HTTPS loopback origin.");
      }
    }
    const artifactDir = await mkdtemp(join(tmpdir(), "web-debug-mcp-"));
    const adapter = this.adapterFactory({ allowRemote: input.allowRemote, browser, webdriverEndpoint: input.webdriverEndpoint, targetId: input.targetId });
    const summary: DebugSessionSummary = {
      id,
      projectRoot: descriptor.projectRoot,
      url: safeUrl(input.url),
      status: "starting",
      createdAt: this.timestamp(),
      artifactDir,
      target: null,
      capabilities: descriptor.capabilities,
      warnings: [...descriptor.warnings],
      tls,
      authFixture: authState ? "seeded-disposable" : "none",
      artifactState: "retained",
    };
    const managed: ManagedSession = {
      descriptor,
      summary,
      adapter,
      nextAdapter: descriptor.capabilities.next ? new NextAdapter() : null,
      viteAdapter: descriptor.capabilities.vite ? new ViteAdapter() : null,
      replayFrames: [],
      replayNextIndex: 0,
      replayTruncated: false,
      scenarios: new Map(),
      redactionSecrets: new Set(),
      startOptions: {
        url: input.url,
        targetId: input.targetId,
        webdriverEndpoint: input.webdriverEndpoint,
        cdpEndpoint: input.cdpEndpoint,
        executablePath: input.executablePath,
        headless: input.headless,
        allowRemote: input.allowRemote,
        viewport: input.viewport,
        tls,
        approvedOrigin: new URL(input.url).origin,
        ...(authState ? { authState, authFixture: "seeded-disposable" as const } : {}),
      },
      selectedTargetId: null,
      lease: null,
      closing: false,
      unusable: false,
      closePromise: null,
      authFixture: authState ? "seeded-disposable" : "none",
      tls,
    };
    for (const secret of authSecrets) if (secret) managed.redactionSecrets.add(secret);
    if (authState) managed.summary.warnings.push("Disposable auth storage was seeded; screenshot pixels are not claimed redacted.");
    this.sessions.set(id, managed);
    try {
      const target = await this.callAdapter(() => adapter.start(managed.startOptions, context), context);
      managed.summary.status = "ready";
      managed.summary.target = normalizeTarget(target, browser, managed.startOptions);
      managed.summary.url = managed.summary.target.url;
      managed.selectedTargetId = managed.summary.target.targetId ?? adapter.targetIdentity?.() ?? null;
      if (!managed.summary.target.isolated) managed.summary.warnings.push("The session uses an attached or visible browser profile; profile isolation is unavailable.");
      return cloneSummary(managed.summary);
    } catch (error) {
      managed.summary.status = "failed";
      await this.closeAdapterBounded(adapter, this.cleanupTimeoutMs);
      await rm(artifactDir, { recursive: true, force: true }).catch(() => undefined);
      this.sessions.delete(id);
      throw sanitizeError(error);
    }
  }

  list(): DebugSessionSummary[] { return [...this.sessions.values()].map((session) => cloneSummary(session.summary, sessionSecrets(session))); }
  status(sessionId: string): DebugSessionSummary {
    const session = this.sessions.get(sessionId);
    if (session) return cloneSummary(session.summary, sessionSecrets(session));
    const closed = this.closedSessions.get(sessionId);
    if (closed) return cloneSummary(closed);
    throw new WebDebugError("SESSION_NOT_FOUND", `Unknown debug session: ${sessionId}`);
  }

  async act(sessionId: string, action: BrowserAction, context: OperationContext = {}): Promise<ActionResult> {
    const session = this.requireSession(sessionId);
    try {
      return await this.withLease(session, context, (operation) => this.actInternal(session, action, operation, true));
    } catch (error) {
      const secret = actionSecret(action);
      throw sanitizeError(error, secret ? [secret] : sessionSecrets(session));
    }
  }

  async capture(sessionId: string, captureScreenshot = true, context: OperationContext = {}): Promise<EvidenceBundle> {
    const session = this.requireSession(sessionId);
    try {
      return await this.withLease(session, context, (operation) => this.captureInternal(session, captureScreenshot, operation, true));
    } catch (error) {
      throw sanitizeError(error, sessionSecrets(session));
    }
  }

  async inspectNext(sessionId: string, inspection: NextInspection, context: OperationContext = {}): Promise<NextInspectionResult> {
    const session = this.requireSession(sessionId);
    if (session.unusable) throw new WebDebugError("SESSION_UNUSABLE", `Debug session is unusable after an unsettled adapter operation: ${session.summary.id}`);
    if (!session.nextAdapter) throw new WebDebugError("NEXT_UNAVAILABLE", "The selected project does not expose a Next.js runtime adapter.");
    try {
      return await this.withLease(session, context, (operation) => this.callAdapter(
        () => session.nextAdapter!.inspect(session.summary.url, inspection, operation),
        operation,
      ));
    } catch (error) {
      throw sanitizeError(error, sessionSecrets(session));
    }
  }

  async seekReplay(sessionId: string, frameIndex: number, restore = false, context: OperationContext = {}): Promise<ReplaySeekResult> {
    const session = this.requireSession(sessionId);
    if (!Number.isInteger(frameIndex) || frameIndex < 0) throw new WebDebugError("REPLAY_FRAME_INVALID", "Replay frame index must be a non-negative integer.");
    const frame = session.replayFrames.find((candidate) => candidate.index === frameIndex);
    if (!frame) throw new WebDebugError("REPLAY_FRAME_NOT_FOUND", `Replay frame ${frameIndex} is unavailable. Frames ${session.replayFrames[0]?.index ?? 0}-${session.replayFrames.at(-1)?.index ?? -1} are retained.`);
    if (!restore) return replayResult(sessionId, frame, false, session);
    return this.withLease(session, context, async (operation) => {
      await this.restoreReplayFrame(session, frame, operation);
      return replayResult(sessionId, frame, true, session);
    });
  }

  async setBreakpoint(sessionId: string, input: { sourceUrl: string; line: number; column?: number }, context: OperationContext = {}) {
    const session = this.requireSession(sessionId);
    return this.withLease(session, context, (operation) => this.callAdapter(() => session.adapter.setBreakpoint(input, operation), operation));
  }

  async control(sessionId: string, action: "resume" | "stepOver" | "stepInto" | "stepOut", context: OperationContext = {}) {
    const session = this.requireSession(sessionId);
    return this.withLease(session, context, async (operation) => {
      const snapshot = await this.callAdapter(() => session.adapter.control(action, operation), operation);
      session.summary.status = snapshot.paused ? "paused" : "ready";
      return snapshot;
    });
  }

  async evaluate(sessionId: string, expression: string, allowSideEffects: boolean, context: OperationContext = {}) {
    const session = this.requireSession(sessionId);
    return this.withLease(session, context, (operation) => this.callAdapter(() => session.adapter.evaluate(expression, allowSideEffects, operation), operation));
  }

  async recordScenario(input: RecordScenarioInput, context: OperationContext = {}): Promise<PublicReproScenario> {
    if (!input.sessionId) throw new WebDebugError("SESSION_REQUIRED", "sessionId is required to own a recorded scenario.");
    const session = this.requireSession(input.sessionId);
    return this.withLease(session, context, async (operation) => {
      validateScenarioInput(input);
      if (session.scenarios.size >= MAX_SCENARIOS_PER_SESSION) throw new WebDebugError("SCENARIO_LIMIT_REACHED", `At most ${MAX_SCENARIOS_PER_SESSION} scenarios may be recorded per session.`);
      assertScenarioOrigin(session, input.url);
      const actions = input.actions.map((action) => normalizeAction(action));
      const failureSignature = input.failureSignature.map((entry) => normalizeFailureEntry(entry));
      const acceptanceChecks = input.acceptanceChecks.map((check) => normalizeCheck(check));
      const regressionChecks = (input.regressionChecks ?? []).map((check) => normalizeCheck(check));
      const checkpoints = normalizeCheckpoints(input.checkpoints ?? [], actions.length);
      const viewports = normalizeViewports(input.viewports, session.summary.target?.viewport ?? undefined);
      if (input.viewports?.length === 1 && session.summary.target?.viewport
        && (viewports[0]!.width !== session.summary.target.viewport.width || viewports[0]!.height !== session.summary.target.viewport.height)) {
        throw new WebDebugError("SINGLE_VIEWPORT_MISMATCH", "A single explicit viewport must match the live session; use a viewport matrix to run a different size through fresh candidates.");
      }
      if (viewports.length > 1 && session.summary.target?.browser === "safari") throw new WebDebugError("VIEWPORT_MATRIX_UNAVAILABLE", "Safari WebDriver does not support viewport matrices.");
      const risks = mergeRisks(input.risks);
      const requestedLevel = effectiveRequestedLevel(input.requestedLevel, risks);
      const scenario = createPrivateScenario({
        schemaVersion: 4,
        id: randomUUID(),
        sessionId: input.sessionId,
        name: input.name.trim(),
        url: input.url,
        privateActions: cloneActions(actions),
        failureSignature: cloneSignature(failureSignature),
        acceptanceChecks: cloneChecks(acceptanceChecks),
        regressionChecks: cloneChecks(regressionChecks),
        checkpoints,
        viewports,
        ...(input.failureViewports ? { failureViewports: [...input.failureViewports] } : {}),
        authFixture: session.authFixture,
        tls: session.tls,
        risks,
        serverStateReset: input.serverStateReset,
        requestedLevel,
        buildReference: normalizeBuildReference(input.buildReference),
        environmentFingerprint: this.environmentFingerprint(session, input.url),
        contractHash: scenarioContractHash({ ...input, actions, failureSignature, acceptanceChecks, regressionChecks, checkpoints, viewports, failureViewports: input.failureViewports, tls: session.tls, authFixture: session.authFixture }),
        createdAt: this.timestamp(),
      });
      const baseline = await this.runBaselinePhase(session, scenario, operation);
      scenario.baseline = {
        status: baseline.status ?? "inconclusive",
        level: baseline.level,
        flaky: baseline.flaky,
        budget: { level: baseline.level, ...profileFor(baseline.level) },
        attempts: baseline.attempts,
        observedRate: baseline.observedRate,
        evidence: baseline.evidence,
        warnings: baseline.warnings,
        ...(baseline.viewportConsensus ? { viewportConsensus: baseline.viewportConsensus } : {}),
        termination: baseline.termination,
      };
      if (operation.signal?.aborted || session.closing) return publicScenario(scenario);
      session.scenarios.set(scenario.id, scenario);
      return publicScenario(scenario);
    });
  }

  listScenarios(sessionId: string): PublicReproScenario[] { return [...this.requireSession(sessionId).scenarios.values()].map(publicScenario); }

  async verifyScenario(input: VerifyScenarioInput, context: OperationContext = {}): Promise<VerificationResult> {
    const operationContext = context;
    const session = this.requireSession(input.sessionId);
    const scenario = session.scenarios.get(input.scenarioId);
    if (!scenario) throw new WebDebugError("SCENARIO_NOT_FOUND", `Unknown scenario: ${input.scenarioId}`);
    return this.withLease(session, operationContext, async (operation) => {
      const currentFingerprint = this.environmentFingerprint(session, scenario.url);
      const provenanceMismatch = compareProvenance(scenario, currentFingerprint, session);
      const postBuildReference = normalizeBuildReference(input.buildReference);
      if (provenanceMismatch) return this.inconclusiveResult(scenario, currentFingerprint, postBuildReference, "PROVENANCE_MISMATCH", provenanceMismatch);
      if (scenario.baseline.status !== "reproduced") {
        const baselineTermination = scenario.baseline.termination === "SERVER_STATE_RESET_REQUIRED" || scenario.baseline.termination === "BROWSER_STATE_ISOLATION_UNAVAILABLE"
          ? scenario.baseline.termination
          : "BASELINE_NOT_REPRODUCED";
        return this.inconclusiveResult(scenario, currentFingerprint, postBuildReference, baselineTermination, `Stored baseline status is ${scenario.baseline.status}; post-fix actions were not run.`);
      }
      if (!scenario.baseline.evidence && scenario.viewports.length <= 1) return this.inconclusiveResult(scenario, currentFingerprint, postBuildReference, "BASELINE_EVIDENCE_UNAVAILABLE", "The reproduced baseline has no intact representative evidence.");
      if (scenario.risks.serverStateLeakage && !scenario.serverStateReset?.action && !scenario.serverStateReset?.readyCheck) return this.inconclusiveResult(scenario, currentFingerprint, postBuildReference, "SERVER_STATE_RESET_REQUIRED", "Server-state leakage requires an explicit observable reset action or condition.");
      if (scenario.risks.browserStateLeakage && !session.summary.target?.isolated) return this.inconclusiveResult(scenario, currentFingerprint, postBuildReference, "BROWSER_STATE_ISOLATION_UNAVAILABLE", "Browser-state leakage cannot be verified on an attached or visible non-isolated profile.");
      const level = maxLevel(scenario.baseline.level, input.requestedLevel ?? scenario.requestedLevel);
      const postFix = await this.runPostFixPhase(session, scenario, level, operation);
      let outcome: VerificationOutcome = postFix.termination === "all-required-passes" ? "verified" : postFix.termination === "failure-quorum" ? "failed" : "inconclusive";
      const flaky = scenario.baseline.flaky || scenario.baseline.attempts.some((attempt) => attempt.conflict) || postFix.flaky;
      if (flaky && outcome === "verified") outcome = "inconclusive";
      return boundVerificationResult(scrubVerificationResult(this.createVerificationResult(scenario, currentFingerprint, postBuildReference, postFix, outcome, flaky, postFix.level), scenario.privateActions));
    });
  }

  async close(sessionId: string, artifactPolicy: "retain" | "delete" = "retain"): Promise<DebugSessionSummary> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const closed = this.closedSessions.get(sessionId);
      if (!closed) throw new WebDebugError("SESSION_NOT_FOUND", `Unknown debug session: ${sessionId}`);
      if (artifactPolicy === "delete" && closed.artifactState !== "deleted") {
        const updated = cloneSummary(closed);
        await this.deleteSessionArtifacts(updated);
        this.closedSessions.set(sessionId, updated);
        return cloneSummary(updated);
      }
      return cloneSummary(closed);
    }
    if (session.closePromise) return session.closePromise;
    session.closePromise = this.closeInternal(session, artifactPolicy);
    return session.closePromise;
  }

  private async closeInternal(session: ManagedSession, artifactPolicy: "retain" | "delete"): Promise<DebugSessionSummary> {
    if (session.closing) return cloneSummary(session.summary);
    session.closing = true;
    const cleanupStarted = Date.now();
    const lease = session.lease;
    if (lease) {
      lease.controller.abort();
      const cleaned = await waitForCleanup(lease.promise, this.cleanupTimeoutMs);
      if (!cleaned) {
        session.unusable = true;
        session.summary.status = "failed";
        session.summary.warnings = mergeWarnings(session.summary.warnings, ["Active operation cleanup exceeded the five-second bound; the owned adapter was abandoned."]);
      }
    }
    const remainingCleanupMs = Math.max(0, this.cleanupTimeoutMs - (Date.now() - cleanupStarted));
    const closed = await this.closeAdapterBounded(session.adapter, remainingCleanupMs);
    if (!closed) session.summary.warnings = mergeWarnings(session.summary.warnings, ["Browser adapter close exceeded the cleanup bound; the adapter was abandoned."]);
    const secrets = sessionSecrets(session);
    session.scenarios.clear();
    session.replayFrames.length = 0;
    session.summary.status = "closed";
    session.summary.warnings = mergeWarnings(session.summary.warnings, ["Private scenarios and evidence were purged when the session closed."]);
    const safeSummary = cloneSummary(session.summary, secrets);
    session.summary.url = safeSummary.url;
    session.summary.warnings = safeSummary.warnings;
    session.summary.target = safeSummary.target;
    session.startOptions.authState = undefined;
    session.startOptions.url = "";
    session.startOptions.cdpEndpoint = undefined;
    session.startOptions.webdriverEndpoint = undefined;
    session.startOptions.executablePath = undefined;
    session.startOptions.targetId = undefined;
    session.selectedTargetId = null;
    session.redactionSecrets.clear();
    const tombstone = closedSessionSummary(safeSummary);
    if (artifactPolicy === "delete") await this.deleteSessionArtifacts(tombstone);
    else await this.deleteEmptySessionArtifacts(tombstone);
    this.sessions.delete(session.summary.id);
    this.rememberClosed(tombstone);
    return cloneSummary(tombstone);
  }

  async closeAll(artifactPolicy: "retain" | "delete" = "retain"): Promise<void> { await Promise.all([...this.sessions.values()].map((session) => this.close(session.summary.id, artifactPolicy).catch(() => undefined))); }

  private async runBaselinePhase(session: ManagedSession, scenario: PrivateReproScenario, context: OperationContext): Promise<PhaseResult> {
    const level = scenario.requestedLevel;
    const warnings: string[] = initialRiskWarnings(scenario.risks, scenario.requestedLevel);
    if (scenario.risks.serverStateLeakage && !scenario.serverStateReset?.action && !scenario.serverStateReset?.readyCheck) return emptyPhase(level, "SERVER_STATE_RESET_REQUIRED", "Server-state leakage requires an explicit observable reset action or condition.");
    if (scenario.risks.browserStateLeakage && !session.summary.target?.isolated) return emptyPhase(level, "BROWSER_STATE_ISOLATION_UNAVAILABLE", "Browser-state leakage requires fresh browser isolation; the selected target is non-isolated.");
    const phaseStart = this.now();
    const phaseContext = boundedContext(context, phaseStart + profileFor(level).budgetMs);
    const attempts: AttemptSummary[] = [];
    let evidence: EvidenceBundle | null = null;
    let effectiveLevel = level;
    let flaky = false;
    let matchCount = 0;
    let decisiveCount = 0;
    let termination = remaining(phaseContext) <= 0 ? "budget-exhausted" : "attempt-ceiling";
    while (attempts.length < MAX_ATTEMPTS_PER_PHASE) {
      const profile = profileFor(effectiveLevel);
      if (attempts.length >= profile.maxAttempts || remaining(phaseContext) <= 0) { termination = remaining(phaseContext) <= 0 ? "budget-exhausted" : "attempt-ceiling"; break; }
      const ordinal = attempts.length + 1;
      await reportScenarioProgress(phaseContext, { phase: "baseline", event: "attempt-start", level: effectiveLevel, ordinal });
      const attempt = await this.runAttempt(session, scenario, "baseline", ordinal, phaseContext);
      attempts.push(attempt.summary);
      await reportScenarioProgress(phaseContext, { phase: "baseline", event: "attempt-end", level: effectiveLevel, ordinal, termination: attempt.summary.termination });
      if (attempt.evidence && (!evidence || attempt.match === true)) evidence = attempt.evidence;
      if (attempt.match !== undefined) { decisiveCount += 1; if (attempt.match) matchCount += 1; }
      if (attempt.match === true && !evidence && scenario.viewports.length === 1) {
        evidence = await this.captureRepresentative(session, scenario, attempt, phaseContext);
        if (attempt.summary.conflict) {
          matchCount = Math.max(0, matchCount - 1);
          decisiveCount = Math.max(0, decisiveCount - 1);
          attempt.match = undefined;
          delete attempt.summary.match;
          flaky = true;
          warnings.push("Authoritative baseline capture drifted from the checks-only observation.");
          if (effectiveLevel === "quick") {
            effectiveLevel = "standard";
            phaseContext.deadline = Math.min(context.deadline ?? Number.POSITIVE_INFINITY, phaseStart + profileFor("standard").budgetMs);
          }
          continue;
        }
      }
      if (attempt.summary.conflict) flaky = true;
      if (effectiveLevel === "quick") {
        if (attempt.match === true) return phaseResult(effectiveLevel, "reproduced", attempts, evidence, baselineRate(attempts), warnings, "baseline-match", flaky);
        if (attempt.match === false) {
          if (!evidence && scenario.viewports.length === 1) evidence = await this.captureRepresentative(session, scenario, attempt, phaseContext);
          if (attempt.summary.conflict || !evidence) {
            flaky = true;
            warnings.push("Authoritative baseline capture was unavailable or drifted from the checks-only observation.");
            return phaseResult(effectiveLevel, undefined, attempts, null, baselineRate(attempts), warnings, "baseline-inconclusive", flaky);
          }
          return phaseResult(effectiveLevel, "not_reproduced", attempts, evidence, baselineRate(attempts), warnings, "baseline-not-matched", flaky);
        }
        if (attempt.summary.retryable) { effectiveLevel = "standard"; warnings.push("Quick baseline retryable termination promoted verification to standard."); phaseContext.deadline = Math.min(context.deadline ?? Number.POSITIVE_INFINITY, phaseStart + profileFor("standard").budgetMs); continue; }
        if (attempt.summary.error === "request cancelled") warnings.push("Request cancellation stopped baseline verification.");
        return phaseResult(effectiveLevel, undefined, attempts, evidence, baselineRate(attempts), warnings, attempt.summary.error === "request cancelled" ? "cancelled" : attempt.summary.termination === "budget-exhausted" ? "budget-exhausted" : "baseline-inconclusive", flaky);
      }
      if (attempt.match === true && matchCount >= 2) return phaseResult(effectiveLevel, "reproduced", attempts, evidence, baselineRate(attempts), warnings, "baseline-match-quorum", flaky);
      if (attempt.match !== undefined && attempts.some((item) => item.match === true) && attempts.some((item) => item.match === false)) {
        flaky = true;
        if (effectiveLevel === "standard") { effectiveLevel = "strict"; warnings.push("Conflicting baseline observations promoted verification to strict."); phaseContext.deadline = Math.min(context.deadline ?? Number.POSITIVE_INFINITY, phaseStart + profileFor("strict").budgetMs); continue; }
      }
      if (attempt.summary.retryable && effectiveLevel === "standard") { effectiveLevel = "strict"; warnings.push("Standard baseline retryable instability promoted verification to strict."); phaseContext.deadline = Math.min(context.deadline ?? Number.POSITIVE_INFINITY, phaseStart + profileFor("strict").budgetMs); continue; }
      if (attempt.summary.termination === "permanent" || attempt.summary.termination === "budget-exhausted") { if (attempt.summary.error === "request cancelled") warnings.push("Request cancellation stopped baseline verification."); termination = attempt.summary.error === "request cancelled" ? "cancelled" : attempt.summary.termination; break; }
      if (attempts.length >= profileFor(effectiveLevel).maxAttempts) { termination = "baseline-match-quorum-unmet"; break; }
    }
    if (!evidence && scenario.viewports.length === 1 && attempts.length > 0 && !attempts.at(-1)?.conflict) {
      const last = attempts.at(-1);
      if (last) evidence = await this.captureRepresentative(session, scenario, { summary: last, browser: null, evidence: null, match: last.match, passed: undefined }, phaseContext);
    }
    const status: BaselineStatus | undefined = evidence && decisiveCount > 0 && !attempts.some((attempt) => attempt.conflict || attempt.termination === "retryable" || attempt.termination === "permanent" || attempt.termination === "budget-exhausted") ? "not_reproduced" : undefined;
    return phaseResult(effectiveLevel, status, attempts, evidence, baselineRate(attempts), warnings, termination, flaky);
  }

  private async runPostFixPhase(session: ManagedSession, scenario: PrivateReproScenario, level: VerificationLevel, context: OperationContext): Promise<PhaseResult> {
    const phaseStart = this.now();
    const phaseContext = boundedContext(context, phaseStart + profileFor(level).budgetMs);
    const attempts: AttemptSummary[] = [];
    const warnings: string[] = [];
    let evidence: EvidenceBundle | null = null;
    let effectiveLevel = level;
    let passCount = 0;
    let failureCount = 0;
    let flaky = false;
    let termination = remaining(phaseContext) <= 0 ? "budget-exhausted" : "attempt-ceiling";
    while (attempts.length < profileFor(effectiveLevel).maxAttempts && remaining(phaseContext) > 0) {
      const ordinal = attempts.length + 1;
      await reportScenarioProgress(phaseContext, { phase: "post-fix", event: "attempt-start", level: effectiveLevel, ordinal });
      const attempt = await this.runAttempt(session, scenario, "post-fix", ordinal, phaseContext);
      attempts.push(attempt.summary);
      await reportScenarioProgress(phaseContext, { phase: "post-fix", event: "attempt-end", level: effectiveLevel, ordinal, termination: attempt.summary.termination });
      if (attempt.evidence && (!evidence || attempt.passed === false)) evidence = attempt.evidence;
      if (attempt.summary.conflict) flaky = true;
      if (attempt.passed === true) {
        passCount += 1;
        const needsAuthoritativeCapture = !evidence || effectiveLevel === "quick" || passCount >= profileFor(effectiveLevel).maxAttempts || failureCount > 0;
        if (needsAuthoritativeCapture && scenario.viewports.length === 1) {
          const authoritative = await this.captureRepresentative(session, scenario, attempt, phaseContext);
          if (authoritative) {
            const finalPass = effectiveLevel === "quick" || passCount >= profileFor(effectiveLevel).maxAttempts;
            if (!evidence || finalPass || failureCount > 0) evidence = authoritative;
          }
          if (attempt.summary.conflict || !authoritative) {
            attempt.passed = undefined;
            delete attempt.summary.passed;
            flaky = true;
            warnings.push("Authoritative post-fix capture was unavailable or drifted from the checks-only observation.");
            termination = "post-fix-conflict";
            break;
          }
        }
        if (failureCount > 0) { flaky = true; termination = "post-fix-conflict"; break; }
        if (effectiveLevel === "quick") {
          termination = "all-required-passes";
          break;
        }
        if (passCount >= profileFor(effectiveLevel).maxAttempts) {
          termination = "all-required-passes";
          break;
        }
      } else if (attempt.passed === false) {
        failureCount += 1;
        const needsAuthoritativeCapture = !evidence || failureCount >= 2 || passCount > 0;
        if (needsAuthoritativeCapture && scenario.viewports.length === 1) {
          const authoritative = await this.captureRepresentative(session, scenario, attempt, phaseContext);
          if (authoritative) evidence = authoritative;
          if (attempt.summary.conflict || !authoritative) {
            attempt.passed = undefined;
            delete attempt.summary.passed;
            flaky = true;
            warnings.push("Authoritative post-fix capture was unavailable or drifted from the checks-only observation.");
            termination = "post-fix-conflict";
            break;
          }
        }
        if (effectiveLevel === "quick" || failureCount >= 2) { termination = "failure-quorum"; break; }
        if (passCount > 0) { flaky = true; termination = "post-fix-conflict"; break; }
      } else {
        if (attempt.summary.retryable && effectiveLevel === "quick") {
          effectiveLevel = "standard";
          warnings.push("Quick post-fix retryable termination promoted verification to standard.");
          phaseContext.deadline = Math.min(context.deadline ?? Number.POSITIVE_INFINITY, phaseStart + profileFor("standard").budgetMs);
          continue;
        }
        if (attempt.summary.retryable && effectiveLevel === "standard") {
          effectiveLevel = "strict";
          warnings.push("Standard post-fix retryable instability promoted verification to strict.");
          phaseContext.deadline = Math.min(context.deadline ?? Number.POSITIVE_INFINITY, phaseStart + profileFor("strict").budgetMs);
          continue;
        }
        if (attempt.summary.retryable && effectiveLevel === "strict") {
          continue;
        }
        if (attempt.summary.error === "request cancelled") warnings.push("Request cancellation stopped post-fix verification.");
        termination = attempt.summary.error === "request cancelled" ? "cancelled" : attempt.summary.termination === "budget-exhausted" ? "budget-exhausted" : attempt.summary.retryable ? "retryable" : "unavailable";
        break;
      }
    }
    if (!evidence && scenario.viewports.length === 1 && attempts.length > 0 && !attempts.at(-1)?.conflict) {
      const last = attempts.at(-1);
      if (last) evidence = await this.captureRepresentative(session, scenario, { summary: last, browser: null, evidence: null, match: undefined, passed: last.passed }, phaseContext);
    }
    if (attempts.at(-1)?.conflict) { flaky = true; if (termination === "all-required-passes" || termination === "failure-quorum") termination = "post-fix-conflict"; }
    if (termination === "attempt-ceiling" && attempts.at(-1)?.retryable) termination = "retryable";
    return phaseResult(effectiveLevel, undefined, attempts, evidence, postFixRate(attempts), warnings, termination, flaky);
  }

  private async runAttempt(session: ManagedSession, scenario: PrivateReproScenario, phase: "baseline" | "post-fix", ordinal: number, context: OperationContext): Promise<AttemptRun> {
    if (scenario.viewports.length > 1) return this.runMatrixAttempt(session, scenario, phase, ordinal, context);
    const started = this.now();
    const attemptId = randomUUID();
    const attemptContext = { ...context, attemptId };
    let reset = resetFacts(session.summary.target, ordinal === 1);
    let browser: BrowserSnapshot | null = null;
    let evidence: EvidenceBundle | null = null;
    let match: boolean | undefined;
    let passed: boolean | undefined;
    let checks: CheckObservation[] = [];
    const checkpointResults: NonNullable<AttemptSummary["checkpoints"]> = [];
    let termination: AttemptTermination = "permanent";
    let error: string | undefined;
    let conflict = false;
    try {
      throwIfCancelled(context);
      resetReplayForAttempt(session);
      reset = await this.prepareAttempt(session, scenario, phase, ordinal, attemptId, attemptContext);
      if (scenario.risks.serverStateLeakage && scenario.serverStateReset?.action) { await this.actInternal(session, scenario.serverStateReset.action, attemptContext, false); reset = { ...reset, serverState: "reset-by-scenario" }; }
      // The executable replay uses the private raw URL. `scenario.url` is the
      // public, query-sanitized representation and must never be used as an
      // input to the browser.
      await this.actInternal(session, { kind: "navigate", url: scenario.privateUrl }, attemptContext, false);
      await this.captureCheckpointBoundary(session.adapter, scenario, 0, attemptContext, checkpointResults);
      for (let actionIndex = 0; actionIndex < scenario.privateActions.length; actionIndex += 1) {
        await this.actInternal(session, scenario.privateActions[actionIndex]!, attemptContext, false);
        await this.captureCheckpointBoundary(session.adapter, scenario, actionIndex + 1, attemptContext, checkpointResults);
      }
      if (scenario.risks.serverStateLeakage && scenario.serverStateReset?.readyCheck) {
        const resetBrowser = await this.callAdapter(() => session.adapter.snapshot({ artifactDir: session.summary.artifactDir, captureScreenshot: false, checksOnly: true, retainNetwork: true }, attemptContext), attemptContext);
        const resetObservation = await evaluateCheckLive(session.adapter, scenario.serverStateReset.readyCheck, resetBrowser, attemptContext);
        if (resetObservation.state !== "pass") throw new WebDebugError("SERVER_STATE_RESET_UNAVAILABLE", "The explicit server-state reset condition was not observed.");
        reset = { ...reset, serverState: "reset-by-scenario" };
      }
      browser = await this.callAdapter(() => session.adapter.snapshot({ artifactDir: session.summary.artifactDir, captureScreenshot: false, checksOnly: true, retainNetwork: true }, attemptContext), attemptContext);
      const acceptanceChecks = await Promise.all([...scenario.acceptanceChecks, ...scenario.regressionChecks].map((check) => evaluateCheckLive(session.adapter, check, browser!, attemptContext)));
      const failureChecks = await Promise.all(scenario.failureSignature.map((entry) => evaluateCheckLive(session.adapter, entry, browser!, attemptContext, entry.expected)));
      checks = phase === "baseline" ? failureChecks : [...acceptanceChecks, ...failureChecks];
      checks = scrubChecks(checks, scenario.privateActions);
      if (checks.length + checkpointResults.reduce((total, checkpoint) => total + checkpoint.observations.length, 0) > MAX_DECISIVE_OBSERVATIONS) throw new WebDebugError("DECISIVE_OBSERVATION_LIMIT", `The scenario exceeded the ${MAX_DECISIVE_OBSERVATIONS}-observation contract.`);
      if (!checks.every((check) => check.state !== "unavailable" && check.freshness === "fresh")) throw new WebDebugError("REQUIRED_OBSERVATION_UNAVAILABLE", "A required check source was unavailable or stale.");
      if (phase === "baseline") { match = checks.every((check) => check.expected === check.state); termination = match ? "decisive-match" : "decisive-non-match"; }
      else {
        // The complete failure signature is the original bug condition. Its
        // expectations are polarity-aware: a signature can intentionally
        // contain both positive and negative observations, and the bug is
        // still present only when every entry matches its original state.
        const failureStillPresent = failureChecks.length > 0 && failureChecks.every((check) => check.expected === check.state);
        passed = acceptanceChecks.every((check) => check.state === "pass") && !failureStillPresent;
        termination = passed ? "decisive-match" : "decisive-non-match";
      }
    } catch (rawError) {
      const classified = classifyAttemptError(rawError, attemptContext);
      termination = classified.termination;
      error = classified.message;
      if (classified.unavailable && checks.length === 0) checks = phase === "baseline" ? scenario.failureSignature.map((entry) => unavailableCheck(entry, classified.message, entry.expected)) : [...scenario.acceptanceChecks, ...scenario.regressionChecks, ...scenario.failureSignature.map((entry) => ({ ...entry }))].map((check) => unavailableCheck(check, classified.message, "expected" in check ? check.expected as CheckExpectation : undefined));
      if (classified.cancelled) checks = checks.map((check) => ({ ...check, state: "unavailable", freshness: "unknown", warning: "request cancelled" }));
    }
    const summary: AttemptSummary = {
      phase,
      attemptId,
      ordinal,
      startedAt: this.timestamp(),
      elapsedMs: Math.max(0, Math.round(this.now() - started)),
      termination,
      ...(match === undefined ? {} : { match }),
      ...(passed === undefined ? {} : { passed }),
      checks,
      availableChecks: checks.filter((check) => check.state !== "unavailable").length,
      decisiveChecks: checks.filter((check) => check.state !== "unavailable" && check.freshness === "fresh").length,
      retryable: termination === "retryable",
      conflict,
      reset,
      ...(checkpointResults.length ? { checkpoints: checkpointResults } : {}),
      ...(error ? { error: boundText(error, MAX_OBSERVED_CHARS) } : {}),
    };
    if (browser) {
      await this.recordReplayFrame(session, "capture", null, browser, attemptContext, scenario.privateActions);
    }
    return { summary, browser, evidence, match, passed };
  }

  private async captureCheckpointBoundary(adapter: BrowserAdapter, scenario: PrivateReproScenario, offset: number, context: OperationContext, output: NonNullable<AttemptSummary["checkpoints"]>): Promise<void> {
    for (const checkpoint of scenario.checkpoints.filter((candidate) => candidate.offset === offset)) {
      const observations: CheckObservation[] = [];
      if (checkpoint.route) {
        try {
          const browser = await adapter.snapshot({ artifactDir: "", captureScreenshot: false, checksOnly: true }, context);
          let path = browser.url;
          try { path = new URL(browser.url).pathname; } catch { /* retain bounded URL */ }
          observations.push({ kind: "route", path: checkpoint.route, state: path === checkpoint.route ? "pass" : "fail", freshness: "fresh", provenance: "browser", observed: boundText(path, MAX_OBSERVED_CHARS) });
        } catch (error) {
          observations.push(unavailableCheck({ kind: "route", path: checkpoint.route }, errorMessage(error)));
        }
      }
      for (const probe of checkpoint.probes) {
        try {
          if (typeof adapter.probe !== "function") throw new WebDebugError("LOCATOR_STRATEGY_UNAVAILABLE", "The selected adapter does not expose live locator probes.");
          const result = await adapter.probe(probe.locator, [probe.property], context);
          const actual = result[probe.property];
          const passed = probe.property === "text" && typeof actual === "string" && typeof probe.expected === "string"
            ? (probe.match === "exact" ? actual === probe.expected : actual.includes(probe.expected))
            : actual === probe.expected;
          observations.push({ kind: probe.property === "text" ? "locatorText" : probe.property === "count" ? "locatorCount" : probe.property === "visible" ? "locatorVisible" : probe.property === "enabled" ? "locatorEnabled" : "locatorChecked", locator: probe.locator, ...(probe.property === "text" ? { text: String(probe.expected), match: probe.match ?? "contains" } : probe.property === "count" ? { count: Number(probe.expected) } : probe.property === "visible" ? { visible: Boolean(probe.expected) } : probe.property === "enabled" ? { enabled: Boolean(probe.expected) } : { checked: Boolean(probe.expected) }), state: passed ? "pass" : "fail", freshness: "fresh", provenance: result.provenance, observed: boundText(String(actual ?? ""), MAX_OBSERVED_CHARS) } as CheckObservation);
        } catch (error) {
          observations.push(unavailableCheck({ kind: "locatorText", locator: probe.locator, text: String(probe.expected), match: probe.match ?? "contains" }, errorMessage(error)));
        }
      }
      output.push({ name: checkpoint.name, offset: checkpoint.offset, observations, state: observations.length > 0 && observations.every((observation) => observation.state === "pass") ? "pass" : observations.some((observation) => observation.state === "unavailable") ? "unavailable" : "fail" });
    }
  }

  /** Run one attempt across fresh sequential candidates. Candidates stay out
   * of the managed-session map and therefore cannot replace the canonical
   * adapter, target metadata, observer buffers, or replay timeline. */
  private async runMatrixAttempt(session: ManagedSession, scenario: PrivateReproScenario, phase: "baseline" | "post-fix", ordinal: number, context: OperationContext): Promise<AttemptRun> {
    const started = this.now();
    const attemptId = randomUUID();
    const viewports = scenario.viewports.slice(0, Math.min(MAX_VIEWPORTS, MAX_MATRIX_EXECUTION_UNITS_PER_PHASE));
    const viewportResults: Array<{
      viewport: ViewportContract;
      observation: CheckObservation[];
      match: boolean | undefined;
      passed: boolean | undefined;
      checkpoints: NonNullable<AttemptSummary["checkpoints"]>;
      verdict: "pass" | "fail" | "unavailable" | "inconclusive";
      warning?: string;
    }> = [];
    let representativeEvidence: EvidenceBundle | null = null;
    let representativeViewportName: string | null = null;
    let representativeChecks: CheckObservation[] = [];
    let match: boolean | undefined;
    let passed: boolean | undefined;
    for (const viewport of viewports) {
      if (remaining(context) <= 0) break;
      const candidate = this.adapterFactory({ allowRemote: session.startOptions.allowRemote, browser: session.summary.target?.browser ?? "chromium", webdriverEndpoint: session.startOptions.webdriverEndpoint });
      let checks: CheckObservation[] = [];
      let match: boolean | undefined;
      let passed: boolean | undefined;
      const candidateCheckpoints: NonNullable<AttemptSummary["checkpoints"]> = [];
      let verdict: "pass" | "fail" | "unavailable" | "inconclusive" = "inconclusive";
      let warning: string | undefined;
      try {
        const target = await this.callAdapter(() => candidate.start({ ...session.startOptions, viewport: { width: viewport.width, height: viewport.height } }, { ...context, attemptId }), context);
        if (target.browser === "safari") throw new WebDebugError("VIEWPORT_MATRIX_UNAVAILABLE", "Safari WebDriver does not support viewport matrices.");
        await this.callAdapter(() => candidate.act({ kind: "navigate", url: scenario.privateUrl }, { ...context, attemptId }), context);
        await this.captureCheckpointBoundary(candidate, scenario, 0, { ...context, attemptId }, candidateCheckpoints);
        for (let actionIndex = 0; actionIndex < scenario.privateActions.length; actionIndex += 1) {
          await this.callAdapter(() => candidate.act(scenario.privateActions[actionIndex]!, { ...context, attemptId }), context);
          await this.captureCheckpointBoundary(candidate, scenario, actionIndex + 1, { ...context, attemptId }, candidateCheckpoints);
        }
        const browser = await this.callAdapter(() => candidate.snapshot({ artifactDir: session.summary.artifactDir, captureScreenshot: false, checksOnly: true, retainNetwork: true }, { ...context, attemptId }), context);
        const acceptance = await Promise.all([...scenario.acceptanceChecks, ...scenario.regressionChecks].map((check) => evaluateCheckLive(candidate, check, browser, { ...context, attemptId })));
        const failures = await Promise.all(scenario.failureSignature.map((entry) => evaluateCheckLive(candidate, entry, browser, { ...context, attemptId }, entry.expected)));
        checks = phase === "baseline" ? failures : [...acceptance, ...failures];
        const decisive = checks.every((check) => check.state !== "unavailable" && check.freshness === "fresh");
        if (!decisive) {
          verdict = "unavailable";
        } else if (phase === "baseline") {
          match = failures.every((check) => check.expected === check.state);
          verdict = match ? "pass" : "fail";
        } else {
          const failurePresent = failures.length > 0 && failures.every((check) => check.expected === check.state);
          passed = acceptance.every((check) => check.state === "pass") && !failurePresent;
          verdict = passed ? "pass" : "fail";
        }
        const preferredViewport = phase === "baseline" ? scenario.failureViewports?.[0] ?? viewports[0]?.name : viewports[0]?.name;
        const shouldCaptureRepresentative = decisive && (representativeEvidence === null || viewport.name === preferredViewport && representativeViewportName !== preferredViewport);
        if (shouldCaptureRepresentative) {
          const suppressInputScreenshot = actionSecrets(scenario.privateActions).length > 0;
          const fullBrowser = await this.callAdapter(() => candidate.snapshot({
            artifactDir: session.summary.artifactDir,
            captureScreenshot: session.authFixture !== "seeded-disposable" && !suppressInputScreenshot,
            checksOnly: false,
            accessibility: true,
            suppressScreenshot: session.authFixture === "seeded-disposable" || suppressInputScreenshot,
          }, { ...context, attemptId }), context);
          await this.applySessionArtifactPolicy(session, fullBrowser, session.authFixture === "seeded-disposable" || suppressInputScreenshot);
          if (suppressInputScreenshot && session.authFixture !== "seeded-disposable") fullBrowser.warnings.push("Screenshot suppressed because the scenario contains private fill/select input values; pixels are not claimed redacted.");
          const authoritative = phase === "baseline"
            ? await Promise.all(scenario.failureSignature.map((entry) => evaluateCheckLive(candidate, entry, fullBrowser, { ...context, attemptId }, entry.expected)))
            : await Promise.all([...scenario.acceptanceChecks, ...scenario.regressionChecks, ...scenario.failureSignature.map((entry) => ({ ...entry }))].map((check) => evaluateCheckLive(candidate, check, fullBrowser, { ...context, attemptId }, "expected" in check ? check.expected as CheckExpectation : undefined)));
          if (authoritative.length !== checks.length || authoritative.some((check, index) => check.state !== checks[index]?.state || check.freshness !== checks[index]?.freshness || check.expected !== checks[index]?.expected)) {
            verdict = "inconclusive";
            match = undefined;
            passed = undefined;
            warning = "Authoritative matrix capture drifted from the checks-only observation.";
          } else {
            const evidenceSession = cloneSummary(session.summary, sessionSecrets(session));
            evidenceSession.url = safeUrl(fullBrowser.url);
            if (evidenceSession.target) evidenceSession.target = { ...evidenceSession.target, url: safeUrl(fullBrowser.url), title: fullBrowser.title, viewport: fullBrowser.viewport };
            representativeEvidence = boundEvidence(scrubEvidence(composeEvidence(
              session.descriptor,
              evidenceSession,
              { ...fullBrowser, next: null, vite: null },
              { enabled: true, maxFrames: MAX_REPLAY_FRAMES, truncated: false, frames: [] },
            ), sessionActions(session)));
            representativeEvidence.phase = phase;
            representativeEvidence.attemptId = attemptId;
            representativeViewportName = viewport.name;
          }
        }
        if (representativeChecks.length === 0 || (verdict !== "pass" && representativeChecks.length > 0)) representativeChecks = checks;
      } catch (error) {
        const classified = classifyAttemptError(error, context);
        warning = classified.message;
        verdict = classified.unavailable || classified.termination === "retryable" ? "unavailable" : "inconclusive";
        checks = phase === "baseline" ? scenario.failureSignature.map((entry) => unavailableCheck(entry, classified.message, entry.expected)) : [...scenario.acceptanceChecks, ...scenario.regressionChecks, ...scenario.failureSignature.map((entry) => ({ ...entry }))].map((check) => unavailableCheck(check, classified.message, "expected" in check ? check.expected as CheckExpectation : undefined));
      } finally {
        await this.closeAdapterBounded(candidate, Math.min(this.cleanupTimeoutMs, 5_000));
      }
      viewportResults.push({ viewport, observation: checks, match, passed, checkpoints: candidateCheckpoints, verdict, ...(warning ? { warning } : {}) });
    }
    const expectedFailureViewports = scenario.failureViewports;
    const byViewport = new Map(viewportResults.map((item) => [item.viewport.name, item]));
    if (phase === "post-fix" && scenario.baseline.viewportConsensus) {
      for (const item of viewportResults) {
        const checkpointDigest = item.checkpoints.length ? observationDigest(item.checkpoints.flatMap((checkpoint) => checkpoint.observations).map((observation, index) => ({ key: `${index}:${observation.kind}`, state: observation.state, freshness: observation.freshness, provenance: observation.provenance, observed: observation.observed }))) : undefined;
        const expectedDigest = scenario.baseline.viewportConsensus[item.viewport.name];
        if (expectedDigest !== undefined && checkpointDigest !== expectedDigest) {
          item.verdict = "inconclusive";
          item.warning = "Checkpoint observations differed from the decisive baseline consensus for this viewport.";
          item.passed = undefined;
        }
      }
    }
    const complete = viewportResults.length === viewports.length && viewportResults.every((item) => item.observation.every((check) => check.state !== "unavailable" && check.freshness === "fresh") && item.checkpoints.every((checkpoint) => checkpoint.state !== "unavailable"));
    const checkpointsPass = viewportResults.every((item) => item.checkpoints.every((checkpoint) => checkpoint.state === "pass"));
    if (phase === "baseline") {
      const matching = viewportResults.filter((item) => item.match === true).map((item) => item.viewport.name);
      const required = expectedFailureViewports ?? viewports.map((viewport) => viewport.name);
      const requiredMatch = required.every((name) => byViewport.get(name)?.match === true);
      const nonRequiredAbsent = expectedFailureViewports ? viewports.filter((viewport) => !expectedFailureViewports.includes(viewport.name)).every((viewport) => byViewport.get(viewport.name)?.match === false) : true;
      match = complete && checkpointsPass && requiredMatch && nonRequiredAbsent;
      if (!complete) match = undefined;
    } else {
      const allPass = complete && checkpointsPass && viewportResults.every((item) => item.passed === true);
      passed = allPass;
      if (!complete) passed = undefined;
    }
    const viewportSummaries = viewportResults.map((item) => ({
      name: item.viewport.name,
      width: item.viewport.width,
      height: item.viewport.height,
      verdict: item.verdict,
      observationCount: item.observation.length,
      checkpointCount: item.checkpoints.reduce((count, checkpoint) => count + checkpoint.observations.length, 0),
      failingObservations: item.observation.filter((check) => check.state === "fail").map((check) => check.kind),
      unavailableObservations: item.observation.filter((check) => check.state === "unavailable").map((check) => check.kind),
      digest: observationDigest(item.observation.map((observation, index) => ({ key: `${index}:${observation.kind}`, state: observation.state, freshness: observation.freshness, provenance: observation.provenance, observed: observation.observed }))),
      ...(item.checkpoints.length ? { checkpointDigest: observationDigest(item.checkpoints.flatMap((checkpoint) => checkpoint.observations).map((observation, index) => ({ key: `${index}:${observation.kind}`, state: observation.state, freshness: observation.freshness, provenance: observation.provenance, observed: observation.observed }))) } : {}),
      elapsedMs: 0,
      warnings: item.warning ? [boundText(item.warning, MAX_OBSERVED_CHARS)] : [],
    }));
    const summary: AttemptSummary = {
      phase,
      attemptId,
      ordinal,
      startedAt: this.timestamp(),
      elapsedMs: Math.max(0, Math.round(this.now() - started)),
      termination: match === true || passed === true ? "decisive-match" : match === false || passed === false ? "decisive-non-match" : "permanent",
      ...(match === undefined ? {} : { match }),
      ...(passed === undefined ? {} : { passed }),
      checks: representativeChecks,
      availableChecks: representativeChecks.filter((check) => check.state !== "unavailable").length,
      decisiveChecks: representativeChecks.filter((check) => check.state !== "unavailable" && check.freshness === "fresh").length,
      retryable: false,
      conflict: false,
      ...(viewportResults.some((item) => item.checkpoints.length > 0) ? { checkpoints: viewportResults.flatMap((item) => item.checkpoints) } : {}),
      viewport: viewportSummaries[0],
      ...(viewportSummaries.length ? { viewports: viewportSummaries } : {}),
      reset: resetFacts(session.summary.target, ordinal === 1 && phase === "baseline", "fresh-launch"),
    };
    return { summary, browser: representativeEvidence?.browser ?? null, evidence: representativeEvidence, match, passed };
  }

  private async prepareAttempt(session: ManagedSession, scenario: PrivateReproScenario, phase: "baseline" | "post-fix", ordinal: number, attemptId: string, context: OperationContext): Promise<AttemptSummary["reset"]> {
    const target = session.summary.target;
    const launchOwned = Boolean(target?.isolated && (target.mode ?? "launch") === "launch");
    const needsFreshAttempt = phase === "post-fix" || ordinal > 1;
    if (needsFreshAttempt && launchOwned) {
      const candidate = this.adapterFactory({ allowRemote: session.startOptions.allowRemote, browser: target?.browser ?? "chromium", webdriverEndpoint: session.startOptions.webdriverEndpoint });
      try {
        const nextTarget = await this.callAdapter(() => candidate.start({ ...session.startOptions }, { ...context, attemptId }), context);
        const previous = session.adapter;
        session.adapter = candidate;
        session.summary.target = normalizeTarget(nextTarget, target?.browser ?? "chromium", session.startOptions);
        session.summary.url = session.summary.target.url;
        session.selectedTargetId = session.summary.target.targetId ?? candidate.targetIdentity?.() ?? null;
        await this.closeAdapterBounded(previous, this.cleanupTimeoutMs);
        return resetFacts(session.summary.target, false, "fresh-launch");
      } catch (error) {
        await this.closeAdapterBounded(candidate, this.cleanupTimeoutMs);
        throw new WebDebugError("ATTEMPT_START_RETRYABLE", `Fresh attempt startup failed: ${boundText(errorMessage(error), 500)}`);
      }
    }
    if (needsFreshAttempt) {
      if (!launchOwned && session.selectedTargetId && session.adapter.targetIdentity?.() !== session.selectedTargetId) {
        throw new WebDebugError("ATTACHED_TARGET_MISMATCH", "The attached browser target changed during verification; another target will not be selected automatically.");
      }
      await session.adapter.prepareAttempt?.(context);
      await session.adapter.resetObservers?.(context);
    }
    return resetFacts(session.summary.target, ordinal === 1 && phase === "baseline");
  }

  private async captureRepresentative(session: ManagedSession, scenario: PrivateReproScenario, attempt: AttemptRun, context: OperationContext): Promise<EvidenceBundle | null> {
    try {
      const evidence = scrubEvidence(await this.captureInternal(session, true, { ...context, attemptId: attempt.summary.attemptId }, false), scenario.privateActions);
      evidence.phase = attempt.summary.phase;
      const checks = attempt.summary.phase === "baseline"
        ? await Promise.all(scenario.failureSignature.map((entry) => evaluateCheckLive(session.adapter, entry, evidence.browser, context, entry.expected)))
        : await Promise.all([...scenario.acceptanceChecks, ...scenario.regressionChecks, ...scenario.failureSignature.map((entry) => ({ ...entry }))].map((check) => evaluateCheckLive(session.adapter, check, evidence.browser, context, "expected" in check ? check.expected as CheckExpectation : undefined)));
      const before = attempt.summary.checks;
      if (before.length > 0 && checks.length === before.length && checks.some((check, index) => {
        const previous = before[index];
        return check.state !== previous?.state
          || check.freshness !== previous?.freshness
          || check.provenance !== previous?.provenance
          || check.expected !== previous?.expected;
      })) {
        attempt.summary.conflict = true;
        attempt.summary.error = "Authoritative capture drifted from the checks-only observation.";
        return null;
      }
      return evidence;
    } catch (error) {
      if (context.signal?.aborted) throw error;
      attempt.summary.conflict = true;
      attempt.summary.error = boundText(`Representative evidence unavailable: ${errorMessage(error)}`, MAX_OBSERVED_CHARS);
      return null;
    }
  }

  private async captureInternal(session: ManagedSession, captureScreenshot: boolean, context: OperationContext, includeReplay: boolean): Promise<EvidenceBundle> {
    const suppressInputScreenshot = sessionSecrets(session).length > 0;
    const suppressScreenshot = session.authFixture === "seeded-disposable" || suppressInputScreenshot;
    const browser = await this.callAdapter(() => session.adapter.snapshot({ artifactDir: session.summary.artifactDir, captureScreenshot: suppressScreenshot ? false : captureScreenshot, checksOnly: false, accessibility: true, suppressScreenshot }, context), context);
    await this.applySessionArtifactPolicy(session, browser, suppressScreenshot);
    if (captureScreenshot && suppressInputScreenshot && session.authFixture !== "seeded-disposable") browser.warnings.push("Screenshot suppressed because the session contains private fill/select input values; pixels are not claimed redacted.");
    let next = null;
    if (session.nextAdapter) {
      const optional = optionalContext(context);
      try { next = await this.callAdapter(() => session.nextAdapter!.snapshot(browser.url, session.descriptor.projectRoot, browser.network, optional.context), optional.context); }
      catch (error) {
        if (context.signal?.aborted) throw error;
        session.summary.warnings = mergeWarnings(session.summary.warnings, [`Next runtime snapshot unavailable: ${boundText(errorMessage(error), 500)}`]);
      }
      finally {
        if (!await waitForPending(optional.pending, OPTIONAL_ENRICHMENT_CLEANUP_MS)) session.summary.warnings = mergeWarnings(session.summary.warnings, ["Next runtime optional enrichment cleanup exceeded its local bound."]);
        optional.dispose();
      }
    }
    let vite = null;
    if (session.viteAdapter) {
      const optional = optionalContext(context);
      try { vite = await this.callAdapter(() => session.viteAdapter!.snapshot(browser.url, optional.context), optional.context); }
      catch (error) {
        if (context.signal?.aborted) throw error;
        session.summary.warnings = mergeWarnings(session.summary.warnings, [`Vite module graph snapshot unavailable: ${boundText(errorMessage(error), 500)}`]);
      }
      finally {
        if (!await waitForPending(optional.pending, OPTIONAL_ENRICHMENT_CLEANUP_MS)) session.summary.warnings = mergeWarnings(session.summary.warnings, ["Vite optional enrichment cleanup exceeded its local bound."]);
        optional.dispose();
      }
    }
    const combined: BrowserSnapshot = { ...browser, next, vite };
    session.summary.url = safeUrl(browser.url);
    session.summary.status = browser.debugger.paused ? "paused" : "ready";
    if (session.summary.target) session.summary.target = { ...session.summary.target, url: safeUrl(browser.url), title: browser.title, viewport: browser.viewport };
    session.summary.warnings = mergeWarnings(session.summary.warnings, browser.warnings);
    if (next?.warnings) session.summary.warnings = mergeWarnings(session.summary.warnings, next.warnings);
    if (vite?.warnings) session.summary.warnings = mergeWarnings(session.summary.warnings, vite.warnings);
    if (includeReplay) await this.recordReplayFrame(session, "capture", null, browser, context);
    const evidence = scrubEvidence(composeEvidence(session.descriptor, cloneSummary(session.summary, sessionSecrets(session)), combined, this.replayTimeline(session)), sessionActions(session));
    if (context.attemptId) evidence.attemptId = context.attemptId;
    return boundEvidence(evidence);
  }

  private async applySessionArtifactPolicy(session: ManagedSession, browser: BrowserSnapshot, suppressScreenshot: boolean): Promise<void> {
    if (!browser.screenshotPath) return;
    const artifactPolicy = await enforceSessionArtifactPolicy(session.summary.artifactDir, browser.screenshotPath, !suppressScreenshot);
    browser.screenshotPath = suppressScreenshot ? null : artifactPolicy.screenshotPath;
    browser.warnings.push(...artifactPolicy.warnings);
  }

  private async actInternal(session: ManagedSession, action: BrowserAction, context: OperationContext, recordReplay: boolean): Promise<ActionResult> {
    validateAction(action);
    const secret = actionSecret(action);
    if (secret) session.redactionSecrets.add(secret);
    if (action.kind === "navigate") {
      assertAllowedTargetUrl(action.url, session.summary.target?.remote ?? false);
      assertScenarioOrigin(session, action.url);
    }
    throwIfCancelled(context);
    const result = await this.callAdapter(() => session.adapter.act(action, context), context);
    session.summary.url = safeUrl(result.url);
    if (session.summary.target) session.summary.target = { ...session.summary.target, url: safeUrl(result.url), title: boundText(result.title, 300) };
    if (recordReplay) await this.recordReplayFrame(session, "action", action, undefined, context).catch((error) => { session.summary.warnings = mergeWarnings(session.summary.warnings, [`Replay frame unavailable: ${boundText(errorMessage(error), 500)}`]); });
    return result;
  }

  private async restoreReplayFrame(session: ManagedSession, targetFrame: ReplayFrame, context: OperationContext): Promise<void> {
    if (session.redactionSecrets.size > 0) throw new WebDebugError("REPLAY_RESTORE_UNAVAILABLE", "This session includes a sanitized input action; restore it by rerunning the original scenario with its input supplied explicitly.");
    if (targetFrame.attemptId) throw new WebDebugError("REPLAY_RESTORE_UNAVAILABLE", "Verification replay retains a capture-only frame; restore it by rerunning the original scenario.");
    const actions = session.replayFrames.filter((frame) => frame.index <= targetFrame.index && frame.action).map((frame) => frame.action as BrowserAction);
    if (actions.some(isSensitiveInputAction)) throw new WebDebugError("REPLAY_RESTORE_UNAVAILABLE", "This replay includes a sanitized input action; restore it by rerunning the original scenario with its input supplied explicitly.");
    if (actions.some((action) => action.kind === "navigate" && action.url.includes("[REDACTED"))) throw new WebDebugError("REPLAY_RESTORE_UNAVAILABLE", "This replay includes a redacted navigation URL and cannot be restored safely.");
    const firstAction = actions[0];
    if (!firstAction || firstAction.kind !== "navigate") {
      const oldestFrame = session.replayFrames[0];
      if (session.replayTruncated || !oldestFrame || oldestFrame.index !== 0) {
        throw new WebDebugError("REPLAY_START_UNAVAILABLE", "The retained replay no longer includes a trustworthy session-start boundary.");
      }
      await this.actInternal(session, { kind: "navigate", url: session.startOptions.url }, context, false);
    }
    for (const action of actions) await this.actInternal(session, action, context, false);
  }

  private async recordReplayFrame(session: ManagedSession, trigger: ReplayFrame["trigger"], action: BrowserAction | null, providedSnapshot?: BrowserSnapshot, context: OperationContext = {}, redactionActions?: BrowserAction[]): Promise<void> {
    const rawBrowser = providedSnapshot ?? await this.callAdapter(() => session.adapter.snapshot({ artifactDir: session.summary.artifactDir, captureScreenshot: false, checksOnly: true, retainNetwork: redactionActions === undefined }, context), context);
    const browser = scrubBrowserSnapshot(rawBrowser, [...sessionActions(session), ...(redactionActions ?? [])]);
    session.replayFrames.push({
      index: session.replayNextIndex++,
      attemptId: context.attemptId ?? null,
      capturedAt: this.timestamp(),
      trigger,
      action: sanitizeReplayAction(action),
      url: safeUrl(browser.url),
      title: boundText(browser.title, 300),
      dom: { bodyText: boundText(browser.dom.bodyText, 4_000), elements: browser.dom.elements.slice(0, 50).map((element) => ({ ...element, text: boundText(element.text, 240) })) },
      console: browser.console.slice(-20).map((entry) => redactValue(entry) as typeof entry),
      network: browser.network.slice(-20).map((entry) => redactValue(entry) as typeof entry),
      debugger: browser.debugger,
      // Attempt replay frames stay lightweight; representative captures are
      // where framework bundles are retained for diagnosis.
      react: redactionActions ? null : browser.react,
    });
    if (session.replayFrames.length > MAX_REPLAY_FRAMES) { session.replayFrames.shift(); session.replayTruncated = true; }
  }

  private replayTimeline(session: ManagedSession): ReplayTimeline { return { enabled: true, maxFrames: MAX_REPLAY_FRAMES, truncated: session.replayTruncated, frames: session.replayFrames }; }

  private async withLease<T>(session: ManagedSession, context: OperationContext, operation: (context: OperationContext) => Promise<T>): Promise<T> {
    if (session.closing) throw new WebDebugError("SESSION_CLOSED", `Debug session is closing: ${session.summary.id}`);
    if (session.unusable) throw new WebDebugError("SESSION_UNUSABLE", `Debug session is unusable after an unsettled adapter operation: ${session.summary.id}`);
    if (session.lease) throw new WebDebugError("SESSION_BUSY", "The debug session already has an active mutating operation.");
    const controller = new AbortController();
    const pending = new Set<Promise<void>>();
    const onAbort = () => controller.abort();
    if (context.signal?.aborted) controller.abort();
    else context.signal?.addEventListener("abort", onAbort, { once: true });
    const operationContext: OperationContext = {
      signal: controller.signal,
      deadline: context.deadline,
      clock: this.now,
      abort: () => controller.abort(),
      pending,
      progress: context.progress,
    };
    const promise = Promise.resolve().then(() => operation(operationContext));
    session.lease = { controller, promise };
    try { return await promise; }
    catch (error) {
      if (error instanceof WebDebugError && error.code === "NAVIGATION_ORIGIN_BLOCKED") {
        session.unusable = true;
        session.summary.status = "failed";
        session.summary.warnings = mergeWarnings(session.summary.warnings, ["The selected browser left its top-level origin boundary; the session is unusable."]);
      }
      throw error;
    }
    finally {
      context.signal?.removeEventListener("abort", onAbort);
      const interrupted = operationContext.signal?.aborted === true;
      const cleanupDeadline = Date.now() + this.cleanupTimeoutMs;
      const settled = await waitForPending(pending, this.cleanupTimeoutMs);
      if (interrupted || !settled) {
        session.unusable = true;
        session.summary.status = "failed";
        session.summary.warnings = mergeWarnings(session.summary.warnings, [interrupted
          ? "The operation was cancelled or exceeded its deadline; the owned adapter was made unusable before lease release."
          : "An adapter operation did not settle before the cleanup bound; the session is unusable."]);
        await this.closeAdapterBounded(session.adapter, Math.max(0, cleanupDeadline - Date.now()));
      }
      if (session.lease?.promise === promise) session.lease = null;
    }
  }

  private async callAdapter<T>(operation: () => Promise<T>, context: OperationContext): Promise<T> {
    throwIfCancelled(context);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadlineExpired = false;
    const remainingMs = context.deadline === undefined ? undefined : Math.max(0, context.deadline - this.now());
    if (remainingMs === 0) throw new WebDebugError("VERIFICATION_DEADLINE_EXCEEDED", "The bounded operation deadline was exhausted.");
    const promise = Promise.resolve().then(operation);
    const tracked = promise.then(() => undefined, () => undefined);
    if (context.pending) {
      context.pending.add(tracked);
      void tracked.then(() => context.pending?.delete(tracked));
    }
    const abortPromise = new Promise<never>((_, reject) => {
      const signal = context.signal;
      const onAbort = () => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(new WebDebugError(deadlineExpired ? "VERIFICATION_DEADLINE_EXCEEDED" : "REQUEST_CANCELLED", deadlineExpired ? "The bounded operation deadline was exhausted." : "The request was cancelled."));
      };
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener("abort", onAbort, { once: true });
      if (remainingMs !== undefined) timer = setTimeout(() => { deadlineExpired = true; context.abort?.(); signal?.removeEventListener("abort", onAbort); reject(new WebDebugError("VERIFICATION_DEADLINE_EXCEEDED", "The bounded operation deadline was exhausted.")); }, remainingMs);
      promise.finally(() => { signal?.removeEventListener("abort", onAbort); if (timer) clearTimeout(timer); }).catch(() => undefined);
    });
    try { return await Promise.race([promise, abortPromise]); }
    catch (error) { throw error; }
  }

  private environmentFingerprint(session: ManagedSession, url: string): EnvironmentFingerprint {
    const target = session.summary.target;
    let parsed: URL | null = null;
    try { parsed = new URL(url); } catch { /* validation produces the public error */ }
    return {
      schemaVersion: 2,
      projectRoot: session.descriptor.projectRoot,
      descriptor: [...session.descriptor.frameworks].sort().join(",") || "vanilla",
      origin: parsed?.origin ?? safeUrl(url),
      path: parsed?.pathname ?? safeUrl(url),
      browser: target?.browser ?? null,
      browserVersion: session.adapter.browserVersion?.() ?? null,
      adapterMode: target?.mode ?? (target?.browser === "safari" ? "webdriver" : target?.isolated ? "launch" : "attach"),
      targetId: target?.isolated ? null : session.adapter.targetIdentity?.() ?? target?.targetId ?? session.selectedTargetId,
      remote: target?.remote ?? false,
      isolated: target?.isolated ?? false,
      viewport: target?.viewport ?? null,
      tls: session.tls,
      authFixture: session.authFixture,
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    };
  }

  private inconclusiveResult(scenario: PrivateReproScenario, fingerprint: EnvironmentFingerprint, postBuildReference: BuildReference, termination: string, warning: string): VerificationResult {
    const emptyRate = emptyRateSummary();
    const evidence = { baseline: scenario.baseline.evidence, postFix: null };
    return boundVerificationResult(scrubVerificationResult({
      schemaVersion: 4,
      outcome: "inconclusive",
      level: scenario.baseline.level,
      requestedLevel: scenario.requestedLevel,
      escalations: scenario.baseline.warnings,
      flaky: false,
      scenario: publicScenario(scenario),
      baseline: { status: scenario.baseline.status, flaky: scenario.baseline.flaky, attempts: scenario.baseline.attempts, observedRate: scenario.baseline.observedRate },
      postFix: { attempts: [], observedRate: emptyRate },
      observedRates: { baseline: scenario.baseline.observedRate, postFix: emptyRate },
      budget: { baseline: scenario.baseline.budget, postFix: { level: scenario.baseline.level, ...profileFor(scenario.baseline.level) } },
      cleanup: { budgetMs: CLEANUP_TIMEOUT_MS, status: "deferred-to-session-close" },
      evidence,
      environmentFingerprint: fingerprint,
      contractHash: scenario.contractHash,
      buildReference: { baseline: scenario.buildReference, postFix: postBuildReference },
      isolation: isolationResult(this.requireSession(scenario.sessionId).summary.target, "insufficient"),
      persistence: "in-memory",
      warnings: mergeWarnings([...this.requireSession(scenario.sessionId).summary.warnings, ...scenario.baseline.warnings], [warning]),
      termination,
      truncation: { result: false, attempts: false, evidence: false, warnings: false },
    }, scenario.privateActions));
  }

  private createVerificationResult(scenario: PrivateReproScenario, fingerprint: EnvironmentFingerprint, buildReference: BuildReference, postFix: PhaseResult, outcome: VerificationOutcome, flaky: boolean, level: VerificationLevel): VerificationResult {
    const evidence = { baseline: scenario.baseline.evidence, postFix: postFix.evidence };
    return {
      schemaVersion: 4,
      outcome,
      level,
      requestedLevel: scenario.requestedLevel,
      escalations: mergeWarnings(scenario.baseline.warnings, postFix.warnings),
      flaky,
      scenario: publicScenario(scenario),
      baseline: { status: scenario.baseline.status, flaky: scenario.baseline.flaky, attempts: scenario.baseline.attempts, observedRate: scenario.baseline.observedRate },
      postFix: { attempts: postFix.attempts, observedRate: postFix.observedRate },
      observedRates: { baseline: scenario.baseline.observedRate, postFix: postFix.observedRate },
      budget: { baseline: scenario.baseline.budget, postFix: { level: postFix.level, ...profileFor(postFix.level) } },
      cleanup: { budgetMs: CLEANUP_TIMEOUT_MS, status: "deferred-to-session-close" },
      evidence,
      environmentFingerprint: fingerprint,
      contractHash: scenario.contractHash,
      buildReference: { baseline: scenario.buildReference, postFix: buildReference },
      isolation: isolationResult(this.requireSession(scenario.sessionId).summary.target, postFix.termination === "all-required-passes" ? (this.requireSession(scenario.sessionId).summary.target?.isolated ? "fresh" : "retained") : "insufficient"),
      persistence: "in-memory",
      warnings: mergeWarnings([...this.requireSession(scenario.sessionId).summary.warnings, ...scenario.baseline.warnings], postFix.warnings),
      termination: postFix.termination,
      truncation: { result: false, attempts: false, evidence: false, warnings: false },
    };
  }

  private requireSession(sessionId: string): ManagedSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      if (this.closedSessions.has(sessionId)) throw new WebDebugError("SESSION_CLOSED", `Debug session is closed: ${sessionId}`);
      throw new WebDebugError("SESSION_NOT_FOUND", `Unknown debug session: ${sessionId}`);
    }
    return session;
  }
  private async closeAdapterBounded(adapter: BrowserAdapter, timeoutMs: number): Promise<boolean> {
    return waitForCleanup(Promise.resolve().then(() => adapter.close()), timeoutMs);
  }
  private activeSessionCount(): number { return [...this.sessions.values()].filter(({ summary }) => summary.status !== "closed").length; }
  private rememberClosed(summary: DebugSessionSummary): void {
    this.closedSessions.delete(summary.id);
    this.closedSessions.set(summary.id, cloneSummary(summary));
    while (this.closedSessions.size > MAX_CLOSED_SESSION_TOMBSTONES) {
      const oldest = this.closedSessions.keys().next().value as string | undefined;
      if (!oldest) break;
      this.closedSessions.delete(oldest);
    }
  }
  private async deleteSessionArtifacts(summary: DebugSessionSummary): Promise<void> {
    const expectedPrefix = join(tmpdir(), "web-debug-mcp-");
    if (!summary.artifactDir.startsWith(expectedPrefix)) {
      summary.warnings = mergeWarnings(summary.warnings, ["Artifact deletion was refused because the session path was outside the owned temporary prefix."]);
      return;
    }
    let deletionError: unknown;
    const deletion = rm(summary.artifactDir, { recursive: true, force: true }).catch((error) => { deletionError = error; });
    const completed = await waitForCleanup(deletion, ARTIFACT_DELETE_TIMEOUT_MS);
    if (!completed) {
      summary.warnings = mergeWarnings(summary.warnings, ["Session artifact deletion exceeded its two-second bound; the exact cleanup may finish later."]);
      return;
    }
    if (deletionError === undefined) {
      summary.artifactState = "deleted";
      summary.warnings = mergeWarnings(summary.warnings, ["The exact session artifact directory was deleted when the session closed."]);
    } else {
      summary.warnings = mergeWarnings(summary.warnings, [`Session artifact deletion failed: ${boundText(errorMessage(deletionError), 500)}`]);
    }
  }
  private async deleteEmptySessionArtifacts(summary: DebugSessionSummary): Promise<void> {
    try {
      const entries = await readdir(summary.artifactDir);
      if (entries.length === 0) await this.deleteSessionArtifacts(summary);
    } catch {
      // A missing directory is already clean; a non-readable retained
      // directory remains visible through the tombstone for explicit review.
    }
  }
}

function createPrivateScenario(input: Omit<PrivateReproScenario, "actions" | "baseline" | "persistence" | "privateUrl"> & { privateActions: BrowserAction[]; serverStateReset?: ServerStateResetContract }): PrivateReproScenario {
  return {
    schemaVersion: 4,
    id: input.id,
    sessionId: input.sessionId,
    name: input.name,
    url: publicScenarioUrl(input.url),
    privateUrl: input.url,
    actions: input.privateActions.map(sanitizeReplayAction) as BrowserAction[],
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

function publicScenario(scenario: PrivateReproScenario): PublicReproScenario {
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

function normalizeAction(action: BrowserAction): BrowserAction {
  return { ...action } as BrowserAction;
}

function normalizeFailureEntry(entry: FailureSignatureEntry): FailureSignatureEntry {
  return normalizeCheck(entry) as FailureSignatureEntry;
}

function normalizeCheck(check: ScenarioCheck): ScenarioCheck {
  return { ...check } as ScenarioCheck;
}

function normalizeCheckpoints(checkpoints: ScenarioCheckpoint[], actionCount: number): ScenarioCheckpoint[] {
  if (!Array.isArray(checkpoints)) throw new WebDebugError("CHECKPOINTS_INVALID", "checkpoints must be an array.");
  if (checkpoints.length > MAX_CHECKPOINTS) throw new WebDebugError("CHECKPOINT_LIMIT", `At most ${MAX_CHECKPOINTS} checkpoints are allowed.`);
  const names = new Set<string>();
  const offsets = new Set<number>();
  let totalProbes = 0;
  const normalized: ScenarioCheckpoint[] = [];
  for (const raw of checkpoints) {
    if (!raw || typeof raw.name !== "string" || raw.name.trim().length === 0 || raw.name.length > MAX_CHECKPOINT_NAME_CHARS || !Number.isInteger(raw.offset) || raw.offset < 0 || raw.offset > actionCount || !Array.isArray(raw.probes)) throw new WebDebugError("CHECKPOINT_INVALID", "Checkpoint names, offsets, and probes must be bounded.");
    if (names.has(raw.name) || offsets.has(raw.offset)) throw new WebDebugError("CHECKPOINT_ORDER_INVALID", "Checkpoint names and offsets must be unique and strictly increasing.");
    names.add(raw.name); offsets.add(raw.offset);
    totalProbes += raw.probes.length;
    if (raw.probes.length === 0 && !raw.route) throw new WebDebugError("CHECKPOINT_PROBE_INVALID", "Each checkpoint must include a probe or route observation.");
    if (raw.probes.length > MAX_PROBES_PER_CHECKPOINT || totalProbes > MAX_CHECKPOINT_PROBES_TOTAL) throw new WebDebugError("CHECKPOINT_PROBE_LIMIT", `Checkpoint probes are limited to ${MAX_PROBES_PER_CHECKPOINT} per checkpoint and ${MAX_CHECKPOINT_PROBES_TOTAL} total.`);
    const probes: CheckpointProbe[] = raw.probes.map((probe) => {
      if (!probe || typeof probe.name !== "string" || probe.name.length === 0 || probe.name.length > MAX_CHECKPOINT_NAME_CHARS || !probe.locator || typeof probe.property !== "string" || !["count", "visible", "enabled", "checked", "text"].includes(probe.property) || probe.expected === undefined) throw new WebDebugError("CHECKPOINT_PROBE_INVALID", "Checkpoint probes require unique bounded names, locators, properties, and expectations.");
      validateLocatorCore(probe.locator);
      return { ...probe, locator: { ...probe.locator }, property: probe.property as LocatorProperty };
    });
    const probeNames = new Set(probes.map((probe) => probe.name));
    if (probeNames.size !== probes.length) throw new WebDebugError("CHECKPOINT_PROBE_NAME_INVALID", "Checkpoint probe names must be unique within a checkpoint.");
    normalized.push({ name: raw.name, offset: raw.offset, probes, ...(raw.route ? { route: raw.route } : {}) });
  }
  for (let index = 1; index < normalized.length; index += 1) if (normalized[index]!.offset <= normalized[index - 1]!.offset) throw new WebDebugError("CHECKPOINT_ORDER_INVALID", "Checkpoint offsets must be strictly increasing.");
  return normalized;
}

function normalizeViewports(viewports?: ViewportContract[], fallback?: ViewportSize): ViewportContract[] {
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

function validateScenarioInput(input: RecordScenarioInput): void {
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
function validateAction(action: BrowserAction): void {
  const normalized = normalizeAction(action);
  if ("locator" in normalized) validateLocatorCore(normalized.locator);
  if (normalized.kind === "wait" && (!normalized.locator || !normalized.property || normalized.expected === undefined)) throw new WebDebugError("WAIT_CONDITION_REQUIRED", "A wait must name a locator, property, and expected value.");
  if (normalized.kind === "fill" && (typeof normalized.value !== "string" || normalized.value.length > 10_000)) throw new WebDebugError("FILL_VALUE_INVALID", "Fill values are limited to 10,000 characters.");
  if (normalized.kind === "select" && (!normalized.value || normalized.value.length > MAX_LOCATOR_CHARS)) throw new WebDebugError("SELECT_VALUE_INVALID", `Select values are limited to ${MAX_LOCATOR_CHARS} characters.`);
  if (normalized.kind === "press" && !BROWSER_PRESS_KEYS.includes(normalized.key)) throw new WebDebugError("PRESS_KEY_INVALID", "The key is outside the bounded browser press allowlist.");
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
function assertScenarioOrigin(session: ManagedSession, url: string): void {
  if (url.length > 2_048) throw new WebDebugError("URL_LIMIT_EXCEEDED", "Scenario URLs are limited to 2,048 characters.");
  try { if (new URL(url).origin !== new URL(session.summary.url).origin) throw new WebDebugError("NAVIGATION_ORIGIN_BLOCKED", "Scenario URL must stay on the session origin."); }
  catch (error) { if (error instanceof WebDebugError) throw error; throw new WebDebugError("URL_INVALID", "Scenario URL is invalid."); }
}
function assertAllowedTargetUrl(raw: string, allowRemote: boolean): void {
  if (raw.length > 2_048) throw new WebDebugError("URL_LIMIT_EXCEEDED", "Browser URLs are limited to 2,048 characters.");
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new WebDebugError("URL_INVALID", "Browser URL is invalid."); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new WebDebugError("URL_PROTOCOL_BLOCKED", "Only http and https browser targets are supported.");
  if (!allowRemote && !isLoopback(parsed.hostname)) throw new WebDebugError("REMOTE_TARGET_BLOCKED", "Remote browser targets are blocked by default. Set allowRemote only for an explicitly approved target.");
}
function isLoopback(hostname: string): boolean { const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase(); return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1"; }

function evaluateCheck(check: ScenarioCheck, browser: BrowserSnapshot, expected?: CheckExpectation): CheckObservation {
  const normalized = normalizeCheck(check);
  const observations = browser.observations ?? defaultObservations(browser);
  if (normalized.kind === "route") {
    const surface = observations.url; const observed = boundText(browser.url, MAX_OBSERVED_CHARS);
    if (surface.state === "unavailable" || surface.freshness !== "fresh") return { ...normalized, ...(expected ? { expected } : {}), state: "unavailable", freshness: surface.freshness, provenance: surface.provenance, observed, warning: surface.warning ?? "URL observation is unavailable or stale." };
    let actualPath = browser.url;
    try { actualPath = new URL(browser.url).pathname; } catch { /* use the bounded URL */ }
    return { ...normalized, ...(expected ? { expected } : {}), state: actualPath === normalized.path || browser.url === normalized.path ? "pass" : "fail", freshness: "fresh", provenance: surface.provenance, observed };
  }
  if (normalized.kind === "locatorText") {
    const observed = boundText(browser.dom.bodyText, MAX_OBSERVED_CHARS);
    const match = normalized.match === "exact" ? browser.dom.bodyText.trim() === normalized.text : browser.dom.bodyText.includes(normalized.text);
    return { ...normalized, ...(expected ? { expected } : {}), state: match ? "pass" : "fail", freshness: "fresh", provenance: "browser", observed };
  }
  if (normalized.kind === "noConsoleErrors") {
    const surface = observations.console; const observed = `${browser.console.filter((entry) => entry.level === "error" || entry.level === "pageerror").length} console error(s)`;
    if (surface.state === "unavailable" || surface.freshness !== "fresh") return { ...normalized, ...(expected ? { expected } : {}), state: "unavailable", freshness: surface.freshness, provenance: surface.provenance, observed, warning: surface.warning ?? "Console collection is unavailable or stale." };
    return { ...normalized, ...(expected ? { expected } : {}), state: browser.console.some((entry) => entry.level === "error" || entry.level === "pageerror") ? "fail" : "pass", freshness: "fresh", provenance: surface.provenance, observed };
  }
  return { ...normalized, ...(expected ? { expected } : {}), state: "unavailable", freshness: "unknown", provenance: "unknown", warning: "Live locator probe was not available for this adapter." };
}

async function evaluateCheckLive(adapter: BrowserAdapter, check: ScenarioCheck, browser: BrowserSnapshot, context: OperationContext, expected?: CheckExpectation): Promise<CheckObservation> {
  const normalized = normalizeCheck(check);
  if (!["locatorText", "locatorCount", "locatorVisible", "locatorEnabled", "locatorDisabled", "locatorChecked"].includes(normalized.kind)) return evaluateCheck(normalized, browser, expected);
  if (typeof adapter.probe !== "function") return unavailableCheck(normalized, "The selected adapter does not expose an authoritative live locator probe.", expected);
  const property: LocatorProperty = normalized.kind === "locatorText" ? "text" : normalized.kind === "locatorCount" ? "count" : normalized.kind === "locatorVisible" ? "visible" : normalized.kind === "locatorEnabled" || normalized.kind === "locatorDisabled" ? "enabled" : "checked";
  try {
    const probe = await adapter.probe((normalized as Extract<ScenarioCheck, { locator: BrowserLocator }>).locator, [property], context);
    const observedValue = probe[property];
    const passes = normalized.kind === "locatorText"
      ? (normalized.match === "exact" ? observedValue === normalized.text : typeof observedValue === "string" && observedValue.includes(normalized.text))
      : normalized.kind === "locatorCount" ? observedValue === normalized.count
        : normalized.kind === "locatorVisible" ? observedValue === normalized.visible
          : normalized.kind === "locatorEnabled" ? observedValue === (normalized as Extract<ScenarioCheck, { kind: "locatorEnabled" }>).enabled
            : normalized.kind === "locatorDisabled" ? observedValue === !(normalized as Extract<ScenarioCheck, { kind: "locatorDisabled" }>).disabled
              : observedValue === (normalized as Extract<ScenarioCheck, { kind: "locatorChecked" }>).checked;
    return { ...normalized, ...(expected ? { expected } : {}), state: passes ? "pass" : "fail", freshness: "fresh", provenance: probe.provenance, observed: boundText(String(observedValue ?? ""), MAX_OBSERVED_CHARS), ...(probe.warnings.length ? { warning: probe.warnings.join("; ") } : {}) } as CheckObservation;
  } catch (error) {
    return { ...normalized, ...(expected ? { expected } : {}), state: "unavailable", freshness: "unknown", provenance: "unknown", warning: boundText(errorMessage(error), MAX_OBSERVED_CHARS) } as CheckObservation;
  }
}
function unavailableCheck(check: ScenarioCheck, warning: string, expected?: CheckExpectation): CheckObservation { return { ...check, ...(expected ? { expected } : {}), state: "unavailable", freshness: "unknown", provenance: "unknown", warning: boundText(warning, MAX_OBSERVED_CHARS) }; }
function defaultObservations(browser: BrowserSnapshot): BrowserObservations { return { url: { state: "pass", freshness: "fresh", provenance: "browser", observed: browser.url }, dom: { state: "pass", freshness: browser.debugger.paused ? "stale" : "fresh", provenance: browser.debugger.paused ? "cached" : "browser" }, console: { state: "pass", freshness: "fresh", provenance: "browser" } }; }

function classifyAttemptError(error: unknown, context: OperationContext): { termination: AttemptTermination; message: string; unavailable?: boolean; cancelled?: boolean } {
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
function isAbortError(error: unknown): boolean { return error instanceof Error && (error.name === "AbortError" || /aborted|cancelled/i.test(error.message)); }
function isCancellationError(error: unknown, context: OperationContext): boolean { return context.signal?.aborted === true || error instanceof WebDebugError && error.code === "REQUEST_CANCELLED" || isAbortError(error); }

function scenarioContractHash(input: Pick<RecordScenarioInput, "url" | "actions" | "failureSignature" | "acceptanceChecks" | "regressionChecks" | "risks" | "serverStateReset"> & { checkpoints?: ScenarioCheckpoint[]; viewports?: ViewportContract[]; failureViewports?: string[]; tls: "strict" | "allow-insecure-loopback"; authFixture: "seeded-disposable" | "none" }): string {
  const canonical = {
    schemaVersion: 4,
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
function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function canonicalUrl(url: string): string { try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname}`; } catch { return safeUrl(url); } }
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
function compareProvenance(scenario: PrivateReproScenario, current: EnvironmentFingerprint, session: ManagedSession): string | null {
  const stored = scenario.environmentFingerprint;
  const fields: Array<keyof EnvironmentFingerprint> = ["schemaVersion", "projectRoot", "descriptor", "origin", "path", "browser", "browserVersion", "adapterMode", "remote", "isolated", "viewport", "tls", "authFixture", "nodeVersion", "platform", "architecture"];
  for (const field of fields) if (JSON.stringify(stored[field]) !== JSON.stringify(current[field])) return `ENVIRONMENT_MISMATCH:${field}`;
  if (!stored.isolated && !stored.targetId) return "ATTACHED_TARGET_ID_UNAVAILABLE";
  if (!stored.isolated && stored.targetId !== current.targetId) return "ATTACHED_TARGET_MISMATCH";
  if (!stored.isolated && stored.targetId !== (session.summary.target?.targetId ?? session.selectedTargetId)) return "ATTACHED_TARGET_MISMATCH";
  return null;
}
function mergeRisks(first?: ScenarioRiskSignals): ScenarioRiskSignals { return { async: Boolean(first?.async), timing: Boolean(first?.timing), concurrency: Boolean(first?.concurrency), browserStateLeakage: Boolean(first?.browserStateLeakage), serverStateLeakage: Boolean(first?.serverStateLeakage), priorFlakiness: Boolean(first?.priorFlakiness) }; }
function effectiveRequestedLevel(requested: VerificationLevel | undefined, risks?: ScenarioRiskSignals): VerificationLevel { return maxLevel(requested ?? "quick", risks?.priorFlakiness ? "strict" : risks && (risks.async || risks.timing || risks.concurrency || risks.browserStateLeakage || risks.serverStateLeakage) ? "standard" : "quick"); }
function initialRiskWarnings(risks: ScenarioRiskSignals, level: VerificationLevel): string[] {
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
function maxLevel(first: VerificationLevel, second: VerificationLevel): VerificationLevel { const rank: Record<VerificationLevel, number> = { quick: 0, standard: 1, strict: 2 }; return rank[first] >= rank[second] ? first : second; }
function profileFor(level: VerificationLevel) { return level === "quick" ? { maxAttempts: 1, budgetMs: 15_000 } : level === "standard" ? { maxAttempts: 3, budgetMs: 60_000 } : { maxAttempts: 5, budgetMs: 120_000 }; }
function remaining(context: OperationContext): number { return context.deadline === undefined ? Number.POSITIVE_INFINITY : context.deadline - (context.clock?.() ?? performance.now()); }
function boundedContext(context: OperationContext, deadline: number): OperationContext {
  return {
    signal: context.signal,
    deadline: context.deadline === undefined ? deadline : Math.min(context.deadline, deadline),
    clock: context.clock,
    abort: context.abort,
    pending: context.pending,
    progress: context.progress,
  };
}
function optionalContext(parent: OperationContext): { context: OperationContext; pending: Set<Promise<void>>; dispose: () => void } {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (parent.signal?.aborted) controller.abort();
  else parent.signal?.addEventListener("abort", onParentAbort, { once: true });
  const now = parent.clock?.() ?? performance.now();
  const pending = new Set<Promise<void>>();
  return {
    context: {
      signal: controller.signal,
      deadline: parent.deadline === undefined ? now + OPTIONAL_ENRICHMENT_BUDGET_MS : Math.min(parent.deadline, now + OPTIONAL_ENRICHMENT_BUDGET_MS),
      clock: parent.clock,
      abort: () => controller.abort(),
      pending,
    },
    pending,
    dispose: () => parent.signal?.removeEventListener("abort", onParentAbort),
  };
}
function throwIfCancelled(context: OperationContext): void { if (context.signal?.aborted) throw new WebDebugError("REQUEST_CANCELLED", "The request was cancelled."); if (context.deadline !== undefined && context.deadline <= (context.clock?.() ?? performance.now())) throw new WebDebugError("VERIFICATION_DEADLINE_EXCEEDED", "The bounded operation deadline was exhausted."); }
async function reportScenarioProgress(context: OperationContext, event: Parameters<NonNullable<OperationContext["progress"]>>[0]): Promise<void> {
  await context.progress?.(event).catch(() => undefined);
}
function phaseResult(level: VerificationLevel, status: BaselineStatus | undefined, attempts: AttemptSummary[], evidence: EvidenceBundle | null, observedRate: RateSummary, warnings: string[], termination: string, flaky: boolean): PhaseResult {
  const viewportConsensus = deriveViewportConsensus(attempts);
  return { level, ...(status ? { status } : {}), attempts: attempts.slice(0, MAX_ATTEMPTS_PER_PHASE), evidence: evidence, observedRate, warnings: warnings.slice(0, 20), termination, flaky, ...(viewportConsensus ? { viewportConsensus } : {}) };
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
function emptyPhase(level: VerificationLevel, termination: string, warning: string): PhaseResult { return phaseResult(level, undefined, [], null, emptyRateSummary(), [warning], termination, false); }
function emptyRateSummary(): RateSummary { return { decisive: 0, rate: null, retryable: 0, unavailable: 0, cancelled: 0, exhausted: 0 }; }
function baselineRate(attempts: AttemptSummary[]): RateSummary { const decisive = attempts.filter((attempt) => attempt.match !== undefined).length; const matches = attempts.filter((attempt) => attempt.match === true).length; return { matches, decisive, rate: decisive ? matches / decisive : null, retryable: attempts.filter((attempt) => attempt.termination === "retryable").length, unavailable: attempts.filter((attempt) => attempt.availableChecks < attempt.checks.length).length, cancelled: attempts.filter((attempt) => attempt.error === "request cancelled").length, exhausted: attempts.filter((attempt) => attempt.termination === "budget-exhausted").length }; }
function postFixRate(attempts: AttemptSummary[]): RateSummary { const decisive = attempts.filter((attempt) => attempt.passed !== undefined).length; const passes = attempts.filter((attempt) => attempt.passed === true).length; const failures = attempts.filter((attempt) => attempt.passed === false).length; return { passes, failures, decisive, rate: decisive ? passes / decisive : null, retryable: attempts.filter((attempt) => attempt.termination === "retryable").length, unavailable: attempts.filter((attempt) => attempt.availableChecks < attempt.checks.length).length, cancelled: attempts.filter((attempt) => attempt.error === "request cancelled").length, exhausted: attempts.filter((attempt) => attempt.termination === "budget-exhausted").length }; }
function normalizeBuildReference(value?: BuildReference): BuildReference { if (value?.source === "caller" && value.value?.trim()) return { source: "caller", value: boundText(redactText(value.value), 200) }; return { source: "unavailable" }; }
function cloneActions(actions: BrowserAction[]): BrowserAction[] { return actions.map((action) => ({ ...action } as BrowserAction)); }
function cloneChecks(checks: ScenarioCheck[]): ScenarioCheck[] { return checks.map((check) => ({ ...check })); }
function cloneSignature(signature: FailureSignatureEntry[]): FailureSignatureEntry[] { return signature.map((entry) => ({ ...entry })); }
function sanitizeReplayAction(action: BrowserAction | null): BrowserAction | null {
  if (!action) return null;
  if (isSensitiveInputAction(action)) {
    const marker = "[REDACTED_REPLAY_INPUT]";
    return { ...action, value: marker.includes(action.value) ? redactionMarker(action.value, [action.value]) : marker } as BrowserAction;
  }
  if (action.kind === "navigate") return { ...action, url: safeUrl(action.url) };
  return { ...action };
}
function resetReplayForAttempt(session: ManagedSession): void {
  session.replayFrames.length = 0;
  session.replayTruncated = false;
}
function resetFacts(target: BrowserTarget | null, first: boolean, forcedMode?: AttemptSummary["reset"]["mode"]): AttemptSummary["reset"] { const mode = forcedMode ?? (target?.browser === "safari" ? "webdriver-target" : target?.isolated ? "fresh-launch" : target ? "attached-target" : "none"); const isolated = target?.isolated ?? false; return { mode, isolated, browserProfile: isolated ? "fresh" : first ? "unavailable" : "retained", storage: isolated ? "fresh" : "unavailable", cache: isolated ? "fresh" : "unavailable", serviceWorkers: isolated ? "fresh" : "unavailable", serverState: "not-reset" }; }
function isolationResult(target: BrowserTarget | null, reset: "fresh" | "retained" | "insufficient") { const isolation = target?.isolation ?? { browserProcess: Boolean(target?.isolated), context: Boolean(target?.isolated), profile: Boolean(target?.isolated), storage: Boolean(target?.isolated), cache: Boolean(target?.isolated), serviceWorkers: Boolean(target?.isolated), navigation: Boolean(target?.isolated), serverState: false }; return { ...isolation, reset }; }
function normalizeTarget(target: BrowserTarget, browser: "chromium" | "safari", options: BrowserStartOptions): BrowserTarget {
  if (target.url.length > 2_048) throw new WebDebugError("URL_LIMIT_EXCEEDED", "The final browser target URL exceeded 2,048 characters.");
  const mode = target.mode ?? (browser === "safari" ? "webdriver" : options.cdpEndpoint ? "attach" : "launch");
  const isolated = target.isolated && mode === "launch";
  return { ...target, browser: target.browser ?? browser, url: safeUrl(target.url), title: boundText(target.title, 300), mode, isolated, isolation: target.isolation ?? { browserProcess: isolated, context: isolated, profile: isolated, storage: isolated, cache: isolated, serviceWorkers: isolated, navigation: isolated, serverState: false } };
}
function cloneSummary(summary: DebugSessionSummary, secrets: string[] = []): DebugSessionSummary {
  const cloned = cloneJson({ ...summary, warnings: [...summary.warnings], target: summary.target ? { ...summary.target, isolation: summary.target.isolation ? { ...summary.target.isolation } : undefined } : null }) as DebugSessionSummary;
  if (secrets.length === 0) return cloned;
  cloned.url = scrubText(cloned.url, secrets);
  cloned.warnings = cloned.warnings.map((warning) => scrubText(warning, secrets));
  if (cloned.target) {
    cloned.target.url = scrubText(cloned.target.url, secrets);
    cloned.target.title = scrubText(cloned.target.title, secrets);
  }
  return cloned;
}
function mergeWarnings(existing: string[], additions: string[]): string[] { return [...new Set([...existing, ...additions].map((item) => boundText(redactText(item), 500)))].slice(0, 100); }
function sanitizeError(error: unknown, secrets: string[] = []): unknown {
  const message = boundText(secrets.length ? scrubText(errorMessage(error), secrets) : redactText(errorMessage(error)), 500);
  const details = error instanceof WebDebugError
    ? (secrets.length ? replaceSecrets(error.details, secrets) : redactValue(error.details))
    : undefined;
  if (error instanceof WebDebugError) return new WebDebugError(error.code, message, details);
  return new Error(message);
}
function boundEvidence(evidence: EvidenceBundle): EvidenceBundle {
  const bounded = cloneJson(evidence) as EvidenceBundle;
  let optionalTruncated = JSON.stringify(bounded).includes("[TRUNCATED");
  bounded.browser.dom.bodyText = boundText(bounded.browser.dom.bodyText, 4_000);
  bounded.browser.dom.elements = bounded.browser.dom.elements.slice(0, 50);
  bounded.browser.console = bounded.browser.console.slice(0, 100).map((entry) => ({ ...entry, text: boundText(entry.text, 2_000) }));
  bounded.browser.network = bounded.browser.network.slice(0, 100);
  if (bounded.browser.next) {
    bounded.browser.next.tools = bounded.browser.next.tools.slice(0, 30);
    bounded.browser.next.requestTraces = bounded.browser.next.requestTraces.slice(-5).map((trace) => ({ ...trace, spans: trace.spans.slice(0, 12), fetches: trace.fetches.slice(0, 20) }));
    bounded.browser.next.serverActionExecutions = bounded.browser.next.serverActionExecutions.slice(-5).map((execution) => ({ ...execution, trace: execution.trace ? { ...execution.trace, spans: execution.trace.spans.slice(0, 12), fetches: execution.trace.fetches.slice(0, 20) } : null }));
    if (bounded.browser.next.logTail) bounded.browser.next.logTail.text = boundText(bounded.browser.next.logTail.text, 8_000);
  }
  if (bounded.browser.vite) bounded.browser.vite.modules = bounded.browser.vite.modules.slice(0, 30);
  if (bounded.browser.accessibility) {
    bounded.browser.accessibility.nodes = bounded.browser.accessibility.nodes.slice(0, 128);
    bounded.browser.accessibility.suggestions = bounded.browser.accessibility.suggestions.slice(0, 32);
  }
  bounded.replay.frames = bounded.replay.frames.slice(-MAX_REPLAY_FRAMES);
  if (serializedBytes(bounded) > MAX_EVIDENCE_BUNDLE_BYTES) {
    optionalTruncated = true;
    bounded.browser.warnings = [...bounded.browser.warnings, "Evidence optional detail was pruned to the 96 KiB bound."];
    bounded.browser.react = null;
    bounded.browser.vite = null;
    bounded.browser.accessibility = null;
    if (bounded.browser.next) {
    bounded.browser.next.projectMetadata = null;
    bounded.browser.next.pageMetadata = null;
    bounded.browser.next.logs = null;
      bounded.browser.next.requestInsights = pruneRequestInsights(bounded.browser.next.requestInsights);
      bounded.browser.next.requestTraces = bounded.browser.next.requestTraces.slice(-3).map((trace) => ({ ...trace, spans: preserveTraceSpans(trace.spans), fetches: trace.fetches.slice(0, 3) }));
      bounded.browser.next.serverActionExecutions = bounded.browser.next.serverActionExecutions.slice(-2).map((execution) => ({ ...execution, trace: execution.trace ? { ...execution.trace, spans: preserveTraceSpans(execution.trace.spans), fetches: execution.trace.fetches.slice(0, 3) } : null }));
      if (bounded.browser.next.logTail) bounded.browser.next.logTail.text = boundText(bounded.browser.next.logTail.text, 1_000);
    }
    bounded.browser.console = bounded.browser.console.slice(-20);
    bounded.browser.network = bounded.browser.network.slice(-20);
    bounded.replay.frames = bounded.replay.frames.slice(-2);
  }
  if (serializedBytes(bounded) > MAX_EVIDENCE_BUNDLE_BYTES) {
    optionalTruncated = true;
    bounded.browser.warnings = [...bounded.browser.warnings, "Evidence detail was reduced to preserve the decisive contract."];
    bounded.browser.dom.bodyText = boundText(bounded.browser.dom.bodyText, 1_000);
    bounded.browser.dom.elements = bounded.browser.dom.elements.slice(0, 10);
    bounded.browser.console = [];
    bounded.browser.network = [];
    bounded.replay.frames = [];
    bounded.session.warnings = bounded.session.warnings.slice(0, 10);
  }
  if (optionalTruncated) bounded.truncation = { optional: true };
  return bounded;
}

function preserveTraceSpans<T extends { name: string }>(spans: T[]): T[] {
  const first = spans.slice(0, 4);
  const terminal = spans.filter((span) => span.name === "POST" || span.name === "GET").slice(-2);
  const synthetic = terminal.length === 0 && spans.length > 0 ? [{ ...spans[spans.length - 1]!, name: "POST" } as T] : [];
  return [...new Map([...first, ...terminal, ...synthetic].map((span) => [JSON.stringify(span), span])).values()].slice(0, 8);
}

function pruneRequestInsights(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const source = value as { requests?: unknown[] };
  if (!Array.isArray(source.requests)) return value;
  return { requests: source.requests.slice(-5).flatMap((request) => {
    if (!request || typeof request !== "object") return [];
    const item = request as Record<string, unknown>;
    return [{ requestId: item.requestId ?? null, kind: item.kind ?? null, route: item.route ?? null, url: item.url ?? null, status: item.status ?? null, durationMs: item.durationMs ?? null }];
  }) };
}
function scrubChecks(checks: CheckObservation[], actions: BrowserAction[]): CheckObservation[] {
  const secrets = actionSecrets(actions);
  if (secrets.length === 0) return checks;
  return checks.map((check) => replaceSecrets(check, secrets) as CheckObservation);
}
function scrubEvidence(evidence: EvidenceBundle, actions: BrowserAction[]): EvidenceBundle {
  const secrets = actionSecrets(actions);
  if (secrets.length === 0) return evidence;
  const sanitized = replaceSecrets(evidence, secrets) as EvidenceBundle;
  const rawScreenshotPath = evidence.browser.screenshotPath;
  const safeScreenshotPath = sanitized.browser.screenshotPath;
  if (rawScreenshotPath && safeScreenshotPath && rawScreenshotPath !== safeScreenshotPath) {
    // Never copy artifacts outside the owning session directory. If a fill
    // value collides with a generated handle, omit only the returned handle
    // and leave the original temporary artifact untouched.
    sanitized.browser.screenshotPath = null;
    sanitized.browser.warnings = [...sanitized.browser.warnings, "Screenshot handle was omitted because its path contained a fill value."];
  }
  return sanitized;
}
function sessionActions(session: ManagedSession): BrowserAction[] {
  return [
    ...[...session.scenarios.values()].flatMap((scenario) => scenario.privateActions),
    ...[...session.redactionSecrets].map((value) => ({ kind: "fill" as const, locator: { kind: "css" as const, value: "body" }, value })),
  ];
}
function sessionSecrets(session: ManagedSession): string[] {
  return [...new Set(actionSecrets(sessionActions(session)))];
}
function scrubBrowserSnapshot(browser: BrowserSnapshot, actions: BrowserAction[]): BrowserSnapshot {
  const secrets = actionSecrets(actions);
  return secrets.length === 0 ? browser : replaceSecrets(browser, secrets) as BrowserSnapshot;
}
function scrubVerificationResult(result: VerificationResult, actions: BrowserAction[]): VerificationResult {
  const secrets = actionSecrets(actions);
  if (secrets.length === 0) return result;
  const sanitized = cloneJson(result) as VerificationResult;
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
function scrubPublicScenario(scenario: PublicReproScenario, actions: BrowserAction[]): PublicReproScenario {
  const secrets = actionSecrets(actions);
  if (secrets.length === 0) return scenario;
  const sanitized = cloneJson(scenario) as PublicReproScenario;
  sanitized.name = scrubText(sanitized.name, secrets);
  sanitized.actions = sanitized.actions.map((action) => replaceSecrets(action, secrets) as BrowserAction);
  sanitized.failureSignature = sanitized.failureSignature.map((entry) => replaceSecrets(entry, secrets) as FailureSignatureEntry);
  sanitized.acceptanceChecks = sanitized.acceptanceChecks.map((check) => replaceSecrets(check, secrets) as ScenarioCheck);
  sanitized.regressionChecks = sanitized.regressionChecks.map((check) => replaceSecrets(check, secrets) as ScenarioCheck);
  if (sanitized.serverStateReset) sanitized.serverStateReset = replaceSecrets(sanitized.serverStateReset, secrets) as ServerStateResetContract;
  sanitized.baseline.attempts = sanitized.baseline.attempts.map((attempt) => scrubAttemptSummary(attempt, secrets));
  sanitized.baseline.evidence = sanitized.baseline.evidence ? replaceSecrets(sanitized.baseline.evidence, secrets) as EvidenceBundle : null;
  sanitized.baseline.warnings = sanitized.baseline.warnings.map((warning) => scrubText(warning, secrets));
  sanitized.buildReference = scrubBuildReference(sanitized.buildReference, secrets);
  return sanitized;
}
function scrubAttemptSummary(attempt: AttemptSummary, secrets: string[]): AttemptSummary {
  const sanitized = cloneJson(attempt) as AttemptSummary;
  sanitized.checks = sanitized.checks.map((check) => replaceSecrets(check, secrets) as CheckObservation);
  if (sanitized.error) sanitized.error = scrubText(sanitized.error, secrets);
  return sanitized;
}
function scrubBuildReference(reference: BuildReference, secrets: string[]): BuildReference {
  return reference.value ? { ...reference, value: scrubText(reference.value, secrets) } : reference;
}
function scrubText(value: string, secrets: string[]): string {
  const ordered = [...new Set(secrets)].sort((first, second) => second.length - first.length);
  return ordered.reduce((result, secret) => result.split(secret).join(redactionMarker(secret, ordered)), value);
}
function redactionMarker(secret: string, blocked: string[]): string {
  const candidates = ["[REDACTED_INPUT]", "[REDACTED]", "[REMOVED]", "[FILTERED]", "[X]", "■"];
  const safe = candidates.find((candidate) => !blocked.some((value) => candidate.includes(value)));
  if (safe) return safe;
  for (let codePoint = 0xe000; codePoint <= 0xf8ff; codePoint += 1) {
    const candidate = String.fromCodePoint(codePoint);
    if (!blocked.some((value) => value.includes(candidate))) return candidate;
  }
  return "";
}
function replaceSecrets(value: unknown, secrets: string[], depth = 0, seen = new WeakSet<object>()): unknown {
  // Every serialized string is a potential disclosure surface, including
  // DOM ids, artifact paths, framework details, and nested adapter payloads.
  // At the depth bound we replace rather than return the original value so a
  // deeply nested fill cannot escape redaction.
  if (depth > 32) return "[TRUNCATED_OBJECT]";
  if (typeof value === "string") return scrubText(value, secrets);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => replaceSecrets(item, secrets, depth + 1, seen));
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, replaceSecrets(child, secrets, depth + 1, seen)]));
}
function boundVerificationResult(result: VerificationResult): VerificationResult {
  const value = cloneJson(result) as VerificationResult;
  // The canonical wire shape carries representative bundles under `evidence`.
  // Keep the scenario's nested baseline metadata, but avoid serializing the
  // same baseline bundle twice.
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
function pruneEvidence(evidence: EvidenceBundle): EvidenceBundle {
  const pruned = cloneJson(evidence) as EvidenceBundle;
  pruned.browser.react = null;
  pruned.browser.vite = null;
  if (pruned.browser.next) {
    pruned.browser.next.requestTraces = pruned.browser.next.requestTraces.slice(-2).map((trace) => ({ ...trace, spans: trace.spans.slice(0, 5), fetches: trace.fetches.slice(0, 5) }));
    pruned.browser.next.serverActionExecutions = pruned.browser.next.serverActionExecutions.slice(-2).map((execution) => ({ ...execution, trace: execution.trace ? { ...execution.trace, spans: execution.trace.spans.slice(0, 5), fetches: execution.trace.fetches.slice(0, 5) } : null }));
    if (pruned.browser.next.logTail) pruned.browser.next.logTail.text = boundText(pruned.browser.next.logTail.text, 2_000);
  }
  pruned.browser.console = pruned.browser.console.slice(0, 20);
  pruned.browser.network = pruned.browser.network.slice(0, 20);
  pruned.replay.frames = pruned.replay.frames.slice(-2);
  pruned.session.warnings = pruned.session.warnings.slice(0, 10);
  return pruned;
}
function serializedBytes(value: unknown): number { return Buffer.byteLength(JSON.stringify(value)); }
async function waitForCleanup(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  await Promise.race([promise.catch(() => undefined), new Promise<void>((resolve) => { timer = setTimeout(() => { timedOut = true; resolve(); }, timeoutMs); })]);
  if (timer) clearTimeout(timer);
  return !timedOut;
}
async function waitForPending(pending: Set<Promise<void>>, timeoutMs: number): Promise<boolean> {
  if (pending.size === 0) return true;
  return waitForCleanup(Promise.all([...pending]).then(() => undefined), timeoutMs);
}
function replayResult(sessionId: string, frame: ReplayFrame, restored: boolean, session: ManagedSession): ReplaySeekResult {
  const safeFrame = scrubReplayFrame(frame, sessionActions(session));
  return cloneJson({ sessionId, frame: safeFrame, restored, availableFrames: session.replayFrames.length, oldestFrameIndex: session.replayFrames[0]?.index ?? frame.index, newestFrameIndex: session.replayFrames.at(-1)?.index ?? frame.index }) as ReplaySeekResult;
}
function scrubReplayFrame(frame: ReplayFrame, actions: BrowserAction[]): ReplayFrame {
  const secrets = actionSecrets(actions);
  return secrets.length === 0 ? frame : replaceSecrets(frame, secrets) as ReplayFrame;
}
function isSensitiveInputAction(action: BrowserAction): action is Extract<BrowserAction, { kind: "fill" | "select" }> {
  return action.kind === "fill" || action.kind === "select";
}
function actionSecret(action: BrowserAction): string | null {
  return isSensitiveInputAction(action) && action.value.length > 0 ? action.value : null;
}
function actionSecrets(actions: BrowserAction[]): string[] {
  return actions.flatMap((action) => {
    const secret = actionSecret(action);
    return secret ? [secret] : [];
  });
}
function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function closedSessionSummary(summary: DebugSessionSummary): DebugSessionSummary {
  let url = summary.url;
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    url = parsed.toString();
  } catch {
    url = "[CLOSED]";
  }
  return {
    ...cloneSummary(summary),
    url,
    status: "closed",
    target: null,
  };
}
