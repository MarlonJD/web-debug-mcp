import { describe, expect, it } from "vitest";
import { summarizeBehavior, compareBehavior } from "../src/core/behavior-difference.js";
import { behaviorDifferenceSchema } from "../src/domain/diagnostic-schemas.js";
import type { BrowserSnapshot } from "../src/domain/types.js";

function browser(changes: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
  return { url: "http://127.0.0.1:4173/", title: "fixture", viewport: null, dom: { bodyText: "", elements: [] }, console: [], network: [], screenshotPath: null,
    debugger: { paused: false, reason: null, callFrames: [], breakpoints: [] }, react: null, angular: null, vue: null, next: null, vite: null, warnings: [], webmcp: null, interactiveElements: null, ...changes };
}
describe("explanatory behavioral differences", () => {
  it("reports errors and endpoint counts without producing a fix verdict", () => {
    const before = browser({ console: [{ level: "error", text: "old failure" }], network: [{ requestId: "old-id", method: "GET", url: "/api", status: 500, ok: false, resourceType: "fetch" }] });
    const after = browser({ console: [{ level: "error", text: "new failure" }], network: [{ requestId: "new-id", method: "GET", url: "/api", status: 200, ok: true, resourceType: "fetch" }] });
    const result = compareBehavior(summarizeBehavior(before), summarizeBehavior(after));
    expect(behaviorDifferenceSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({ diagnosticOnly: true, console: { added: ["new failure"], removed: ["old failure"] }, requests: [{ key: "GET /api", before: 1, after: 1, failedBefore: 1, failedAfter: 0 }], execution: null });
    expect(result).not.toHaveProperty("outcome");
  });
  it("leaves missing evidence and missing coverage explicitly unknown", () => {
    expect(compareBehavior(null, summarizeBehavior(browser()))).toMatchObject({ state: "unavailable", execution: null });
    expect(compareBehavior(summarizeBehavior(browser()), summarizeBehavior(browser())).warnings.join(" ")).toContain("Execution comparison unavailable");
  });
  it("bounds repeated evidence and reports truncation instead of equivalence", () => {
    const summary = summarizeBehavior(browser({ console: Array.from({ length: 40 }, (_, i) => ({ level: "error", text: `${i}:${"x".repeat(500)}` })) }));
    expect(summary.consoleErrors).toHaveLength(20);
    expect(summary.consoleErrors.every((text) => text.length <= 300)).toBe(true);
    expect(compareBehavior(summary, summary).truncated).toBe(true);
  });
  it("handles depth-pruned runtime trees without fabricating changed keys", () => {
    const react = { detected: true, commitCount: 2, components: ["[TRUNCATED_OBJECT]"], commits: [], rendererCount: 1, flamegraph: [], profiler: { mode: "devtools-hook", capped: true }, warnings: [] } as unknown as NonNullable<BrowserSnapshot["react"]>;
    expect(summarizeBehavior(browser({ react }))).toMatchObject({ react: { commits: 2, changedKeys: [] }, truncated: true });
  });
  it("respects the selected delta surfaces", () => {
    const before = summarizeBehavior(browser({ console: [{ level: "error", text: "private console observation" }] }));
    const result = compareBehavior(before, summarizeBehavior(browser()), ["dom"]);
    expect(result.console).toEqual({ added: [], removed: [] });
    expect(JSON.stringify(result)).not.toContain("private console observation");
  });
  it("retains pending requests separately from failures", () => {
    const pending = summarizeBehavior(browser({ network: [{ requestId: "r", method: "GET", url: "/api", status: null, ok: null, resourceType: "fetch" }] }));
    expect(compareBehavior(summarizeBehavior(browser()), pending).requests[0]).toMatchObject({ failedAfter: 0, pendingAfter: 1 });
  });
});
