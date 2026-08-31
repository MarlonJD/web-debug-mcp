import type { BrowserStartOptions } from "../adapters/browser.js";
import type { BrowserTarget, DebugSessionSummary } from "../domain/types.js";
import { WebDebugError, errorMessage } from "./errors.js";
import { cloneJson, replaceSecrets, scrubText } from "./private-values.js";
import { boundText, redactText, redactValue, safeUrl } from "./redaction.js";

export function assertAllowedTargetUrl(raw: string, allowRemote: boolean): void {
  if (raw.length > 2_048) throw new WebDebugError("URL_LIMIT_EXCEEDED", "Browser URLs are limited to 2,048 characters.");
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new WebDebugError("URL_INVALID", "Browser URL is invalid."); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new WebDebugError("URL_PROTOCOL_BLOCKED", "Only http and https browser targets are supported.");
  if (!allowRemote && !isLoopback(parsed.hostname)) throw new WebDebugError("REMOTE_TARGET_BLOCKED", "Remote browser targets are blocked by default. Set allowRemote only for an explicitly approved target.");
}

export function isLoopback(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function normalizeTarget(target: BrowserTarget, browser: "chromium" | "safari", options: BrowserStartOptions): BrowserTarget {
  if (target.url.length > 2_048) throw new WebDebugError("URL_LIMIT_EXCEEDED", "The final browser target URL exceeded 2,048 characters.");
  const mode = target.mode ?? (browser === "safari" ? "webdriver" : options.cdpEndpoint ? "attach" : "launch");
  const isolated = target.isolated && mode === "launch";
  return { ...target, schemaVersion: 1, browser: target.browser ?? browser, url: safeUrl(target.url), title: boundText(target.title, 300), mode, isolated, isolation: target.isolation ?? { browserProcess: isolated, context: isolated, profile: isolated, storage: isolated, cache: isolated, serviceWorkers: isolated, navigation: isolated, serverState: false } };
}

export function cloneSummary(summary: DebugSessionSummary, secrets: string[] = []): DebugSessionSummary {
  const cloned = cloneJson({ ...summary, warnings: [...summary.warnings], target: summary.target ? { ...summary.target, isolation: summary.target.isolation ? { ...summary.target.isolation } : undefined } : null });
  if (secrets.length === 0) return cloned;
  cloned.url = scrubText(cloned.url, secrets);
  cloned.warnings = cloned.warnings.map((warning) => scrubText(warning, secrets));
  if (cloned.target) {
    cloned.target.url = scrubText(cloned.target.url, secrets);
    cloned.target.title = scrubText(cloned.target.title, secrets);
  }
  return cloned;
}

export function mergeWarnings(existing: string[], additions: string[]): string[] {
  return [...new Set([...existing, ...additions].map((item) => boundText(redactText(item), 500)))].slice(0, 100);
}

export function sanitizeError(error: unknown, secrets: string[] = []): unknown {
  const message = boundText(secrets.length ? scrubText(errorMessage(error), secrets) : redactText(errorMessage(error)), 500);
  const details = error instanceof WebDebugError
    ? (secrets.length ? replaceSecrets(error.details, secrets) : redactValue(error.details))
    : undefined;
  if (error instanceof WebDebugError) return new WebDebugError(error.code, message, details);
  return new Error(message);
}

export function runtimeCapabilityStates(runtime: DebugSessionSummary["runtimeCapabilities"]): Record<string, "supported" | "degraded" | "unsupported"> {
  if (!runtime) return {};
  return {
    actions: runtime.actions.state,
    "locators.css": runtime.locators.css.state,
    "locators.semantic": runtime.locators.semantic.state,
    dom: runtime.dom.state,
    console: runtime.console.state,
    network: runtime.network.state,
    screenshots: runtime.screenshots.state,
    javascriptDebugger: runtime.javascriptDebugger.state,
    evaluation: runtime.evaluation.state,
    accessibility: runtime.accessibility.state,
    pageRuntimeEnrichment: runtime.pageRuntimeEnrichment.state,
    viewportMatrix: runtime.viewportMatrix.state,
    tlsBypass: runtime.tlsBypass.state,
    authSeeding: runtime.authSeeding.state,
    webmcp: runtime.webmcp.state,
  };
}

export function runtimeCapabilityWarnings(runtime: NonNullable<DebugSessionSummary["runtimeCapabilities"]>): string[] {
  const entries = [
    ["semantic locators", runtime.locators.semantic],
    ["console", runtime.console],
    ["network", runtime.network],
    ["JavaScript debugger", runtime.javascriptDebugger],
    ["evaluation", runtime.evaluation],
    ["accessibility", runtime.accessibility],
    ["page runtime enrichment", runtime.pageRuntimeEnrichment],
    ["viewport matrix", runtime.viewportMatrix],
    ["TLS bypass", runtime.tlsBypass],
    ["auth seeding", runtime.authSeeding],
    ["WebMCP page API", runtime.webmcp],
  ] as const;
  return entries.flatMap(([name, capability]) => capability.state === "supported"
    ? []
    : [`Runtime capability ${name} is ${capability.state}: ${capability.reason ?? "no transport support was negotiated."}`]);
}

export function closedSessionSummary(summary: DebugSessionSummary): DebugSessionSummary {
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
  return { ...cloneSummary(summary), url, status: "closed", target: null };
}
