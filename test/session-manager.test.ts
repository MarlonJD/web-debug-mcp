import { describe, expect, it, vi } from "vitest";
import { access, readdir, writeFile } from "node:fs/promises";

import type {
  ActionResult,
  BrowserAction,
  BrowserLocator,
  BrowserSnapshot,
  BrowserTarget,
  DebuggerBreakpoint,
  DebuggerSnapshot,
  FailureSignatureEntry,
  OperationContext,
  ScenarioCheck,
  LocatorProperty,
  LocatorProbeResult,
} from "../src/domain/types.js";
import type { BrowserAdapter, BrowserStartOptions, EvaluationResult, SnapshotOptions } from "../src/adapters/browser.js";
import { WebDebugError } from "../src/core/errors.js";
import { SessionManager, type RecordScenarioInput, type StartSessionInput } from "../src/core/session-manager.js";
import { NextAdapter } from "../src/adapters/next.js";
import { ViteAdapter } from "../src/adapters/vite.js";
import { MAX_ARTIFACT_BYTES, MAX_SESSION_SCREENSHOTS } from "../src/core/artifact-store.js";

type SnapshotScript = BrowserSnapshot | Error | ((options: SnapshotOptions, adapter: ScriptedBrowserAdapter) => BrowserSnapshot | Promise<BrowserSnapshot>);

interface AdapterConfig {
  browser?: "chromium" | "safari";
  isolated?: boolean;
  mode?: "launch" | "attach" | "webdriver";
  targetId?: string;
  failStart?: boolean | ((instanceNumber: number) => boolean);
  failAction?: Error;
  hangActions?: boolean;
  hangClose?: boolean;
  bufferNetwork?: boolean;
  navigateOnClickTo?: string;
  finalStartUrl?: string;
}

class ScriptedBrowserAdapter implements BrowserAdapter {
  readonly actions: BrowserAction[] = [];
  readonly startedUrls: string[] = [];
  readonly startedOptions: BrowserStartOptions[] = [];
  readonly snapshotOptions: SnapshotOptions[] = [];
  readonly snapshotNetworks: BrowserSnapshot["network"][] = [];
  snapshotCount = 0;
  closeCount = 0;
  prepareCount = 0;
  resetCount = 0;
  targetIdValue: string | null;
  private readonly target: BrowserTarget;
  private actionRelease: ((result: ActionResult) => void) | null = null;
  private readonly actionGate: Promise<ActionResult> | null = null;
  private networkGeneration = 1;
  private networkBuffer: BrowserSnapshot["network"] = [];
  private lastSnapshot: BrowserSnapshot | null = null;

  constructor(
    private readonly snapshots: SnapshotScript[],
    private readonly instanceNumber: number,
    private readonly config: AdapterConfig = {},
  ) {
    this.targetIdValue = config.targetId ?? `target-${instanceNumber}`;
    this.target = {
      browser: config.browser ?? "chromium",
      remote: false,
      url: "http://127.0.0.1:4173/",
      title: "Fixture",
      viewport: { width: 1_440, height: 900 },
      isolated: config.isolated ?? false,
      mode: config.mode ?? (config.isolated ? "launch" : "attach"),
      targetId: this.targetIdValue ?? undefined,
      isolation: {
        browserProcess: config.isolated ?? false,
        context: config.isolated ?? false,
        profile: config.isolated ?? false,
        storage: config.isolated ?? false,
        cache: config.isolated ?? false,
        serviceWorkers: config.isolated ?? false,
        navigation: config.isolated ?? false,
        serverState: false,
      },
    };
    if (config.hangActions) this.actionGate = new Promise<ActionResult>((resolve) => { this.actionRelease = resolve; });
    if (config.bufferNetwork) this.networkBuffer = [this.networkEntry()];
  }

  async start(options: BrowserStartOptions): Promise<BrowserTarget> {
    this.startedUrls.push(options.url);
    this.startedOptions.push(structuredClone(options));
    const shouldFail = typeof this.config.failStart === "function" ? this.config.failStart(this.instanceNumber) : this.config.failStart;
    if (shouldFail) throw new WebDebugError("BROWSER_START_RETRYABLE", "scripted candidate startup failed");
    this.target.url = this.config.finalStartUrl ?? options.url;
    if (options.viewport) this.target.viewport = options.viewport;
    return { ...this.target, targetId: this.targetIdValue ?? undefined };
  }

  async close(): Promise<void> {
    this.closeCount += 1;
    if (this.config.hangClose) await new Promise<void>(() => undefined);
  }

  async prepareAttempt(): Promise<void> { this.prepareCount += 1; }
  async resetObservers(): Promise<void> {
    this.resetCount += 1;
    if (this.config.bufferNetwork) {
      this.networkGeneration += 1;
      this.networkBuffer = [this.networkEntry()];
    }
  }
  targetIdentity(): string | null { return this.targetIdValue; }
  browserVersion(): string | null { return "scripted-1"; }

  async act(action: BrowserAction): Promise<ActionResult> {
    this.actions.push({ ...action } as BrowserAction);
    if (action.kind === "navigate") this.target.url = action.url;
    if (action.kind === "click" && this.config.navigateOnClickTo) this.target.url = this.config.navigateOnClickTo;
    if (this.config.failAction) throw this.config.failAction;
    const result = { kind: action.kind, url: this.target.url, title: this.target.title };
    if (this.actionGate) return this.actionGate;
    return result;
  }

  releaseAction(): void {
    const result = { kind: "click" as const, url: this.target.url, title: this.target.title };
    this.actionRelease?.(result);
    this.actionRelease = null;
  }

  async snapshot(options: SnapshotOptions): Promise<BrowserSnapshot> {
    this.snapshotCount += 1;
    this.snapshotOptions.push(options);
    const next = this.snapshots.shift();
    if (next instanceof Error) throw next;
    const scripted = await (typeof next === "function" ? next(options, this) : next ?? snapshotFor("Fixed"));
    if (!this.config.bufferNetwork) { this.lastSnapshot = scripted; return scripted; }
    const network = options.checksOnly ? [] : this.networkBuffer;
    this.snapshotNetworks.push(network);
    if (options.checksOnly && !options.retainNetwork) this.networkBuffer = [];
    const result = { ...scripted, network }; this.lastSnapshot = result; return result;
  }

