import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { ChromiumAdapter } from "../adapters/chromium.js";
import type { BrowserAdapter, BrowserAdapterFactory } from "../adapters/browser.js";
import { NextAdapter } from "../adapters/next.js";
import { ViteAdapter } from "../adapters/vite.js";
import type {
  ActionResult,
  BrowserAction,
  DebugSessionSummary,
  EvidenceBundle,
  ProjectDescriptor,
  NextSnapshot,
  ReproScenario,
  ScenarioCheck,
  VerificationResult,
} from "../domain/types.js";
import { detectProject } from "./capabilities.js";
import { WebDebugError } from "./errors.js";
import { composeEvidence } from "./evidence.js";

export interface StartSessionInput {
  projectRoot: string;
  url: string;
  cdpEndpoint?: string;
  executablePath?: string;
  headless?: boolean;
  allowRemote?: boolean;
}

export interface RecordScenarioInput {
  name: string;
  url: string;
  actions: BrowserAction[];
  checks: ScenarioCheck[];
}

interface ManagedSession {
  descriptor: ProjectDescriptor;
  summary: DebugSessionSummary;
  adapter: BrowserAdapter;
  nextAdapter: NextAdapter | null;
  viteAdapter: ViteAdapter | null;
}

const MAX_SESSIONS = 8;

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly scenarios = new Map<string, ReproScenario>();

  constructor(
    private readonly adapterFactory: BrowserAdapterFactory = () => new ChromiumAdapter(),
  ) {}

  detect(projectRoot: string): ProjectDescriptor {
    return detectProject(projectRoot);
  }

  async start(input: StartSessionInput): Promise<DebugSessionSummary> {
    if (this.activeSessionCount() >= MAX_SESSIONS) {
      throw new WebDebugError("SESSION_LIMIT_REACHED", `At most ${MAX_SESSIONS} sessions may be active.`);
    }

    const descriptor = detectProject(input.projectRoot);
    const id = randomUUID();
    const artifactDir = await mkdtemp(join(tmpdir(), "web-debug-mcp-"));
    const adapter = this.adapterFactory({ allowRemote: input.allowRemote });
    const summary: DebugSessionSummary = {
      id,
      projectRoot: descriptor.projectRoot,
      url: input.url,
      status: "starting",
      createdAt: new Date().toISOString(),
      artifactDir,
      target: null,
      capabilities: descriptor.capabilities,
      warnings: [...descriptor.warnings],
    };
    const managed: ManagedSession = {
      descriptor,
      summary,
      adapter,
      nextAdapter: descriptor.capabilities.next ? new NextAdapter() : null,
      viteAdapter: descriptor.capabilities.vite ? new ViteAdapter() : null,
    };
    this.sessions.set(id, managed);

    try {
      const target = await adapter.start({
        url: input.url,
        cdpEndpoint: input.cdpEndpoint,
        executablePath: input.executablePath,
        headless: input.headless,
        allowRemote: input.allowRemote,
      });
      summary.status = "ready";
      summary.target = target;
      summary.url = target.url;
      if (!target.isolated) summary.warnings.push("The session is attached to an external browser profile.");
      return { ...summary };
    } catch (error) {
      summary.status = "failed";
      await adapter.close().catch(() => undefined);
      this.sessions.delete(id);
      throw error;
    }
  }

  list(): DebugSessionSummary[] {
    return [...this.sessions.values()].map(({ summary }) => ({ ...summary }));
  }

  status(sessionId: string): DebugSessionSummary {
    return { ...this.requireSession(sessionId).summary };
  }

  async act(sessionId: string, action: BrowserAction): Promise<ActionResult> {
    const session = this.requireSession(sessionId);
    const result = await session.adapter.act(action);
    session.summary.url = result.url;
    if (session.summary.target) {
      session.summary.target = {
        ...session.summary.target,
        url: result.url,
        title: result.title,
      };
    }
    return result;
  }

  async capture(sessionId: string, captureScreenshot = true): Promise<EvidenceBundle> {
    const session = this.requireSession(sessionId);
    const browser = await session.adapter.snapshot({
      artifactDir: session.summary.artifactDir,
      captureScreenshot,
    });
    let next: NextSnapshot | null = null;
    if (session.nextAdapter) {
      try {
        next = await session.nextAdapter.snapshot(browser.url, session.descriptor.projectRoot);
      } catch (error) {
        session.summary.warnings = mergeWarnings(session.summary.warnings, [
          `Next runtime snapshot unavailable: ${error instanceof Error ? error.message : String(error)}`,
        ]);
      }
      if (session.descriptor.capabilities.next && next === null) {
        session.summary.warnings = mergeWarnings(session.summary.warnings, [
          "Next was detected but its local /_next/mcp endpoint did not return a runtime snapshot.",
        ]);
      }
      if (next?.warnings) session.summary.warnings = mergeWarnings(session.summary.warnings, next.warnings);
    }
    let vite = null;
    if (session.viteAdapter) {
      try {
        vite = await session.viteAdapter.snapshot(browser.url);
      } catch (error) {
        session.summary.warnings = mergeWarnings(session.summary.warnings, [
          `Vite module graph snapshot unavailable: ${error instanceof Error ? error.message : String(error)}`,
        ]);
      }
      if (session.descriptor.capabilities.vite && vite === null) {
        session.summary.warnings = mergeWarnings(session.summary.warnings, [
          "Vite was detected but the web-debug Vite plugin endpoint did not return a module snapshot.",
        ]);
      }
    }
    const combinedBrowser = { ...browser, next, vite };
    session.summary.url = browser.url;
    session.summary.status = browser.debugger.paused ? "paused" : "ready";
    session.summary.target = {
      url: browser.url,
      title: browser.title,
      viewport: browser.viewport,
      isolated: session.summary.target?.isolated ?? false,
    };
    session.summary.warnings = mergeWarnings(session.summary.warnings, browser.warnings);
    if (session.descriptor.capabilities.react && combinedBrowser.react === null) {
      session.summary.warnings = mergeWarnings(session.summary.warnings, [
        "React was detected but the injected web-debug React bridge was not found.",
      ]);
    }
    return composeEvidence(session.descriptor, session.summary, combinedBrowser);
  }

  async setBreakpoint(
    sessionId: string,
    input: { sourceUrl: string; line: number; column?: number },
  ) {
    return this.requireSession(sessionId).adapter.setBreakpoint(input);
  }

  async control(sessionId: string, action: "resume" | "stepOver" | "stepInto" | "stepOut") {
    const session = this.requireSession(sessionId);
    const snapshot = await session.adapter.control(action);
    session.summary.status = snapshot.paused ? "paused" : "ready";
    return snapshot;
  }

  async evaluate(sessionId: string, expression: string, allowSideEffects: boolean) {
    return this.requireSession(sessionId).adapter.evaluate(expression, allowSideEffects);
  }

  recordScenario(input: RecordScenarioInput): ReproScenario {
    if (!input.name.trim()) throw new WebDebugError("SCENARIO_NAME_EMPTY", "Scenario name cannot be empty.");
    const scenario: ReproScenario = {
      id: randomUUID(),
      name: input.name.trim(),
      url: input.url,
      actions: input.actions,
      checks: input.checks,
      createdAt: new Date().toISOString(),
    };
    this.scenarios.set(scenario.id, scenario);
    return scenario;
  }

  listScenarios(): ReproScenario[] {
    return [...this.scenarios.values()].map((scenario) => ({
      ...scenario,
      actions: [...scenario.actions],
      checks: [...scenario.checks],
    }));
  }

  async verifyScenario(sessionId: string, scenarioId: string): Promise<VerificationResult> {
    const session = this.requireSession(sessionId);
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) throw new WebDebugError("SCENARIO_NOT_FOUND", `Unknown scenario: ${scenarioId}`);

    await this.act(sessionId, { kind: "navigate", url: scenario.url });
    for (const action of scenario.actions) await this.act(sessionId, action);
    const evidence = await this.capture(sessionId, true);
    const checks = scenario.checks.map((check) => evaluateCheck(check, evidence));
    return {
      scenario: { ...scenario, actions: [...scenario.actions], checks: [...scenario.checks] },
      passed: checks.every((check) => check.passed),
      checks,
      evidence,
    };
  }

  async close(sessionId: string): Promise<DebugSessionSummary> {
    const session = this.requireSession(sessionId);
    await session.adapter.close();
    session.summary.status = "closed";
    return { ...session.summary };
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((session) => session.adapter.close().catch(() => undefined)));
  }

  private requireSession(sessionId: string): ManagedSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new WebDebugError("SESSION_NOT_FOUND", `Unknown debug session: ${sessionId}`);
    if (session.summary.status === "closed") {
      throw new WebDebugError("SESSION_CLOSED", `Debug session is closed: ${sessionId}`);
    }
    return session;
  }

  private activeSessionCount(): number {
    return [...this.sessions.values()].filter(({ summary }) => summary.status !== "closed").length;
  }
}

function mergeWarnings(existing: string[], additions: string[]): string[] {
  return [...new Set([...existing, ...additions])];
}

function evaluateCheck(
  check: ScenarioCheck,
  evidence: EvidenceBundle,
): ScenarioCheck & { passed: boolean; observed?: string } {
  if (check.kind === "urlContains") {
    const observed = evidence.browser.url;
    return { ...check, passed: check.value ? observed.includes(check.value) : false, observed };
  }
  if (check.kind === "textContains") {
    const observed = evidence.browser.dom.bodyText;
    return { ...check, passed: check.value ? observed.includes(check.value) : false, observed: observed.slice(0, 500) };
  }
  const errorCount = evidence.browser.console.filter((entry) => entry.level === "error" || entry.level === "pageerror").length;
  return { ...check, passed: errorCount === 0, observed: `${errorCount} console error(s)` };
}
