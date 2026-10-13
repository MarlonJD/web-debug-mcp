import type { BehaviorDifference, BehaviorSummary, BrowserSnapshot, CaptureSurface } from "../domain/types.js";
import { boundText } from "./redaction.js";

const LIMIT = 20;
/** Only bounded, already-redacted observations. This summary cannot authorize a verification verdict. */
export function summarizeBehavior(browser: BrowserSnapshot): BehaviorSummary {
  const errors = [...new Set(browser.console.filter((item) => item.level === "error" || item.level === "pageerror").map((item) => boundText(item.text, 300)))];
  const requests = new Map<string, BehaviorSummary["requests"][number]>();
  for (const item of browser.network) {
    const key = boundText(`${item.method} ${item.url}`, 300);
    const record = requests.get(key) ?? { key, count: 0, failed: 0, pending: 0 };
    record.count++;
    if (item.ok === false || item.failure || (item.status !== null && item.status >= 400)) record.failed++;
    else if (item.status === null) record.pending++;
    requests.set(key, record);
  }
  const changedKeys: string[] = [];
  let incompleteTree = false;
  function visit(nodes: unknown, depth = 0): void {
    if (!Array.isArray(nodes)) { incompleteTree = true; return; }
    if (depth > 10 || changedKeys.length > LIMIT) { incompleteTree = true; return; }
    for (const node of nodes.slice(0, LIMIT)) {
      if (!node || typeof node !== "object" || typeof node.name !== "string" || !Array.isArray(node.propChanges) || !Array.isArray(node.hookChanges)) { incompleteTree = true; continue; }
      changedKeys.push(...node.propChanges.slice(0, 10).filter((key: unknown) => typeof key === "string").map((key: string) => boundText(`${node.name}.props.${key}`, 300)), ...node.hookChanges.slice(0, 10).filter((key: unknown) => typeof key === "number").map((key: number) => boundText(`${node.name}.hook[${key}]`, 300)));
      visit(node.children, depth + 1);
      if (changedKeys.length > LIMIT) break;
    }
    if (nodes.length > LIMIT) incompleteTree = true;
  }
  if (browser.react) visit(browser.react.components);
  const execution = browser.execution?.coverage.state === "collected" ? [...new Set(browser.execution.coverage.scripts.flatMap((script) => script.functions.flatMap((fn) => fn.ranges.filter((range) => range.count > 0).map((range) => {
    const location = range.source?.original ?? range.source?.generated;
    return boundText(location ? `${location.url}:${location.line}:${location.column}` : `${script.url}#${script.hash ?? "unknown"}:${range.startOffset}-${range.endOffset}`, 300);
  }))))] : null;
  return {
    consoleErrors: errors.slice(0, LIMIT), requests: [...requests.values()].slice(0, LIMIT),
    react: browser.react ? { commits: browser.react.commitCount, changedKeys: [...new Set(changedKeys)].slice(0, LIMIT) } : null,
    execution: execution?.slice(0, LIMIT) ?? null,
    requestCompletionOrder: browser.execution ? browser.execution.requests.filter((item) => item.endMs !== null).sort((a, b) => a.endMs! - b.endMs!).slice(0, LIMIT).map((item) => boundText(`${item.method} ${item.url}`, 300)) : null,
    truncated: incompleteTree || errors.length > LIMIT || requests.size > LIMIT || changedKeys.length > LIMIT || (execution?.length ?? 0) > LIMIT || browser.execution?.truncated === true || browser.warnings.some((warning) => /truncat|prun|stale|unavailable/i.test(warning)),
  };
}

export function compareBehavior(before: BehaviorSummary | null, after: BehaviorSummary | null, surfaces: readonly CaptureSurface[] = ["console", "network", "react", "execution"]): BehaviorDifference {
  const base: BehaviorDifference = {
    schemaVersion: 1, diagnosticOnly: true, state: before && after ? "compared" : "unavailable",
    console: { added: [], removed: [] }, requests: [], react: null, execution: null,
    requestCompletionOrder: null,
    truncated: Boolean(before?.truncated || after?.truncated),
    warnings: ["Differences describe retained observations, not causality or proof of a fix. Missing events do not establish equivalence."],
  };
  if (!before || !after) return base;
  if (surfaces.includes("console")) base.console = setDifference(before.consoleErrors, after.consoleErrors);
  const keys = [...new Set([...before.requests, ...after.requests].map((item) => item.key))];
  base.requests = (surfaces.includes("network") ? keys : []).flatMap((key) => {
    const a = before.requests.find((item) => item.key === key);
    const b = after.requests.find((item) => item.key === key);
    if (a?.count === b?.count && a?.failed === b?.failed && a?.pending === b?.pending) return [];
    return [{ key, before: a?.count ?? 0, after: b?.count ?? 0, failedBefore: a?.failed ?? 0, failedAfter: b?.failed ?? 0, pendingBefore: a?.pending ?? 0, pendingAfter: b?.pending ?? 0 }];
  });
  if (base.requests.length > LIMIT) { base.requests = base.requests.slice(0, LIMIT); base.truncated = true; }
  if (surfaces.includes("react") && before.react && after.react) {
    const keys = setDifference(before.react.changedKeys, after.react.changedKeys);
    base.react = { commitsBefore: before.react.commits, commitsAfter: after.react.commits, addedKeys: keys.added, removedKeys: keys.removed };
  }
  if (surfaces.includes("execution") && before.execution && after.execution) base.execution = setDifference(before.execution, after.execution);
  else if (surfaces.includes("execution")) base.warnings.push("Execution comparison unavailable: both observations must contain coverage. Verification does not enable coverage.");
  if (base.truncated) base.warnings.push("At least one observation is incomplete, stale, or truncated; additions/removals apply only to retained data.");
  if (surfaces.includes("execution") && before.requestCompletionOrder && after.requestCompletionOrder) base.requestCompletionOrder = { before: before.requestCompletionOrder, after: after.requestCompletionOrder };
  return base;
}
function setDifference(before: string[], after: string[]) {
  return { added: after.filter((item) => !before.includes(item)).slice(0, LIMIT), removed: before.filter((item) => !after.includes(item)).slice(0, LIMIT) };
}