  async probe(locator: BrowserLocator, properties: LocatorProperty[]): Promise<LocatorProbeResult> {
    if (this.lastSnapshot?.observations?.dom?.freshness === "stale") throw new WebDebugError("REQUIRED_OBSERVATION_UNAVAILABLE", "DOM probe is stale in the scripted target.");
    const text = this.lastSnapshot?.dom.bodyText ?? "";
    const result: LocatorProbeResult = { locator, properties: [...new Set(properties)], observedAt: new Date().toISOString(), provenance: "browser", warnings: [] };
    if (result.properties.includes("count")) result.count = 1;
    if (result.properties.includes("visible")) result.visible = true;
    if (result.properties.includes("enabled")) result.enabled = true;
    if (result.properties.includes("checked")) result.checked = false;
    if (result.properties.includes("text")) result.text = text;
    return result;
  }

  private networkEntry(): BrowserSnapshot["network"][number] {
    return {
      requestId: `attempt-buffer-${this.networkGeneration}`,
      method: "GET",
      url: `http://127.0.0.1:4173/request/${this.networkGeneration}`,
      resourceType: "fetch",
      status: 200,
      ok: true,
    };
  }

  async setBreakpoint(input: { sourceUrl: string; line: number; column?: number }): Promise<DebuggerBreakpoint> {
    return { id: "scripted-breakpoint", sourceUrl: input.sourceUrl, line: input.line, column: input.column ?? null };
  }

  async control(_action: "resume" | "stepOver" | "stepInto" | "stepOut", _context?: OperationContext): Promise<DebuggerSnapshot> { return emptyDebugger(); }
  async evaluate(_expression: string, _allowSideEffects: boolean, _context?: OperationContext): Promise<EvaluationResult> { return { value: null, type: "object", description: null }; }
}

function emptyDebugger(): DebuggerSnapshot {
  return { paused: false, reason: null, callFrames: [], breakpoints: [] };
}

function snapshotFor(bodyText: string, options: {
  console?: BrowserSnapshot["console"];
  observations?: BrowserSnapshot["observations"];
  elements?: BrowserSnapshot["dom"]["elements"];
  network?: BrowserSnapshot["network"];
  react?: BrowserSnapshot["react"];
  angular?: BrowserSnapshot["angular"];
  vue?: BrowserSnapshot["vue"];
  screenshotPath?: string | null;
  warnings?: string[];
} = {}): BrowserSnapshot {
  return {
    url: "http://127.0.0.1:4173/",
    title: "Fixture",
    viewport: { width: 1_440, height: 900 },
    dom: { bodyText, elements: options.elements ?? [] },
    console: options.console ?? [],
    network: options.network ?? [],
    screenshotPath: options.screenshotPath ?? null,
    debugger: emptyDebugger(),
    react: options.react ?? null,
    angular: options.angular ?? null,
    vue: options.vue ?? null,
    next: null,
    vite: null,
    warnings: options.warnings ?? [],
    observations: options.observations ?? {
      url: { state: "pass", freshness: "fresh", provenance: "browser" },
      dom: { state: "pass", freshness: "fresh", provenance: "browser" },
      console: { state: "pass", freshness: "fresh", provenance: "browser" },
    },
  };
}

function hugeReactSnapshot(): NonNullable<BrowserSnapshot["react"]> {
  const node = {
    name: "Large",
    source: null,
    props: { blob: "x".repeat(300_000) },
    hooks: [],
    renderCount: 1,
    renderCause: "mount" as const,
    propChanges: [],
    hookChanges: [],
    actualDurationMs: null,
    selfDurationMs: null,
    treeDurationMs: null,
    children: [],
  };
  return {
    detected: true,
    rendererCount: 1,
    commitCount: 1,
    commits: [],
    profiler: { mode: "devtools-hook", capped: false },
    components: [node],
    flamegraph: [],
    warnings: [],
  };
}

function managerFor(snapshots: SnapshotScript[], config: AdapterConfig = {}, now = () => 0, cleanupTimeoutMs = 0) {
  const adapters: ScriptedBrowserAdapter[] = [];
  const manager = new SessionManager(() => {
    const adapter = new ScriptedBrowserAdapter(snapshots, adapters.length + 1, config);
    adapters.push(adapter);
    return adapter;
  }, { now, timestamp: () => "2026-08-27T00:00:00.000Z", cleanupTimeoutMs });
  return { manager, adapters };
}

function scenarioInput(sessionId: string, overrides: Partial<RecordScenarioInput> = {}): RecordScenarioInput {
  return {
    sessionId,
    name: "scripted scenario",
    url: "http://127.0.0.1:4173/",
    actions: [],
    failureSignature: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Bug", match: "contains", expected: "pass" }],
    acceptanceChecks: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Fixed", match: "contains" }],
    ...overrides,
  };
}

async function start(manager: SessionManager, config: Partial<StartSessionInput> = {}) {
  return manager.start({ projectRoot: "fixtures/vanilla", url: "http://127.0.0.1:4173/", ...config });
}

async function record(manager: SessionManager, sessionId: string, overrides: Partial<RecordScenarioInput> = {}) {
  return manager.recordScenario(scenarioInput(sessionId, overrides));
}

