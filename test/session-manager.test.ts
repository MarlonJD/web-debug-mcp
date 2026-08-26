import { describe, expect, it } from "vitest";

import type {
  ActionResult,
  BrowserAction,
  BrowserSnapshot,
  BrowserTarget,
  DebuggerBreakpoint,
  DebuggerSnapshot,
} from "../src/domain/types.js";
import type { BrowserAdapter, BrowserStartOptions, EvaluationResult, SnapshotOptions } from "../src/adapters/browser.js";
import { SessionManager } from "../src/core/session-manager.js";

class FakeBrowserAdapter implements BrowserAdapter {
  private target: BrowserTarget = {
    url: "http://127.0.0.1:4173/",
    title: "Fixture",
    viewport: { width: 1440, height: 900 },
    isolated: true,
  };

  async start(options: BrowserStartOptions): Promise<BrowserTarget> {
    this.target = { ...this.target, url: options.url };
    return this.target;
  }

  async close(): Promise<void> {}

  async act(action: BrowserAction): Promise<ActionResult> {
    if (action.kind === "navigate") this.target.url = action.url;
    return { kind: action.kind, url: this.target.url, title: this.target.title };
  }

  async snapshot(_options: SnapshotOptions): Promise<BrowserSnapshot> {
    return {
      url: this.target.url,
      title: this.target.title,
      viewport: this.target.viewport,
      dom: {
        bodyText: "Checkout fixture Payment submitted: 249.90",
        elements: [{ tag: "p", id: "status", role: "status", text: "Payment submitted: 249.90" }],
      },
      console: [],
      network: [],
      screenshotPath: null,
      debugger: { paused: false, reason: null, callFrames: [], breakpoints: [] },
      react: null,
      warnings: [],
    };
  }

  async setBreakpoint(input: { sourceUrl: string; line: number; column?: number }): Promise<DebuggerBreakpoint> {
    return { id: "fake-breakpoint", sourceUrl: input.sourceUrl, line: input.line, column: input.column ?? null };
  }

  async control(_action: "resume" | "stepOver" | "stepInto" | "stepOut"): Promise<DebuggerSnapshot> {
    return { paused: false, reason: null, callFrames: [], breakpoints: [] };
  }

  async evaluate(_expression: string, _allowSideEffects: boolean): Promise<EvaluationResult> {
    return { value: 42, type: "number", description: null };
  }
}

describe("session manager", () => {
  it("owns a session, captures bounded evidence, and verifies a scenario", async () => {
    const manager = new SessionManager(() => new FakeBrowserAdapter());
    const session = await manager.start({ projectRoot: "fixtures/vanilla", url: "http://127.0.0.1:4173/" });
    expect(session.status).toBe("ready");
    expect(session.capabilities.browser).toBe(true);

    const scenario = manager.recordScenario({
      name: "submit payment",
      url: "http://127.0.0.1:4173/",
      actions: [{ kind: "click", selector: "#submit" }],
      checks: [
        { kind: "textContains", value: "Payment submitted" },
        { kind: "noConsoleErrors" },
      ],
    });
    const result = await manager.verifyScenario(session.id, scenario.id);
    expect(result.passed).toBe(true);
    expect(result.evidence.redaction.applied).toBe(true);

    const closed = await manager.close(session.id);
    expect(closed.status).toBe("closed");
  });
});
