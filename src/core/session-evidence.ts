import { createHash, randomUUID } from "node:crypto";

import type {
  CaptureDetails,
  CaptureSurface,
  CaptureSummary,
  CaptureView,
  ReplayableBrowserAction,
  BrowserSnapshot,
  BrowserRuntimeCapabilities,
  BrowserObservations,
  EvidenceBundle,
  IssueCaptureResult,
} from "../domain/types.js";
import { CAPTURE_SURFACES, MAX_EVIDENCE_BUNDLE_BYTES, MAX_WEBMCP_DETAIL_BYTES } from "../domain/types.js";
import { WebDebugError } from "./errors.js";
import { boundText } from "./redaction.js";
import { actionSecrets, cloneJson, replaceSecrets } from "./private-values.js";

const MAX_CAPTURE_CURSORS = 8;
const MAX_SUMMARY_CAPTURE_BYTES = 16 * 1024;
const MAX_PARTIAL_CAPTURE_BYTES = 64 * 1024;

export interface CaptureCursorState {
  cursor: string;
  generation: number;
  digests: Record<CaptureSurface, string>;
}

export interface CaptureArtifactHandle {
  path: string;
  artifactDir: string;
}

export const CAPTURE_ARTIFACT = Symbol("web-debug-capture-artifact");
export type InternalIssueCaptureResult = IssueCaptureResult & {
  [CAPTURE_ARTIFACT]?: CaptureArtifactHandle;
};

export function normalizeCaptureView(view: CaptureView | undefined): CaptureView {
  const normalized = view ?? { profile: "summary" };
  if (normalized.profile === "include") {
    return { profile: "include", surfaces: normalizeSurfaces(normalized.surfaces, true) };
  }
  if (normalized.profile === "delta") {
    if (!normalized.cursor || normalized.cursor.length > 200) throw new WebDebugError("CAPTURE_CURSOR_INVALID", "A delta capture requires an opaque cursor of at most 200 characters.");
    return {
      profile: "delta",
      cursor: normalized.cursor,
      ...(normalized.surfaces ? { surfaces: normalizeSurfaces(normalized.surfaces, true) } : {}),
    };
  }
  return normalized.profile === "full" ? { profile: "full" } : { profile: "summary" };
}

export function captureRequestsScreenshot(view: CaptureView): boolean {
  return view.profile === "full" || ("surfaces" in view && view.surfaces?.includes("screenshot") === true);
}

export function assertCaptureCursorAvailable(view: CaptureView, cursors: CaptureCursorState[], generation: number): void {
  if (view.profile !== "delta") return;
  const previous = cursors.find((candidate) => candidate.cursor === view.cursor);
  if (!previous) throw new WebDebugError("CAPTURE_CURSOR_NOT_FOUND", "The capture cursor is unknown, belongs to another session, or has been evicted.");
  if (previous.generation !== generation) throw new WebDebugError("CAPTURE_CURSOR_STALE", "The selected browser target changed after this capture cursor was created.");
}

