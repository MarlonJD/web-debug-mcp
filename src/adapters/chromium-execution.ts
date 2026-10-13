import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import type { CDPSession } from "playwright-core";
import type { ActionResult, DiagnosticOptions, DiagnosticRequest, ExecutionDiagnostics, OperationContext } from "../domain/types.js";
import { WebDebugError } from "../core/errors.js";
import { remaining, throwIfCancelled } from "../core/operation-context.js";
import { boundText, safeUrl } from "../core/redaction.js";
import { ChromiumSources, cdpCommand, sourcePriority } from "./chromium-sources.js";

interface RequestRecord { value: DiagnosticRequest; frame: { scriptId: string; lineNumber: number; columnNumber: number } | null }

/** One explicitly selected action window; never enabled by scenario verification. */
export async function observeExecution(
  cdp: CDPSession, sources: ChromiumSources, frameId: string, origin: string,
  action: () => Promise<ActionResult>, options: DiagnosticOptions, context: OperationContext,
): Promise<ActionResult> {
  const settleMs = options.settleMs ?? 250;
  if (!Number.isInteger(settleMs) || settleMs < 0 || settleMs > 5000) throw new WebDebugError("DIAGNOSTIC_OPTIONS_INVALID", "settleMs must be an integer between 0 and 5000.");
  const generation = sources.generation();
  const requests = new Map<string, RequestRecord>();
  const excludedRequests = new Set<string>();
  const startedAt = new Date().toISOString();
  let start = performance.now();
  let armed = false;
  let truncated = false;
  let profilerEnabled = false;
  let coverageAttempted = false;
  let networkEnabled = false;
  const evidence: ExecutionDiagnostics = {
    schemaVersion: 1, actionId: randomUUID(), startedAt, durationMs: 0, association: "temporal-window",
    coverage: { state: options.coverage ? "unavailable" : "not-requested", backendStart: null, backendEnd: null, scripts: [] },
    requests: [], truncated: false, cleanup: "complete",
    warnings: ["Action associations are temporal, not proof of UI causality. Requests use local monotonic receipt times. Child frames and workers are excluded."],
  };
  if (options.coverage) evidence.warnings.push("Precise coverage changes JIT/timing. Counts are not chronological, nested ranges must not be summed, and absent scripts/branches are unknown. Verify the fix without coverage.");
  const request = (event: any) => {
    if (!armed || event.frameId !== frameId || typeof event.requestId !== "string" || !event.request || typeof event.request.url !== "string" || typeof event.request.method !== "string") return;
    if (excludedRequests.has(event.requestId)) return;
    if (requests.has(event.requestId)) {
      requests.delete(event.requestId);
      if (excludedRequests.size < 100) excludedRequests.add(event.requestId);
      truncated = true;
      return;
    }
    try { if (new URL(event.request.url).origin !== origin) return; } catch { return; }
    if (requests.size >= 30) { truncated = true; return; }
    // Redirect hops are not silently merged into the same request. Preserve uncertainty.
    const frame = event.initiator?.stack?.callFrames?.[0];
    const validFrame = frame && typeof frame.scriptId === "string" && Number.isInteger(frame.lineNumber) && Number.isInteger(frame.columnNumber) ? frame : null;
    requests.set(event.requestId, { frame: validFrame, value: {
      requestId: boundText(event.requestId, 100), method: boundText(event.request.method, 20), url: safeUrl(event.request.url), status: null,
      startMs: Math.max(0, performance.now() - start), endMs: null, initiator: null,
      initiatorType: boundText(event.initiator?.type ?? "unknown", 50), association: "unavailable",
    } });
  };
  const response = (event: any) => {
    const record = requests.get(event.requestId);
    if (armed && record && typeof event.response?.status === "number") record.value.status = event.response.status;
  };
  const finished = (event: any) => {
    const record = requests.get(event.requestId);
    if (armed && record) record.value.endMs = Math.max(0, performance.now() - start);
  };
  cdp.on("Network.requestWillBeSent", request);
  cdp.on("Network.responseReceived", response);
  cdp.on("Network.loadingFinished", finished);
  cdp.on("Network.loadingFailed", finished);
  let result: ActionResult;
  let sample: any = null;
  try {
    networkEnabled = true;
    await cdpCommand(cdp, "Network.enable", {}, context);
    if (options.coverage) {
      profilerEnabled = true;
      await cdpCommand(cdp, "Profiler.enable", {}, context);
      coverageAttempted = true;
      const started = await cdpCommand(cdp, "Profiler.startPreciseCoverage", { callCount: true, detailed: true, allowTriggeredUpdates: false }, context);
      evidence.coverage.backendStart = typeof started.timestamp === "number" ? started.timestamp : null;
    }
    start = performance.now();
    evidence.startedAt = new Date().toISOString();
    armed = true;
    result = await action();
    throwIfCancelled(context);
    if (settleMs > 0) {
      if (remaining(context) < settleMs) throw new WebDebugError("DIAGNOSTIC_TIMEOUT", "The diagnostic settling period exceeds the operation deadline.");
      await delay(settleMs, undefined, { signal: context.signal });
    }
    if (options.coverage) sample = await cdpCommand(cdp, "Profiler.takePreciseCoverage", {}, context);
    evidence.durationMs = performance.now() - start;
  } finally {
    armed = false;
    cdp.off("Network.requestWillBeSent", request);
    cdp.off("Network.responseReceived", response);
    cdp.off("Network.loadingFinished", finished);
    cdp.off("Network.loadingFailed", finished);
    // Cleanup gets a separate bound even after cancellation, including an uncertain start acknowledgement.
    const failures: string[] = [];
    for (const method of [ ...(coverageAttempted ? ["Profiler.stopPreciseCoverage"] : []), ...(profilerEnabled ? ["Profiler.disable"] : []), ...(networkEnabled ? ["Network.disable"] : []) ]) {
      try { await cdpCommand(cdp, method, {}, {}, 1000); } catch { failures.push(method); }
    }
    if (failures.length) throw new WebDebugError("DIAGNOSTIC_CLEANUP_FAILED", "Diagnostic instrumentation cleanup could not be confirmed; close this session.", { commands: failures });
  }
  if (generation !== sources.generation()) {
    evidence.coverage.state = options.coverage ? "unavailable" : "not-requested";
    evidence.warnings.push("The document or execution context changed during observation; coverage and source associations are unavailable.");
  } else {
    for (const record of requests.values()) {
      if (record.frame) record.value.initiator = await sources.location(record.frame.scriptId, record.frame.lineNumber, record.frame.columnNumber, context);
      if (record.value.initiator) record.value.association = "cdp-initiator";
    }
    if (options.coverage && Array.isArray(sample?.result)) {
      evidence.coverage.state = "collected";
      evidence.coverage.backendEnd = typeof sample.timestamp === "number" ? sample.timestamp : null;
      let rangeCount = 0;
      for (const script of [...sample.result].sort((a, b) => sourcePriority(sources.identity(a.scriptId)?.url ?? "") - sourcePriority(sources.identity(b.scriptId)?.url ?? ""))) {
        const identity = sources.identity(script.scriptId);
        if (!identity) continue;
        if (evidence.coverage.scripts.length >= 12) { truncated = true; break; }
        const functions: ExecutionDiagnostics["coverage"]["scripts"][number]["functions"] = [];
        if (!Array.isArray(script.functions)) { truncated = true; continue; }
        for (const fn of script.functions) {
          if (functions.length >= 12 || rangeCount >= 64) { truncated = true; break; }
          const ranges: typeof functions[number]["ranges"] = [];
          if (!Array.isArray(fn.ranges)) { truncated = true; continue; }
          for (const range of fn.ranges) {
            if (ranges.length >= 8 || rangeCount >= 64) { truncated = true; break; }
            if (![range.startOffset, range.endOffset, range.count].every((n) => Number.isSafeInteger(n) && n >= 0) || range.endOffset < range.startOffset) { truncated = true; continue; }
            let source = null;
            try { source = await sources.fromOffset(script.scriptId, range.startOffset, range.endOffset, context); } catch { /* source is optional; do not fabricate an offset mapping */ }
            ranges.push({ startOffset: range.startOffset, endOffset: range.endOffset, count: range.count, source });
            rangeCount++;
          }
          functions.push({ name: boundText(fn.functionName ?? "", 150), blockCoverage: fn.isBlockCoverage === true, ranges });
        }
        evidence.coverage.scripts.push({ ...identity, functions });
      }
    }
  }
  if (generation !== sources.generation()) {
    evidence.coverage.state = options.coverage ? "unavailable" : "not-requested";
    evidence.coverage.scripts = [];
    for (const record of requests.values()) { record.value.initiator = null; record.value.association = "unavailable"; }
  }
  evidence.requests = [...requests.values()].map((record) => record.value);
  evidence.truncated = truncated;
  while (Buffer.byteLength(JSON.stringify(evidence)) > 60 * 1024 && (evidence.requests.length || evidence.coverage.scripts.length)) {
    if (evidence.coverage.scripts.length) evidence.coverage.scripts.pop();
    else evidence.requests.pop();
    evidence.truncated = true;
  }
  if (evidence.truncated) evidence.warnings.push("Some producer evidence exceeded bounds or could not be represented. Missing evidence does not establish non-execution or equivalence.");
  return { ...result!, diagnostics: evidence };
}
