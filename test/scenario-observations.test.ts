import { describe, expect, it } from "vitest";
import type { BrowserAdapter } from "../src/adapters/browser.js";
import type { BrowserSnapshot, LocatorLayout } from "../src/domain/types.js";
import { awaitScenarioCompletion } from "../src/core/scenario-observations.js";
import { evaluateCheckLive } from "../src/core/scenario-verification.js";

const locator = { kind: "css" as const, value: "#value" };
function browser(completed = false): BrowserSnapshot {
  return {
    url: "http://127.0.0.1:4173/", title: "Fixture", viewport: { width: 390, height: 844 }, dom: { bodyText: "", elements: [] },
    console: [], warnings: [], screenshotPath: null, debugger: { paused: false, reason: null, callFrames: [], breakpoints: [] },
    react: null, angular: null, vue: null, next: null, vite: null, webmcp: null,
    network: [{ requestId: "r1", method: "GET", url: "http://127.0.0.1:4173/result", resourceType: "fetch", status: 200, ok: true, completed }],
    observations: { url: { state: "pass", freshness: "fresh", provenance: "browser" }, dom: { state: "pass", freshness: "fresh", provenance: "browser" }, console: { state: "pass", freshness: "fresh", provenance: "browser" }, network: { state: "pass", freshness: "fresh", provenance: "browser" } },
  };
}
function adapter(text = "12.34", count = 1, layout?: LocatorLayout): BrowserAdapter {
  return { probe: async () => ({ locator, count, text, properties: ["count", "text"], observedAt: "now", provenance: "browser", warnings: [] }), ...(layout ? { layout: async () => layout } : {}) } as unknown as BrowserAdapter;
}

describe("typed scenario observations", () => {
  it("distinguishes offscreen, obstructed and ambiguous geometry from visibility", async () => {
    const layout = { count: 1, rect: { x: 0, y: 800, width: 100, height: 40 }, viewport: { width: 390, height: 844 }, inViewport: true, unobstructed: false };
    expect(await evaluateCheckLive(adapter("", 1, layout), { kind: "locatorUnobstructed", locator, unobstructed: true }, browser(), {})).toMatchObject({ state: "fail" });
    expect(await evaluateCheckLive(adapter("", 1, { ...layout, inViewport: false }), { kind: "locatorInViewport", locator, inViewport: true }, browser(), {})).toMatchObject({ state: "fail" });
    expect(await evaluateCheckLive(adapter("", 2, { ...layout, count: 2 }), { kind: "locatorInViewport", locator, inViewport: true }, browser(), {})).toMatchObject({ state: "unavailable" });
    expect(await evaluateCheckLive(adapter(), { kind: "locatorInViewport", locator, inViewport: true }, browser(), {})).toMatchObject({ state: "unavailable" });
  });

  it.each(["", "₺12.34", "12,34", "Infinity", "0x10"])("keeps unparseable numeric text %j unavailable", async (text) => {
    expect(await evaluateCheckLive(adapter(text), { kind: "locatorNumber", locator, value: 12.34 }, browser(), {})).toMatchObject({ state: "unavailable" });
  });

  it("uses exact finite numeric observations and an explicit tolerance", async () => {
    expect(await evaluateCheckLive(adapter(), { kind: "locatorNumber", locator, value: 12.34 }, browser(), {})).toMatchObject({ state: "pass", observed: '{"actual":12.34,"expected":12.34,"tolerance":0}' });
    expect(await evaluateCheckLive(adapter("12"), { kind: "locatorNumber", locator, value: 12.34 }, browser(), {})).toMatchObject({ state: "fail" });
    expect(await evaluateCheckLive(adapter("12.345"), { kind: "locatorNumber", locator, value: 12.34, tolerance: .01 }, browser(), {})).toMatchObject({ state: "pass" });
    expect(await evaluateCheckLive(adapter("12.34", 2), { kind: "locatorNumber", locator, value: 12.34 }, browser(), {})).toMatchObject({ state: "unavailable" });
  });

  it("does not confuse response headers, completed bodies, failed requests and missing telemetry", async () => {
    const response = { kind: "networkResponse" as const, path: "/result", method: "GET", status: 200 };
    const complete = { kind: "networkComplete" as const, path: "/result", method: "GET" };
    expect(await evaluateCheckLive(adapter(), response, browser(false), {})).toMatchObject({ state: "pass" });
    expect(await evaluateCheckLive(adapter(), complete, browser(false), {})).toMatchObject({ state: "fail" });
    expect(await evaluateCheckLive(adapter(), complete, browser(true), {})).toMatchObject({ state: "pass" });
    const missing = browser(true); delete missing.network[0]!.completed;
    expect(await evaluateCheckLive(adapter(), complete, missing, {})).toMatchObject({ state: "unavailable" });
    const failed = browser(true); Object.assign(failed.network[0]!, { status: null, ok: false, failure: "net::ERR_FAILED" });
    expect(await evaluateCheckLive(adapter(), complete, failed, {})).toMatchObject({ state: "pass" });
    expect(await evaluateCheckLive(adapter(), response, failed, {})).toMatchObject({ state: "fail" });
    const truncated = browser(true); truncated.warnings.push("Network entries were truncated to 100 items.");
    expect(await evaluateCheckLive(adapter(), response, truncated, {})).toMatchObject({ state: "unavailable" });
    const otherOrigin = browser(true); otherOrigin.network[0]!.url = "http://other.test/result";
    expect(await evaluateCheckLive(adapter(), response, otherOrigin, {})).toMatchObject({ state: "fail" });
  });

  it("waits for declared observations rather than assuming a finished response from elapsed time", async () => {
    let observations = 0;
    const result = await awaitScenarioCompletion({ checks: [{ kind: "networkComplete", method: "GET", path: "/result" }], timeoutMs: 200, stableForMs: 0 }, async () => browser(++observations >= 3), (check, value) => evaluateCheckLive(adapter(), check, value, {}), {});
    expect(observations).toBe(3);
    expect(result.completion).toMatchObject({ state: "ready", checks: [{ state: "pass" }] });
    const timeout = await awaitScenarioCompletion({ checks: [{ kind: "networkComplete", method: "GET", path: "/result" }], timeoutMs: 30, stableForMs: 0 }, async () => browser(false), (check, value) => evaluateCheckLive(adapter(), check, value, {}), {});
    expect(timeout.completion).toMatchObject({ state: "timed-out", checks: [{ state: "fail" }] });
  });
});