export function projectIssueCapture(input: {
  evidence: EvidenceBundle;
  view: CaptureView;
  cursors: CaptureCursorState[];
  generation: number;
  screenshotSuppressed: boolean;
}): InternalIssueCaptureResult {
  const { evidence, view, cursors, generation, screenshotSuppressed } = input;
  const screenshotRequested = captureRequestsScreenshot(view);
  const screenshotStatus: NonNullable<CaptureDetails["screenshot"]>["status"] = evidence.browser.screenshotPath
    ? "captured"
    : screenshotRequested && screenshotSuppressed
      ? "suppressed"
      : "unavailable";
  const surfaces = captureSurfaces(evidence, screenshotStatus);
  const digests = surfaceDigests(surfaces, screenshotRequested);
  const cursor = randomUUID();
  const selected = selectedSurfaces(view);
  const summary = captureSummary(evidence);
  const common: IssueCaptureResult = {
    schemaVersion: 5,
    profile: view.profile,
    capturedAt: evidence.capturedAt,
    cursor,
    session: {
      id: evidence.session.id,
      url: evidence.session.url,
      status: evidence.session.status,
      target: evidence.session.target ? {
        schemaVersion: evidence.session.target.schemaVersion,
        browser: evidence.session.target.browser,
        remote: evidence.session.target.remote,
        viewport: evidence.session.target.viewport,
        isolated: evidence.session.target.isolated,
        ...(evidence.session.target.mode ? { mode: evidence.session.target.mode } : {}),
      } : null,
      projectCapabilities: evidence.session.projectCapabilities,
      runtimeCapabilities: compactRuntimeCapabilities(evidence.session.runtimeCapabilities),
    },
    project: {
      frameworks: [...evidence.project.frameworks],
      confidence: evidence.project.confidence,
      ambiguous: evidence.project.ambiguous,
      projectCapabilities: evidence.project.projectCapabilities,
    },
    summary,
    redaction: { applied: true, policy: "default-sensitive-fields" },
    warnings: captureWarnings(evidence),
    truncation: {
      applied: evidence.truncation?.optional === true,
      omittedSurfaces: [],
    },
  };

  if (view.profile === "full") {
    common.details = pickSurfaces(surfaces, selected);
  } else if (view.profile === "include") {
    common.includedSurfaces = selected;
    common.details = pickSurfaces(surfaces, selected);
  } else if (view.profile === "delta") {
    assertCaptureCursorAvailable(view, cursors, generation);
    const previous = cursors.find((candidate) => candidate.cursor === view.cursor);
    if (!previous) throw new WebDebugError("CAPTURE_CURSOR_NOT_FOUND", "The capture cursor is unavailable.");
    const changed = selected.filter((surface) => previous.digests[surface] !== digests[surface]);
    const unchanged = selected.filter((surface) => !changed.includes(surface));
    common.fromCursor = view.cursor;
    common.changedSurfaces = changed;
    common.unchangedSurfaces = unchanged;
    common.details = pickSurfaces(surfaces, changed);
  }

  const returned = view.profile === "summary"
    ? []
    : view.profile === "delta"
      ? common.changedSurfaces ?? []
      : selected;
  common.truncation.omittedSurfaces = CAPTURE_SURFACES.filter((surface) => !returned.includes(surface));
  if (view.profile === "summary") fitSummaryBudget(common);
  assertCaptureBudget(common);
  cursors.push({ cursor, generation, digests });
  while (cursors.length > MAX_CAPTURE_CURSORS) cursors.shift();

  const result = common as InternalIssueCaptureResult;
  if (evidence.browser.screenshotPath) {
    result[CAPTURE_ARTIFACT] = { path: evidence.browser.screenshotPath, artifactDir: evidence.session.artifactDir };
  }
  return result;
}

function normalizeSurfaces(surfaces: CaptureSurface[], requireOne: boolean): CaptureSurface[] {
  const unique = [...new Set(surfaces)];
  if (requireOne && unique.length === 0) throw new WebDebugError("CAPTURE_SURFACES_REQUIRED", "The selected capture profile requires at least one surface.");
  if (unique.length !== surfaces.length) throw new WebDebugError("CAPTURE_SURFACES_DUPLICATE", "Capture surfaces must be unique.");
  if (unique.some((surface) => !CAPTURE_SURFACES.includes(surface))) throw new WebDebugError("CAPTURE_SURFACE_INVALID", "An unsupported capture surface was requested.");
  return CAPTURE_SURFACES.filter((surface) => unique.includes(surface));
}

function selectedSurfaces(view: CaptureView): CaptureSurface[] {
  if (view.profile === "summary") return [];
  if (view.profile === "full") return [...CAPTURE_SURFACES];
  if (view.profile === "include") return [...view.surfaces];
  return view.surfaces ? [...view.surfaces] : CAPTURE_SURFACES.filter((surface) => surface !== "screenshot" && surface !== "replay");
}

function captureSurfaces(evidence: EvidenceBundle, screenshotStatus: NonNullable<CaptureDetails["screenshot"]>["status"]): Required<CaptureDetails> {
  return {
    dom: evidence.browser.dom,
    console: evidence.browser.console,
    network: evidence.browser.network,
    debugger: evidence.browser.debugger,
    react: evidence.browser.react,
    angular: evidence.browser.angular,
    vue: evidence.browser.vue,
    next: evidence.browser.next,
    vite: evidence.browser.vite,
    accessibility: evidence.browser.accessibility ?? null,
    replay: evidence.replay,
    screenshot: { status: screenshotStatus },
    webmcp: evidence.browser.webmcp ?? null,
  };
}

function pickSurfaces(all: Required<CaptureDetails>, selected: CaptureSurface[]): CaptureDetails {
  return Object.fromEntries(selected.map((surface) => [surface, all[surface]])) as CaptureDetails;
}

function surfaceDigests(all: Required<CaptureDetails>, screenshotRequested: boolean): Record<CaptureSurface, string> {
  return Object.fromEntries(CAPTURE_SURFACES.map((surface) => {
    if (surface === "screenshot" && screenshotRequested && all.screenshot.status === "captured") return [surface, randomUUID()];
    return [surface, createHash("sha256").update(JSON.stringify(all[surface])).digest("hex")];
  })) as Record<CaptureSurface, string>;
}

