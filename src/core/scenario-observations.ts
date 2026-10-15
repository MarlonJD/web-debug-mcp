import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import type { BrowserAdapter } from "../adapters/browser.js";
import type { BrowserSnapshot, CheckObservation, OperationContext, ScenarioCheck, ScenarioCompletion, CompletionObservation } from "../domain/types.js";
import { throwIfCancelled } from "./operation-context.js";
import { boundText } from "./redaction.js";

export async function evaluateExtendedCheck(adapter: BrowserAdapter, check: ScenarioCheck, browser: BrowserSnapshot, context: OperationContext): Promise<CheckObservation | null> {
  const result = (state: CheckObservation["state"], observed?: string, warning?: string): CheckObservation => ({
    ...check, state, freshness: "fresh", provenance: "browser", ...(observed !== undefined ? { observed: boundText(observed, 500) } : {}), ...(warning ? { warning } : {}),
  });
  if (check.kind === "networkResponse" || check.kind === "networkComplete") {
    const source = browser.observations?.network;
    if (!source || source.state === "unavailable" || source.freshness !== "fresh") return { ...result("unavailable", undefined, "Fresh network collection is unavailable."), freshness: source?.freshness ?? "unknown", provenance: source?.provenance ?? "unknown" };
    if (browser.warnings.some(warning => /network.*truncat/i.test(warning))) return result("unavailable", undefined, "Truncated network history cannot establish a complete response contract.");
    const matching = browser.network.filter(entry => {
      try { const entryUrl = new URL(entry.url); return entryUrl.origin === new URL(browser.url).origin && entryUrl.pathname === check.path && entry.method === check.method; } catch { return false; }
    });
    const observed = JSON.stringify({ count: matching.length, completed: matching.filter(entry => entry.completed === true).length, statuses: [...new Set(matching.map(entry => entry.status))] });
    if (check.kind === "networkComplete" && matching.some(entry => entry.completed === undefined)) return { ...result("unavailable", observed, "Request-completion telemetry is unavailable for this transport."), provenance: source.provenance };
    if (check.kind === "networkResponse" && matching.some(entry => entry.status === null && !entry.failure)) return { ...result("unavailable", observed, "Response metadata is still pending."), provenance: source.provenance };
    const pass = matching.length >= (check.minimumCount ?? 1) && matching.every(entry => check.kind === "networkComplete" ? entry.completed === true : entry.status === check.status);
    return { ...result(pass ? "pass" : "fail", observed), provenance: source.provenance };
  }
  if (check.kind !== "locatorInViewport" && check.kind !== "locatorUnobstructed" && check.kind !== "locatorNumber") return null;
  if (browser.observations?.dom && (browser.observations.dom.state === "unavailable" || browser.observations.dom.freshness !== "fresh")) return result("unavailable", undefined, "Fresh DOM observation is unavailable.");
  if (check.kind === "locatorNumber") {
    const probe = await adapter.probe(check.locator, ["count", "text"], context);
    if (probe.count === 0) return result("fail", "Locator count=0.");
    if (probe.count !== 1) return result("unavailable", undefined, "Numeric checks require exactly one matching element.");
    const text = probe.text?.trim();
    if (!text || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(Number(text))) return result("unavailable", text ?? undefined, "Numeric checks require finite decimal text; localized/currency text is not guessed.");
    const number = Number(text);
    return { ...result(Math.abs(number - check.value) <= (check.tolerance ?? 0) ? "pass" : "fail", JSON.stringify({ actual: number, expected: check.value, tolerance: check.tolerance ?? 0 })), provenance: probe.provenance };
  }
  if (!adapter.layout) return result("unavailable", undefined, "Layout checks are unavailable for this transport.");
  const layout = await adapter.layout(check.locator, context);
  if (layout.count > 1) return result("unavailable", JSON.stringify(layout), "Layout checks require one unambiguous element.");
  const pass = check.kind === "locatorInViewport" ? layout.inViewport === check.inViewport : layout.unobstructed === check.unobstructed;
  return result(pass ? "pass" : "fail", JSON.stringify(layout));
}

/** Poll declared observations. The elapsed-time bound never supplies a passing observation. */
export async function awaitScenarioCompletion(
  completion: ScenarioCompletion,
  observe: () => Promise<BrowserSnapshot>,
  evaluate: (check: ScenarioCheck, browser: BrowserSnapshot) => Promise<CheckObservation>,
  context: OperationContext,
): Promise<{ browser: BrowserSnapshot; completion: CompletionObservation }> {
  const started = performance.now();
  const stableForMs = completion.stableForMs ?? 50;
  let stableSince = started;
  let previous = "";
  let browser: BrowserSnapshot;
  let checks: CheckObservation[];
  while (true) {
    throwIfCancelled(context);
    browser = await observe();
    checks = await Promise.all(completion.checks.map(check => evaluate(check, browser)));
    const elapsedMs = Math.round(performance.now() - started);
    const ready = checks.every(check => check.state === "pass" && check.freshness === "fresh");
    const digest = ready ? JSON.stringify(checks.map(check => [check.state, check.observed, check.provenance])) : "";
    if (!ready || digest !== previous) stableSince = performance.now();
    previous = digest;
    const state = ready && performance.now() - stableSince >= stableForMs ? "ready"
      : checks.some(check => check.warning?.includes("unavailable for this transport")) ? "unavailable"
      : elapsedMs >= completion.timeoutMs ? "timed-out" : null;
    if (state) return { browser, completion: { state, checks, elapsedMs, stableForMs } };
    await delay(Math.min(25, Math.max(1, completion.timeoutMs - elapsedMs)), undefined, { signal: context.signal });
  }
}