describe("session manager adaptive contract", () => {
  it("forwards detected framework metadata privately and discloses Safari runtime limits", async () => {
    const vue = managerFor([snapshotFor("Fixed")], { mode: "attach", targetId: "tab-1" });
    const vueSession = await start(vue.manager, { projectRoot: "fixtures/vue-vite" });
    expect(vue.adapters[0]?.startedOptions[0]?.frameworks).toEqual(["vite", "vue"]);
    await vue.manager.close(vueSession.id);

    const safari = managerFor([snapshotFor("Fixed")], { browser: "safari", mode: "webdriver", targetId: "safari-1" });
    const safariSession = await start(safari.manager, { projectRoot: "fixtures/angular", browser: "safari" });
    expect(safariSession.warnings.join(" ")).toContain("generic browser evidence only");
    await safari.manager.close(safariSession.id);
  });

  it("records and verifies a low-risk quick scenario with one authoritative attempt", async () => {
    const { manager, adapters } = managerFor([snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Fixed"), snapshotFor("Fixed")], { mode: "attach", targetId: "tab-1" });
    const session = await start(manager);
    const scenario = await record(manager, session.id);
    const result = await manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id });

    expect(scenario.baseline.status).toBe("reproduced");
    expect(scenario.baseline.attempts).toHaveLength(1);
    expect(result.outcome).toBe("verified");
    expect(result.level).toBe("quick");
    expect(result.baseline.observedRate).toMatchObject({ matches: 1, decisive: 1, rate: 1 });
    expect(result.postFix.observedRate).toMatchObject({ passes: 1, decisive: 1, rate: 1 });
    expect(result.evidence.postFix?.attemptId).toBe(result.postFix.attempts[0]?.attemptId);
    expect(adapters[0]?.actions.map((action) => action.kind)).toEqual(["navigate", "navigate"]);
    await manager.close(session.id);
  });

  it("short-circuits verification when the decisive baseline is not reproduced", async () => {
    const { manager, adapters } = managerFor([snapshotFor("Healthy"), snapshotFor("Healthy")], { mode: "attach", targetId: "tab-1" });
    const session = await start(manager);
    const scenario = await record(manager, session.id);
    const beforeVerifySnapshots = adapters[0]?.snapshotCount;
    const result = await manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id });

    expect(scenario.baseline.status).toBe("not_reproduced");
    expect(result.outcome).toBe("inconclusive");
    expect(result.termination).toBe("BASELINE_NOT_REPRODUCED");
    expect(adapters[0]?.snapshotCount).toBe(beforeVerifySnapshots);
    expect(adapters[0]?.actions).toHaveLength(1);
    await manager.close(session.id);
  });

  it("requires all repeated standard passes and keeps one bounded representative per phase", async () => {
    const snapshots = [
      snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug"),
      snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"),
    ];
    const { manager, adapters } = managerFor(snapshots, { mode: "attach", targetId: "tab-1" });
    const session = await start(manager);
    const scenario = await record(manager, session.id, { requestedLevel: "standard" });
    const result = await manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id });

    expect(result.outcome).toBe("verified");
    expect(result.level).toBe("standard");
    expect(scenario.baseline.attempts).toHaveLength(2);
    expect(result.postFix.attempts).toHaveLength(3);
    expect(result.postFix.attempts.every((attempt) => attempt.passed === true)).toBe(true);
    expect(result.postFix.observedRate).toMatchObject({ passes: 3, decisive: 3, rate: 1 });
    expect(adapters[0]?.snapshotOptions.filter((options) => options.checksOnly).length).toBe(5);
    expect(scenario.baseline.evidence?.replay.frames).toHaveLength(1);
    expect(scenario.baseline.evidence?.replay.frames[0]?.attemptId).toBe(scenario.baseline.attempts[0]?.attemptId);
    expect(result.evidence.postFix?.replay.frames).toHaveLength(1);
    expect(result.evidence.postFix?.replay.frames[0]?.attemptId).toBe(result.postFix.attempts.at(-1)?.attemptId);
    expect(result.evidence.postFix?.replay.frames[0]?.react).toBeNull();
    expect(result.evidence.postFix?.replay.frames[0]?.angular).toBeNull();
    expect(result.evidence.postFix?.replay.frames[0]?.vue).toBeNull();
    expect(result.evidence.postFix?.replay.frames[0]?.index).toBeGreaterThan(scenario.baseline.evidence?.replay.frames[0]?.index ?? -1);
    await manager.close(session.id);
  });

  it("retains current-attempt network only for authoritative representatives", async () => {
    const snapshots = [
      snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug"),
      snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"),
    ];
    const { manager, adapters } = managerFor(snapshots, { mode: "attach", targetId: "tab-1", bufferNetwork: true });
    const session = await start(manager);
    const scenario = await record(manager, session.id, { requestedLevel: "standard" });
    const result = await manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id });
    const adapter = adapters[0]!;

    expect(result.outcome).toBe("verified");
    expect(adapter.snapshotOptions.filter((options) => options.checksOnly).every((options) => options.retainNetwork === true)).toBe(true);
    expect(adapter.snapshotOptions.every((options, index) => !options.checksOnly || adapter.snapshotNetworks[index]?.length === 0)).toBe(true);
    expect(result.evidence.baseline?.browser.network.map((entry) => entry.requestId)).toEqual(["attempt-buffer-1"]);
    expect(result.evidence.postFix?.browser.network.map((entry) => entry.requestId)).toEqual(["attempt-buffer-5"]);
    expect(result.evidence.baseline?.browser.network).toHaveLength(1);
    expect(result.evidence.postFix?.browser.network).toHaveLength(1);
    expect(result.postFix.attempts.every((attempt) => !Object.prototype.hasOwnProperty.call(attempt, "network"))).toBe(true);
    await manager.close(session.id);
  });

  it("returns failed immediately for quick post-fix failure and after two matching repeated failures", async () => {
    const quick = managerFor([snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug")], { mode: "attach", targetId: "tab-1" });
    const quickSession = await start(quick.manager);
    const quickScenario = await record(quick.manager, quickSession.id);
    const quickResult = await quick.manager.verifyScenario({ sessionId: quickSession.id, scenarioId: quickScenario.id });
    expect(quickResult.outcome).toBe("failed");
    expect(quickResult.postFix.attempts).toHaveLength(1);
    await quick.manager.close(quickSession.id);

    const repeated = managerFor([
      snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug"),
      snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug"),
    ], { mode: "attach", targetId: "tab-1" });
    const repeatedSession = await start(repeated.manager);
    const repeatedScenario = await record(repeated.manager, repeatedSession.id, { requestedLevel: "standard" });
    const repeatedResult = await repeated.manager.verifyScenario({ sessionId: repeatedSession.id, scenarioId: repeatedScenario.id });
    expect(repeatedResult.outcome).toBe("failed");
    expect(repeatedResult.postFix.attempts).toHaveLength(2);
    expect(repeatedResult.postFix.observedRate).toMatchObject({ failures: 2, decisive: 2, rate: 0 });
    await repeated.manager.close(repeatedSession.id);
  });

  it("matches the complete failure signature for positive, negative, and mixed polarity entries", async () => {
    const cases: Array<{ name: string; failureSignature: FailureSignatureEntry[]; baseline: BrowserSnapshot; post: BrowserSnapshot; acceptanceChecks: ScenarioCheck[]; outcome: string }> = [
      {
        name: "positive",
        failureSignature: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Bug", match: "contains", expected: "pass" }],
        baseline: snapshotFor("Bug"),
        post: snapshotFor("Bug"),
        acceptanceChecks: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Bug", match: "contains" }],
        outcome: "failed",
      },
      {
        name: "negative",
        failureSignature: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Bug", match: "contains", expected: "fail" }],
        baseline: snapshotFor("Fixed"),
        post: snapshotFor("Fixed"),
        acceptanceChecks: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Fixed", match: "contains" }],
        outcome: "failed",
      },
      {
        name: "mixed-negative",
        failureSignature: [
          { kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Bug", match: "contains", expected: "pass" },
          { kind: "noConsoleErrors", expected: "fail" },
        ],
        baseline: snapshotFor("Bug", { console: [{ level: "error", text: "original failure" }] }),
        post: snapshotFor("Bug"),
        acceptanceChecks: [{ kind: "noConsoleErrors" }],
        outcome: "verified",
      },
    ];

    for (const item of cases) {
      const { manager } = managerFor([item.baseline, item.baseline, item.post, item.post], { mode: "attach", targetId: "tab-1" });
      const session = await start(manager);
      const scenario = await record(manager, session.id, { name: item.name, failureSignature: item.failureSignature, acceptanceChecks: item.acceptanceChecks });
      const result = await manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id });
      expect(result.outcome, item.name).toBe(item.outcome);
      await manager.close(session.id);
    }
  });

  it("stops on a post-fix pass/fail conflict in either observation order", async () => {
    for (const postSnapshots of [
      [snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Bug"), snapshotFor("Bug")],
      [snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Fixed"), snapshotFor("Fixed")],
    ]) {
      const { manager } = managerFor([snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug"), ...postSnapshots], { mode: "attach", targetId: "tab-1" });
      const session = await start(manager);
      const scenario = await record(manager, session.id, { requestedLevel: "standard" });
      const result = await manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id });
      expect(result.outcome).toBe("inconclusive");
      expect(result.flaky).toBe(true);
      expect(result.termination).toBe("post-fix-conflict");
      expect(result.postFix.attempts).toHaveLength(2);
      await manager.close(session.id);
    }
  });

  it("uses distinct fresh launch adapters for isolated repeated attempts and discloses attached limits", async () => {
    const isolated = managerFor([
      snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug"),
      snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"),
    ], { isolated: true, mode: "launch" });
    const isolatedSession = await start(isolated.manager);
    const isolatedScenario = await record(isolated.manager, isolatedSession.id, { requestedLevel: "standard" });
    const isolatedResult = await isolated.manager.verifyScenario({ sessionId: isolatedSession.id, scenarioId: isolatedScenario.id });
    expect(isolated.adapters).toHaveLength(5);
    expect(new Set(isolated.adapters.map((adapter) => adapter.targetIdentity())).size).toBe(5);
    expect(isolatedResult.isolation.reset).toBe("fresh");
    expect(isolatedResult.postFix.attempts.every((attempt) => attempt.reset.mode === "fresh-launch" && attempt.reset.isolated)).toBe(true);
    await isolated.manager.close(isolatedSession.id);

    const attached = managerFor([snapshotFor("Bug"), snapshotFor("Bug")], { isolated: false, mode: "attach", targetId: "tab-1" });
    const attachedSession = await start(attached.manager);
    const attachedScenario = await record(attached.manager, attachedSession.id, { risks: { browserStateLeakage: true } });
    const attachedResult = await attached.manager.verifyScenario({ sessionId: attachedSession.id, scenarioId: attachedScenario.id });
    expect(attachedScenario.baseline.status).toBe("inconclusive");
    expect(attachedResult.outcome).toBe("inconclusive");
    expect(attachedResult.warnings.join(" ")).toContain("browser isolation");
    await attached.manager.close(attachedSession.id);
  });

  it("requires an explicit observable server-state reset contract", async () => {
    const noReset = managerFor([], { mode: "attach", targetId: "tab-1" });
    const noResetSession = await start(noReset.manager);
    const noResetScenario = await record(noReset.manager, noResetSession.id, { risks: { serverStateLeakage: true } });
    const noResetResult = await noReset.manager.verifyScenario({ sessionId: noResetSession.id, scenarioId: noResetScenario.id });
    expect(noResetScenario.baseline.termination).toBe("SERVER_STATE_RESET_REQUIRED");
    expect(noResetResult.termination).toBe("SERVER_STATE_RESET_REQUIRED");
    await noReset.manager.close(noResetSession.id);

    const withReset = managerFor([
      snapshotFor("Reset"), snapshotFor("Bug"), snapshotFor("Bug"),
      snapshotFor("Reset"), snapshotFor("Bug"),
      snapshotFor("Reset"), snapshotFor("Fixed"), snapshotFor("Fixed"),
      snapshotFor("Reset"), snapshotFor("Fixed"),
      snapshotFor("Reset"), snapshotFor("Fixed"), snapshotFor("Fixed"),
    ], { mode: "attach", targetId: "tab-1" });
    const withResetSession = await start(withReset.manager);
    const withResetScenario = await record(withReset.manager, withResetSession.id, {
      risks: { serverStateLeakage: true },
      serverStateReset: { action: { kind: "click", locator: { kind: "css", value: "#reset" } }, readyCheck: { kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Reset", match: "contains" } },
    });
    const withResetResult = await withReset.manager.verifyScenario({ sessionId: withResetSession.id, scenarioId: withResetScenario.id });
    expect(withResetResult.outcome).toBe("verified");
    expect(withResetResult.postFix.attempts[0]?.reset.serverState).toBe("reset-by-scenario");
    await withReset.manager.close(withResetSession.id);
  });

  it("promotes quick retryability to standard and standard baseline conflict to strict", async () => {
    const quickToStandard = managerFor([
      new WebDebugError("WAIT_TIMEOUT", "readiness timeout"),
      snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug"),
    ], { mode: "attach", targetId: "tab-1" });
    const qSession = await start(quickToStandard.manager);
    const qScenario = await record(quickToStandard.manager, qSession.id);
    expect(qScenario.baseline.status).toBe("reproduced");
    expect(qScenario.baseline.level).toBe("standard");
    expect(qScenario.baseline.attempts).toHaveLength(3);
    await quickToStandard.manager.close(qSession.id);

    const postPromotion = managerFor([
      snapshotFor("Bug"), snapshotFor("Bug"),
      new WebDebugError("WAIT_TIMEOUT", "readiness timeout"),
      snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"),
    ], { mode: "attach", targetId: "tab-1" });
    const pSession = await start(postPromotion.manager);
    const pScenario = await record(postPromotion.manager, pSession.id);
    const pResult = await postPromotion.manager.verifyScenario({ sessionId: pSession.id, scenarioId: pScenario.id });
    expect(pResult.outcome).toBe("inconclusive");
    expect(pResult.level).toBe("standard");
    expect(pResult.postFix.attempts).toHaveLength(3);
    expect(pResult.postFix.attempts[0]?.termination).toBe("retryable");
    await postPromotion.manager.close(pSession.id);

    const conflict = managerFor([snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Healthy"), snapshotFor("Bug")], { mode: "attach", targetId: "tab-1" });
    const cSession = await start(conflict.manager);
    const cScenario = await record(conflict.manager, cSession.id, { requestedLevel: "standard" });
    expect(cScenario.baseline.status).toBe("reproduced");
    expect(cScenario.baseline.level).toBe("strict");
    expect(cScenario.baseline.attempts).toHaveLength(3);
    await conflict.manager.close(cSession.id);

    const postStrict = managerFor([
      snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug"),
      new WebDebugError("WAIT_TIMEOUT", "readiness timeout"),
      snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"),
    ], { mode: "attach", targetId: "tab-1" });
    const sSession = await start(postStrict.manager);
    const sScenario = await record(postStrict.manager, sSession.id, { requestedLevel: "standard" });
    const sResult = await postStrict.manager.verifyScenario({ sessionId: sSession.id, scenarioId: sScenario.id });
    expect(sResult.outcome).toBe("inconclusive");
    expect(sResult.level).toBe("strict");
    expect(sResult.postFix.attempts).toHaveLength(5);
    expect(sResult.postFix.attempts[0]?.termination).toBe("retryable");
    await postStrict.manager.close(sSession.id);
  });

  it("honors strict attempt ceilings and phase deadlines without real sleeps", async () => {
    const strict = managerFor([
      snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug"),
      snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"),
    ], { mode: "attach", targetId: "tab-1" });
    const strictSession = await start(strict.manager);
    const strictScenario = await record(strict.manager, strictSession.id, { requestedLevel: "strict" });
    const strictResult = await strict.manager.verifyScenario({ sessionId: strictSession.id, scenarioId: strictScenario.id });
    expect(strictResult.outcome).toBe("verified");
    expect(strictResult.postFix.attempts).toHaveLength(5);
    expect(strictResult.budget.postFix.maxAttempts).toBe(5);
    await strict.manager.close(strictSession.id);

    const deadline = managerFor([snapshotFor("Bug")], { mode: "attach", targetId: "tab-1" }, () => 0);
    const deadlineSession = await start(deadline.manager);
    const deadlineScenario = await deadline.manager.recordScenario(scenarioInput(deadlineSession.id), { deadline: 0 });
    expect(deadlineScenario.baseline.status).toBe("inconclusive");
    expect(deadlineScenario.baseline.termination).toBe("budget-exhausted");
    expect(deadline.adapters[0]?.snapshotCount).toBe(0);
    await deadline.manager.close(deadlineSession.id);
  });

  it("treats stale DOM and unavailable Safari console observations as inconclusive", async () => {
    const stale = managerFor([snapshotFor("Bug", { observations: {
      url: { state: "pass", freshness: "fresh", provenance: "browser" },
      dom: { state: "pass", freshness: "stale", provenance: "cached" },
      console: { state: "pass", freshness: "fresh", provenance: "browser" },
    } })], { mode: "attach", targetId: "tab-1" });
    const staleSession = await start(stale.manager);
    const staleScenario = await record(stale.manager, staleSession.id);
    expect(staleScenario.baseline.status).toBe("inconclusive");
    await stale.manager.close(staleSession.id);

    const safari = managerFor([
      snapshotFor("Bug", { observations: {
        url: { state: "pass", freshness: "fresh", provenance: "browser" },
        dom: { state: "pass", freshness: "fresh", provenance: "browser" },
        console: { state: "unavailable", freshness: "unknown", provenance: "unknown", warning: "BiDi unavailable" },
      } }),
      snapshotFor("Bug", { observations: {
        url: { state: "pass", freshness: "fresh", provenance: "browser" },
        dom: { state: "pass", freshness: "fresh", provenance: "browser" },
        console: { state: "unavailable", freshness: "unknown", provenance: "unknown", warning: "BiDi unavailable" },
      } }),
      snapshotFor("Fixed", { observations: {
        url: { state: "pass", freshness: "fresh", provenance: "browser" },
        dom: { state: "pass", freshness: "fresh", provenance: "browser" },
        console: { state: "unavailable", freshness: "unknown", provenance: "unknown", warning: "BiDi unavailable" },
      } }),
    ], { browser: "safari", mode: "webdriver", targetId: "safari-session" });
    const safariSession = await start(safari.manager, { browser: "safari" });
    const safariScenario = await record(safari.manager, safariSession.id, { acceptanceChecks: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Fixed", match: "contains" }, { kind: "noConsoleErrors" }] });
    const safariResult = await safari.manager.verifyScenario({ sessionId: safariSession.id, scenarioId: safariScenario.id });
    expect(safariScenario.baseline.status).toBe("reproduced");
    expect(safariResult.outcome).toBe("inconclusive");
    expect(safariResult.postFix.attempts[0]?.checks.some((check) => check.state === "unavailable")).toBe(true);
    await safari.manager.close(safariSession.id);
  });

  it("makes authoritative drift or unavailable representative capture inconclusive", async () => {
    for (const postRepresentative of [snapshotFor("Bug"), new Error("full capture unavailable")]) {
      const { manager } = managerFor([snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Fixed"), postRepresentative], { mode: "attach", targetId: "tab-1" });
      const session = await start(manager);
      const scenario = await record(manager, session.id);
      const result = await manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id });
      expect(result.outcome).toBe("inconclusive");
      expect(result.flaky).toBe(true);
      expect(result.termination).toBe("post-fix-conflict");
      await manager.close(session.id);
    }
  });

  it("keeps browser-only verification decisive when optional Next/Vite/React enrichment is unavailable", async () => {
    const nextSnapshot = vi.spyOn(NextAdapter.prototype, "snapshot").mockRejectedValue(new Error("Next optional enrichment unavailable"));
    try {
      const next = managerFor([snapshotFor("Bug", { warnings: ["React snapshot unavailable: optional enrichment timed out."] }), snapshotFor("Bug", { warnings: ["React snapshot unavailable: optional enrichment timed out."] }), snapshotFor("Fixed"), snapshotFor("Fixed")], { mode: "attach", targetId: "tab-1" });
      const nextSession = await start(next.manager, { projectRoot: "fixtures/next" });
      const nextScenario = await record(next.manager, nextSession.id);
      const nextResult = await next.manager.verifyScenario({ sessionId: nextSession.id, scenarioId: nextScenario.id });
      expect(nextResult.outcome).toBe("verified");
      expect(nextResult.evidence.postFix?.browser.next).toBeNull();
      expect(nextResult.warnings.join(" ")).toContain("Next runtime snapshot unavailable");
      expect(nextResult.warnings.join(" ")).toContain("React snapshot unavailable");
      await next.manager.close(nextSession.id);
    } finally {
      nextSnapshot.mockRestore();
    }

    const viteSnapshot = vi.spyOn(ViteAdapter.prototype, "snapshot").mockRejectedValue(new Error("Vite optional enrichment timed out"));
    try {
      const vite = managerFor([snapshotFor("Bug", { warnings: ["React snapshot unavailable: optional enrichment timed out."] }), snapshotFor("Bug", { warnings: ["React snapshot unavailable: optional enrichment timed out."] }), snapshotFor("Fixed"), snapshotFor("Fixed")], { mode: "attach", targetId: "tab-1" });
      const viteSession = await start(vite.manager, { projectRoot: "fixtures/react-vite" });
      const viteScenario = await record(vite.manager, viteSession.id);
      const viteResult = await vite.manager.verifyScenario({ sessionId: viteSession.id, scenarioId: viteScenario.id });
      expect(viteResult.outcome).toBe("verified");
      expect(viteResult.evidence.postFix?.browser.vite).toBeNull();
      expect(viteResult.warnings.join(" ")).toContain("Vite module graph snapshot unavailable");
      await vite.manager.close(viteSession.id);
    } finally {
      viteSnapshot.mockRestore();
    }
  });

  it("serializes Next inspection through the session lease and propagates cancellation", async () => {
    let observedSignal = false;
    const inspect = vi.spyOn(NextAdapter.prototype, "inspect").mockImplementation((_url, _inspection, context = {}) => new Promise((resolve, reject) => {
      observedSignal = Boolean(context.signal);
      const onAbort = () => reject(new WebDebugError("REQUEST_CANCELLED", "inspection cancelled"));
      if (context.signal?.aborted) onAbort();
      else context.signal?.addEventListener("abort", onAbort, { once: true });
      void resolve;
    }));
    const { manager } = managerFor([], { mode: "attach", targetId: "tab-1" });
    const session = await start(manager, { projectRoot: "fixtures/next" });
    const controller = new AbortController();
    try {
      const active = manager.inspectNext(session.id, { kind: "compileRoute", routeSpecifier: "/" }, { signal: controller.signal, deadline: 10_000 });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(observedSignal).toBe(true);
      await expect(manager.capture(session.id, false)).rejects.toMatchObject({ code: "SESSION_BUSY" });
      const cancelled = expect(active).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
      controller.abort();
      await cancelled;
      await expect(manager.inspectNext(session.id, { kind: "compileRoute", routeSpecifier: "/" })).rejects.toMatchObject({ code: "SESSION_UNUSABLE" });
    } finally {
      inspect.mockRestore();
      await manager.close(session.id);
    }
  });

  it("contains a timed-out optional Vite enrichment in a child budget", async () => {
    const viteSnapshot = vi.spyOn(ViteAdapter.prototype, "snapshot").mockImplementation(() => new Promise(() => undefined));
    vi.useFakeTimers();
    try {
      const vite = managerFor([snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Fixed"), snapshotFor("Fixed")], { mode: "attach", targetId: "tab-1" });
      const session = await start(vite.manager, { projectRoot: "fixtures/react-vite" });
      const recording = record(vite.manager, session.id);
      await vi.advanceTimersByTimeAsync(3_000);
      const scenario = await recording;
      const verifying = vite.manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id });
      await vi.advanceTimersByTimeAsync(3_000);
      const result = await verifying;
      expect(result.outcome).toBe("verified");
      expect(result.evidence.postFix?.browser.vite).toBeNull();
      expect(result.warnings.join(" ")).toContain("Vite module graph snapshot unavailable");
      await vite.manager.close(session.id);
    } finally {
      vi.useRealTimers();
      viteSnapshot.mockRestore();
    }
  });

  it("keeps private raw URL and fill values executable while every public response is scrubbed", async () => {
    const secret = "raw-secret-value";
    const selectSecret = "private-option-value";
    const raw = (body: string) => snapshotFor(`${body} ${secret}`, {
      elements: [{ tag: "div", id: secret, role: null, text: secret }],
      console: [{ level: "error", text: `details=${secret}` }],
      network: [{ requestId: secret, method: "GET", url: `http://127.0.0.1:4173/?token=${secret}`, resourceType: "fetch", status: 500, ok: false }],
      react: { detected: true, rendererCount: 1, commitCount: 1, commits: [], profiler: { mode: "devtools-hook", capped: false }, components: [{ name: "Secret", source: null, props: { nested: { value: secret } }, hooks: [], renderCount: 1, renderCause: "mount", propChanges: [], hookChanges: [], actualDurationMs: null, selfDurationMs: null, treeDurationMs: null, children: [] }], flamegraph: [], warnings: [secret] },
      angular: { detected: true, version: "21.2.22", mode: "development", treeMode: "dom-host", snapshotCount: 1, componentCount: 1, components: [{ name: "Secret", host: null, state: { token: secret }, sampleCount: 1, changedStateKeys: [], children: [] }], truncated: false, warnings: [secret] },
      vue: { detected: true, version: "3.5.42", appCount: 1, componentCount: 1, components: [{ name: "Secret", source: null, props: { token: secret }, state: { value: secret }, updateCount: 1, changedPropKeys: [], changedStateKeys: [], children: [] }], truncated: false, warnings: [secret] },
      screenshotPath: `/tmp/${secret}.png`,
      warnings: [`error details ${secret}`],
    });
    const { manager, adapters } = managerFor([raw("Bug"), raw("Bug"), raw("Fixed"), raw("Fixed")], { mode: "attach", targetId: "tab-1" });
    const session = await start(manager);
    const scenario = await record(manager, session.id, {
      url: `http://127.0.0.1:4173/?token=${secret}`,
      actions: [
        { kind: "fill", locator: { kind: "css", value: `#${secret}` }, value: secret },
        { kind: "select", locator: { kind: "css", value: "#private-option" }, value: selectSecret },
      ],
      buildReference: { source: "caller", value: secret },
    });
    const result = await manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id, buildReference: { source: "caller", value: secret } });
    expect(adapters[0]?.actions.some((action) => action.kind === "navigate" && action.url.includes(`token=${secret}`))).toBe(true);
    expect(adapters[0]?.actions.some((action) => action.kind === "fill" && action.value === secret)).toBe(true);
    expect(adapters[0]?.actions.some((action) => action.kind === "select" && action.value === selectSecret)).toBe(true);
    expect(scenario.url).toBe("http://127.0.0.1:4173/");
    expect(scenario.contractHash).not.toContain(secret);
    expect(JSON.stringify(scenario)).not.toContain(secret);
    expect(JSON.stringify(scenario)).not.toContain(selectSecret);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(selectSecret);
    expect(result.evidence.postFix?.browser.screenshotPath).toBeNull();
    const postFrameIndex = result.evidence.postFix?.replay.frames[0]?.index;
    expect(postFrameIndex).toBeTypeOf("number");
    expect(JSON.stringify(await manager.seekReplay(session.id, postFrameIndex!))).not.toContain(secret);
    await expect(manager.seekReplay(session.id, postFrameIndex!, true)).rejects.toMatchObject({ code: "REPLAY_RESTORE_UNAVAILABLE" });
    await manager.close(session.id);

    const errorManager = managerFor([], { mode: "attach", targetId: "tab-1", failAction: new WebDebugError("SCRIPTED_FAILURE", secret, { details: secret }) });
    const errorSession = await start(errorManager.manager);
    const error = await errorManager.manager.act(errorSession.id, { kind: "fill", locator: { kind: "css", value: "#secret" }, value: secret }).catch((value) => value) as Error & { details?: unknown };
    expect(error.message).not.toContain(secret);
    expect(JSON.stringify(error)).not.toContain(secret);
    await errorManager.manager.close(errorSession.id);
  });

  it("restores navigation-causing actions from the private session start and fails after start truncation", async () => {
    const { manager, adapters } = managerFor([snapshotFor("Dashboard")], {
      mode: "attach",
      targetId: "tab-1",
      navigateOnClickTo: "http://127.0.0.1:4173/dashboard",
    });
    const session = await start(manager, { url: "http://127.0.0.1:4173/login" });
    await manager.act(session.id, { kind: "click", locator: { kind: "css", value: "#login" } });
    const restored = await manager.seekReplay(session.id, 0, true);
    expect(restored.restored).toBe(true);
    expect(adapters[0]?.actions.slice(-2)).toEqual([
      { kind: "navigate", url: "http://127.0.0.1:4173/login" },
      { kind: "click", locator: { kind: "css", value: "#login" } },
    ]);

    for (let index = 0; index < 9; index += 1) await manager.act(session.id, { kind: "hover", locator: { kind: "css", value: `#item-${index}` } });
    const newest = (await manager.capture(session.id, false)).replay.frames.at(-1)!.index;
    await expect(manager.seekReplay(session.id, newest, true)).rejects.toMatchObject({ code: "REPLAY_START_UNAVAILABLE" });
    await manager.close(session.id, "delete");
  });

  it("caps scenarios, replay frames, observations, and serialized evidence, then purges on close", async () => {
    const manyActions = Array.from({ length: 12 }, (_, index) => ({ kind: "click" as const, locator: { kind: "css" as const, value: `#button-${index}` } }));
    const snapshots: SnapshotScript[] = [];
    for (let index = 0; index < 10; index += 1) snapshots.push(snapshotFor("Bug"), snapshotFor("Bug"));
    const { manager } = managerFor(snapshots, { mode: "attach", targetId: "tab-1" });
    const session = await start(manager);
    for (let index = 0; index < 10; index += 1) {
      await record(manager, session.id, { name: `scenario-${index}`, actions: index === 0 ? manyActions : [] });
    }
    expect((await manager.listScenarios(session.id))).toHaveLength(10);
    await expect(record(manager, session.id, { name: "too-many" })).rejects.toMatchObject({ code: "SCENARIO_LIMIT_REACHED" });
    const first = (await manager.listScenarios(session.id))[0];
    expect(first?.baseline.evidence?.replay.frames.length).toBeLessThanOrEqual(8);
    expect(first?.baseline.attempts[0]?.checks.every((check) => (check.observed?.length ?? 0) <= 500)).toBe(true);
    await manager.close(session.id);
    expect(() => manager.listScenarios(session.id)).toThrowError(/closed/);

    const bounded = managerFor([
      snapshotFor("Bug", { react: hugeReactSnapshot() }), snapshotFor("Bug", { react: hugeReactSnapshot() }),
      snapshotFor("Fixed", { react: hugeReactSnapshot() }), snapshotFor("Fixed", { react: hugeReactSnapshot() }),
    ], { mode: "attach", targetId: "tab-1" });
    const boundedSession = await start(bounded.manager);
    const boundedScenario = await record(bounded.manager, boundedSession.id);
    const boundedResult = await bounded.manager.verifyScenario({ sessionId: boundedSession.id, scenarioId: boundedScenario.id });
    expect(Buffer.byteLength(JSON.stringify(boundedResult))).toBeLessThanOrEqual(256 * 1024);
    expect(boundedResult.truncation.evidence).toBe(true);
    await bounded.manager.close(boundedSession.id);
  });

  it("destroys managed private state on close and bounds sanitized tombstones", async () => {
    const secret = "closed-session-secret";
    const { manager } = managerFor([], { mode: "attach", targetId: "tab-1" });
    const session = await start(manager, { url: `http://127.0.0.1:4173/?token=${secret}` });
    await manager.act(session.id, { kind: "fill", locator: { kind: "css", value: "#secret" }, value: secret });
    const internals = manager as unknown as {
      sessions: Map<string, unknown>;
      closedSessions: Map<string, unknown>;
    };
    expect(JSON.stringify(internals.sessions.get(session.id))).toContain(secret);

    const closed = await manager.close(session.id, "delete");
    expect(closed.status).toBe("closed");
    expect(closed.target).toBeNull();
    expect(closed.artifactState).toBe("deleted");
    expect(manager.list()).toEqual([]);
    expect(manager.status(session.id).status).toBe("closed");
    expect((await manager.close(session.id, "delete")).artifactState).toBe("deleted");
    expect(internals.sessions.has(session.id)).toBe(false);
    expect(JSON.stringify(internals.closedSessions.get(session.id))).not.toContain(secret);
    await expect(access(session.artifactDir)).rejects.toThrow();

    const ids: string[] = [];
    for (let index = 0; index < 33; index += 1) {
      const candidate = await start(manager);
      ids.push(candidate.id);
      await manager.close(candidate.id, "delete");
    }
    expect(internals.closedSessions.size).toBe(32);
    expect(() => manager.status(ids[0]!)).toThrowError(/Unknown debug session/);
    expect(manager.status(ids.at(-1)!).status).toBe("closed");
  });

  it("rolls back a short start whose final target URL exceeds the result boundary", async () => {
    const oversizedFinalUrl = `http://127.0.0.1:4173/?redirected=${"x".repeat(3_000)}`;
    const { manager, adapters } = managerFor([], { mode: "attach", targetId: "tab-1", finalStartUrl: oversizedFinalUrl });
    await expect(start(manager)).rejects.toMatchObject({ code: "URL_LIMIT_EXCEEDED" });
    expect(manager.list()).toEqual([]);
    expect(adapters[0]?.closeCount).toBe(1);
  });

  it("suppresses screenshot pixels after private fill or select input", async () => {
    const { manager, adapters } = managerFor([
      snapshotFor("Ready"),
      snapshotFor("Private value visible", { screenshotPath: "/tmp/private-input.png" }),
    ], { mode: "attach", targetId: "tab-1" });
    const session = await start(manager);
    await manager.act(session.id, { kind: "select", locator: { kind: "css", value: "#private" }, value: "private-option" });
    const evidence = await manager.capture(session.id, true);
    expect(evidence.browser.screenshotPath).toBeNull();
    expect(evidence.browser.warnings).toContainEqual(expect.stringContaining("private fill/select input values"));
    expect(adapters[0]?.snapshotOptions.at(-1)).toMatchObject({ captureScreenshot: false, suppressScreenshot: true });
    await manager.close(session.id, "delete");
  });

  it("deletes oversized screenshots and prunes retained session artifacts", async () => {
    const snapshots: SnapshotScript[] = [];
    const { manager } = managerFor(snapshots, { mode: "attach", targetId: "tab-1" });
    const session = await start(manager);

    const oversized = `${session.artifactDir}/screenshot-1.png`;
    await writeFile(oversized, Buffer.alloc(MAX_ARTIFACT_BYTES + 1));
    snapshots.push(snapshotFor("Oversized", { screenshotPath: oversized }));
    const rejected = await manager.capture(session.id, true);
    expect(rejected.browser.screenshotPath).toBeNull();
    expect(rejected.browser.warnings).toContainEqual(expect.stringContaining("per-file limit"));
    await expect(access(oversized)).rejects.toThrow();

    for (let index = 0; index < MAX_SESSION_SCREENSHOTS + 1; index += 1) {
      const path = `${session.artifactDir}/capture-${100 + index}.png`;
      await writeFile(path, Buffer.from(`capture-${index}`));
      snapshots.push(snapshotFor(`Capture ${index}`, { screenshotPath: path }));
      await manager.capture(session.id, true);
    }
    const retained = (await readdir(session.artifactDir)).filter((name) => name.endsWith(".png"));
    expect(retained).toHaveLength(MAX_SESSION_SCREENSHOTS);
    expect(retained).not.toContain("capture-100.png");

    const closed = await manager.close(session.id, "retain");
    expect(closed.artifactState).toBe("retained");
    expect((await readdir(session.artifactDir)).filter((name) => name.endsWith(".png"))).toHaveLength(MAX_SESSION_SCREENSHOTS);
    expect((await manager.close(session.id, "delete")).artifactState).toBe("deleted");
    await expect(access(session.artifactDir)).rejects.toThrow();
  });

  it("applies the screenshot quota to matrix representative captures", async () => {
    const snapshots: SnapshotScript[] = [
      snapshotFor("Bug"),
      async (options) => {
        const path = `${options.artifactDir}/screenshot-900.png`;
        await writeFile(path, Buffer.alloc(MAX_ARTIFACT_BYTES + 1));
        return snapshotFor("Bug", { screenshotPath: path });
      },
      snapshotFor("Healthy"),
    ];
    const { manager } = managerFor(snapshots, { isolated: true, mode: "launch" });
    const session = await start(manager);
    const scenario = await record(manager, session.id, {
      viewports: [
        { name: "desktop", width: 1_440, height: 900 },
        { name: "mobile", width: 390, height: 844 },
      ],
      failureViewports: ["desktop"],
    });
    expect(scenario.baseline.status).toBe("reproduced");
    expect(scenario.baseline.evidence?.browser.screenshotPath).toBeNull();
    expect(scenario.baseline.evidence?.browser.warnings).toContainEqual(expect.stringContaining("per-file limit"));
    expect((await readdir(session.artifactDir)).filter((name) => name.endsWith(".png"))).toEqual([]);
    await manager.close(session.id, "delete");
  });

  it("enforces the MCP fill-value bound for direct SessionManager callers", async () => {
    const { manager, adapters } = managerFor([], { mode: "attach", targetId: "tab-1" });
    const session = await start(manager);
    await expect(manager.act(session.id, {
      kind: "fill",
      locator: { kind: "css", value: "#input" },
      value: "x".repeat(10_001),
    })).rejects.toMatchObject({ code: "FILL_VALUE_INVALID" });
    expect(adapters[0]?.actions).toEqual([]);
    await manager.close(session.id, "delete");
  });

  it("recovers from a failed launch candidate and keeps cancellation from allowing a late operation", async () => {
    const candidates = managerFor([
      snapshotFor("Bug"), snapshotFor("Bug"), snapshotFor("Bug"),
      snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"), snapshotFor("Fixed"),
    ], { isolated: true, mode: "launch", failStart: (instance) => instance === 3 });
    const session = await start(candidates.manager);
    const scenario = await record(candidates.manager, session.id, { requestedLevel: "standard" });
    const result = await candidates.manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id });
    expect(result.outcome).toBe("inconclusive");
    expect(result.postFix.attempts[0]?.termination).toBe("retryable");
    expect(candidates.adapters[2]?.closeCount).toBe(1);
    expect((await candidates.manager.capture(session.id, false)).redaction.applied).toBe(true);
    await candidates.manager.close(session.id);

    const busy = managerFor([], { mode: "attach", targetId: "tab-1", hangActions: true }, () => 0, 0);
    const busySession = await start(busy.manager);
    const controller = new AbortController();
    const active = busy.manager.act(busySession.id, { kind: "click", locator: { kind: "css", value: "#hang" } }, { signal: controller.signal });
    await expect(busy.manager.capture(busySession.id, false)).rejects.toMatchObject({ code: "SESSION_BUSY" });
    const activeExpectation = expect(active).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
    controller.abort();
    await activeExpectation;
    await expect(busy.manager.act(busySession.id, { kind: "click", locator: { kind: "css", value: "#later" } })).rejects.toMatchObject({ code: "SESSION_UNUSABLE" });
    busy.adapters[0]?.releaseAction();
    await busy.manager.close(busySession.id);

    const closing = managerFor([], { mode: "attach", targetId: "tab-1", hangActions: true, hangClose: true }, () => 0, 0);
    const closingSession = await start(closing.manager);
    const late = closing.manager.act(closingSession.id, { kind: "click", locator: { kind: "css", value: "#late" } });
    const lateExpectation = expect(late).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
    const closed = await closing.manager.close(closingSession.id);
    expect(closed.status).toBe("closed");
    closing.adapters[0]?.releaseAction();
    await lateExpectation;
  });

  it("rejects mismatched attached target provenance before post-fix actions", async () => {
    const { manager, adapters } = managerFor([snapshotFor("Bug"), snapshotFor("Bug")], { mode: "attach", targetId: "tab-1" });
    const session = await start(manager);
    const scenario = await record(manager, session.id);
    const snapshotsBefore = adapters[0]?.snapshotCount;
    adapters[0]!.targetIdValue = "tab-2";
    const result = await manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id });
    expect(result.outcome).toBe("inconclusive");
    expect(result.termination).toBe("PROVENANCE_MISMATCH");
    expect(adapters[0]?.snapshotCount).toBe(snapshotsBefore);
    await manager.close(session.id);
  });
});