function captureSummary(evidence: EvidenceBundle): CaptureSummary {
  const browser = evidence.browser;
  const errors = browser.console.filter((entry) => entry.level === "error" || entry.level === "pageerror");
  const consoleWarnings = browser.console.filter((entry) => entry.level === "warning");
  const failures = browser.network.filter((entry) => entry.ok === false || entry.failure !== undefined || (entry.status !== null && entry.status >= 400));
  const pending = browser.network.filter((entry) => entry.status === null && entry.failure === undefined);
  const runtimeState = (enabled: boolean, value: unknown) => !enabled ? "not-detected" as const : value ? "present" as const : "unavailable" as const;
  const replayFrames = evidence.replay.frames;
  return {
    title: boundText(browser.title, 300),
    viewport: browser.viewport,
    bodyText: boundText(browser.dom.bodyText, 1_000),
    domElements: browser.dom.elements.length,
    console: {
      total: browser.console.length,
      errors: errors.length,
      warnings: consoleWarnings.length,
      latestErrors: errors.slice(-3).map((entry) => ({ ...entry, text: boundText(entry.text, 500), ...(entry.url ? { url: boundText(entry.url, 500) } : {}) })),
    },
    network: {
      total: browser.network.length,
      failed: failures.length,
      pending: pending.length,
      latestFailures: failures.slice(-3).map((entry) => ({
        ...entry,
        requestId: boundText(entry.requestId, 120),
        method: boundText(entry.method, 30),
        url: boundText(entry.url, 1_000),
        resourceType: boundText(entry.resourceType, 100),
        ...(entry.nextActionId ? { nextActionId: boundText(entry.nextActionId, 120) } : {}),
        ...(entry.failure ? { failure: boundText(entry.failure, 300) } : {}),
      })),
    },
    debugger: {
      paused: browser.debugger.paused,
      reason: browser.debugger.reason,
      callFrames: browser.debugger.callFrames.length,
      breakpoints: browser.debugger.breakpoints.length,
    },
    runtimes: {
      react: runtimeState(evidence.project.projectCapabilities.react, browser.react),
      angular: runtimeState(evidence.project.projectCapabilities.angular, browser.angular),
      vue: runtimeState(evidence.project.projectCapabilities.vue, browser.vue),
      next: runtimeState(evidence.project.projectCapabilities.next, browser.next),
      vite: runtimeState(evidence.project.projectCapabilities.vite, browser.vite),
      accessibility: evidence.session.runtimeCapabilities?.accessibility.state === "unsupported"
        ? "unavailable"
        : browser.accessibility
          ? "present"
          : "unavailable",
    },
    replay: {
      frames: replayFrames.length,
      truncated: evidence.replay.truncated,
      oldestIndex: replayFrames[0]?.index ?? null,
      newestIndex: replayFrames.at(-1)?.index ?? null,
      restorable: evidence.replay.restorable,
      restoreBlockedReason: evidence.replay.restoreBlockedReason,
    },
    webmcp: {
      state: evidence.session.runtimeCapabilities?.webmcp.state ?? "unsupported",
      callableTools: browser.webmcp?.tools.length ?? 0,
      truncated: browser.webmcp?.truncated ?? false,
    },
    observations: compactObservations(browser.observations),
  };
}

function captureWarnings(evidence: EvidenceBundle): string[] {
  return [...new Set([
    ...evidence.browser.warnings,
    ...(evidence.browser.react?.warnings ?? []),
    ...(evidence.browser.angular?.warnings ?? []),
    ...(evidence.browser.vue?.warnings ?? []),
    ...(evidence.browser.next?.warnings ?? []),
    ...(evidence.browser.vite?.warnings ?? []),
    ...(evidence.browser.accessibility?.warnings ?? []),
    ...evidence.session.warnings,
  ].map((warning) => boundText(warning, 300)))].slice(0, 6);
}

function compactRuntimeCapabilities(runtime: BrowserRuntimeCapabilities | null): BrowserRuntimeCapabilities | null {
  if (!runtime) return null;
  const compact = cloneJson(runtime);
  for (const capability of [
    compact.actions,
    compact.locators.css,
    compact.locators.semantic,
    compact.dom,
    compact.console,
    compact.network,
    compact.screenshots,
    compact.javascriptDebugger,
    compact.evaluation,
    compact.accessibility,
    compact.pageRuntimeEnrichment,
    compact.viewportMatrix,
    compact.tlsBypass,
    compact.authSeeding,
    compact.webmcp,
  ]) delete capability.reason;
  return compact;
}

function compactObservations(observations: BrowserObservations | undefined): BrowserObservations | null {
  if (!observations) return null;
  return Object.fromEntries(Object.entries(observations).map(([key, observation]) => [key, {
    ...observation,
    ...(observation.observed ? { observed: boundText(observation.observed, 500) } : {}),
    ...(observation.warning ? { warning: boundText(observation.warning, 300) } : {}),
  }])) as unknown as BrowserObservations;
}

function fitSummaryBudget(result: IssueCaptureResult): void {
  if (serializedBytes(result) <= MAX_SUMMARY_CAPTURE_BYTES) return;
  result.truncation.applied = true;
  result.summary.bodyText = boundText(result.summary.bodyText, 500);
  result.summary.console.latestErrors = result.summary.console.latestErrors.slice(-1);
  result.summary.network.latestFailures = result.summary.network.latestFailures.slice(-1);
  result.summary.observations = null;
  result.warnings = result.warnings.slice(0, 3).map((warning) => boundText(warning, 200));
  if (serializedBytes(result) <= MAX_SUMMARY_CAPTURE_BYTES) return;
  result.summary.bodyText = boundText(result.summary.bodyText, 200);
  result.summary.console.latestErrors = [];
  result.summary.network.latestFailures = [];
  result.warnings = result.warnings.slice(0, 1);
  result.session.target = null;
}

function assertCaptureBudget(result: IssueCaptureResult): void {
  const bytes = Buffer.byteLength(JSON.stringify(result));
  const limit = result.profile === "summary"
    ? MAX_SUMMARY_CAPTURE_BYTES
    : result.profile === "full"
      ? MAX_EVIDENCE_BUNDLE_BYTES
      : MAX_PARTIAL_CAPTURE_BYTES;
  if (bytes > limit) {
    throw new WebDebugError("RESULT_LIMIT_EXCEEDED", `The ${result.profile} capture exceeded its ${limit}-byte profile limit.`);
  }
}

export function boundEvidence(evidence: EvidenceBundle): EvidenceBundle {
  const bounded = cloneJson(evidence);
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
  if (bounded.browser.webmcp) pruneWebMcpDetail(bounded.browser.webmcp);
  bounded.replay.frames = bounded.replay.frames.slice(-8);
  if (serializedBytes(bounded) > MAX_EVIDENCE_BUNDLE_BYTES) {
    optionalTruncated = true;
    bounded.browser.warnings = [...bounded.browser.warnings, "Evidence optional detail was pruned to the 96 KiB bound."];
    bounded.browser.react = null;
    bounded.browser.angular = null;
    bounded.browser.vue = null;
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

export function scrubEvidence(evidence: EvidenceBundle, actions: ReplayableBrowserAction[]): EvidenceBundle {
  const secrets = actionSecrets(actions);
  if (secrets.length === 0) return evidence;
  const sanitized = replaceSecrets(evidence, secrets) as EvidenceBundle;
  const rawScreenshotPath = evidence.browser.screenshotPath;
  const safeScreenshotPath = sanitized.browser.screenshotPath;
  if (rawScreenshotPath && safeScreenshotPath && rawScreenshotPath !== safeScreenshotPath) {
    sanitized.browser.screenshotPath = null;
    sanitized.browser.warnings = [...sanitized.browser.warnings, "Screenshot handle was omitted because its path contained a fill value."];
  }
  return sanitized;
}

export function scrubBrowserSnapshot(browser: BrowserSnapshot, actions: ReplayableBrowserAction[]): BrowserSnapshot {
  const secrets = actionSecrets(actions);
  return secrets.length === 0 ? browser : replaceSecrets(browser, secrets) as BrowserSnapshot;
}

export function pruneEvidence(evidence: EvidenceBundle): EvidenceBundle {
  const pruned = cloneJson(evidence);
  pruned.browser.react = null;
  pruned.browser.angular = null;
  pruned.browser.vue = null;
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

export function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
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

function pruneWebMcpDetail(detail: NonNullable<BrowserSnapshot["webmcp"]>): void {
  const serialized = () => serializedBytes(detail);
  if (serialized() <= MAX_WEBMCP_DETAIL_BYTES) return;
  detail.truncated = true;
  for (let index = detail.tools.length - 1; index >= 0 && serialized() > MAX_WEBMCP_DETAIL_BYTES; index -= 1) detail.tools[index]!.inputSchemaJson = null;
  for (let index = detail.tools.length - 1; index >= 0 && serialized() > MAX_WEBMCP_DETAIL_BYTES; index -= 1) detail.tools[index]!.description = "";
  while (detail.tools.length > 0 && serialized() > MAX_WEBMCP_DETAIL_BYTES) detail.tools.pop();
}
