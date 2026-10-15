import type { BrowserLocator, CheckObservation, ScenarioCheck, DirectBrowserAction, ReplayableBrowserAction, ReplayFrame } from "../domain/types.js";
import { boundText, safeUrl } from "./redaction.js";

export function privateRepresentations(secrets: string[]): string[] {
  return [...new Set(secrets.filter(Boolean).flatMap(value => {
    const scalar = [...value].map(character => character.length === 1 && /[\uD800-\uDFFF]/.test(character) ? "\uFFFD" : character).join("");
    return [value, encodeURIComponent(scalar), new URLSearchParams({ v: value }).toString().slice(2), JSON.stringify(value).slice(1, -1)];
  }))].sort((first, second) => second.length - first.length);
}

export function scrubText(value: string, secrets: string[]): string {
  const ordered = privateRepresentations(secrets);
  return ordered.reduce((result, secret) => result.split(secret).join(redactionMarker(secret, ordered)), value);
}

export function redactionMarker(secret: string, blocked: string[]): string {
  const candidates = ["[REDACTED_INPUT]", "[REDACTED]", "[REMOVED]", "[FILTERED]", "[X]", "■"];
  const safe = candidates.find((candidate) => !blocked.some((value) => candidate.includes(value)));
  if (safe) return safe;
  for (let codePoint = 0xe000; codePoint <= 0xf8ff; codePoint += 1) {
    const candidate = String.fromCodePoint(codePoint);
    if (!blocked.some((value) => value.includes(candidate))) return candidate;
  }
  return "";
}

export function replaceSecrets(value: unknown, secrets: string[], depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 32) return "[TRUNCATED_OBJECT]";
  if (typeof value === "string") return scrubText(value, secrets);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => replaceSecrets(item, secrets, depth + 1, seen));
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, replaceSecrets(child, secrets, depth + 1, seen)]));
}

/** Opaque page/runtime payloads have untrusted keys and may echo numeric input. */
export function scrubOpaqueValue(value: unknown, secrets: string[], depth = 0): unknown {
  if (depth > 16) return "[TRUNCATED_OBJECT]";
  if (typeof value === "string") return scrubText(value, secrets);
  if (typeof value === "number" && secrets.some(secret => /^-?(?:\d+\.?\d*|\d*\.\d+)$/.test(secret) && Number(secret) === value)) return redactionMarker(String(value), privateRepresentations(secrets));
  if (Array.isArray(value)) return value.map(item => scrubOpaqueValue(item, secrets, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [scrubText(key, secrets), scrubOpaqueValue(child, secrets, depth + 1)]));
}

export function scrubSelectedUrl(value: string, selected: string, secrets: string[]): string {
  try {
    const url = new URL(safeUrl(value));
    if (url.origin === new URL(selected).origin) return `${url.origin}${scrubText(`${url.pathname}${url.search}${url.hash}`, secrets)}`;
  } catch { /* Unrecognized addresses remain entirely private data. */ }
  return scrubText(safeUrl(value), secrets);
}

export function isHostRequestId(value: string, secrets: string[]): boolean {
  return /^(?:\d+\.\d+|\d{13}-\d{1,4}|performance-\d+)$/.test(value) && !secrets.includes(value);
}

export function scrubCheck<T extends ScenarioCheck | CheckObservation>(check: T, secrets: string[]): T {
  const scrubbed = replaceSecrets(check, secrets) as T;
  // Declared kinds and host-produced verdicts are structural, never page echoes.
  scrubbed.kind = check.kind;
  if ("match" in check) Object.assign(scrubbed, { match: check.match });
  if ("method" in check) Object.assign(scrubbed, { method: check.method });
  if ("locator" in check) Object.assign(scrubbed, { locator: scrubLocator(check.locator, secrets) });
  if ("state" in check) Object.assign(scrubbed, { state: check.state, freshness: check.freshness, provenance: check.provenance, ...(check.expected ? { expected: check.expected } : {}) });
  else if ("expected" in check) Object.assign(scrubbed, { expected: check.expected });
  const fields = scrubbed as unknown as Record<string, unknown>;
  for (const field of ["text", "observed", "warning", "path"] as const) {
    if (typeof fields[field] === "string") fields[field] = boundText(fields[field], field === "path" ? 2_048 : 500);
  }
  return scrubbed;
}

export function scrubAction(action: ReplayableBrowserAction, secrets: string[]): ReplayableBrowserAction {
  const result = replaceSecrets(action, secrets) as ReplayableBrowserAction;
  result.kind = action.kind;
  if ("locator" in result && "locator" in action) result.locator = scrubLocator(action.locator, secrets);
  if (action.kind === "wait") Object.assign(result, { property: action.property });
  if (action.kind === "press") Object.assign(result, { key: action.key });
  return result;
}

export function scrubLocator(locator: BrowserLocator, secrets: string[]): BrowserLocator {
  if (locator.kind === "css" || locator.kind === "testId") return { ...locator, value: boundText(scrubText(locator.value, secrets), 500) };
  if (locator.kind === "text" || locator.kind === "label") return { ...locator, text: boundText(scrubText(locator.text, secrets), 500) };
  return { ...locator, role: boundText(scrubText(locator.role, secrets), 100), ...(locator.name === undefined ? {} : { name: boundText(scrubText(locator.name, secrets), 300) }) };
}

export function isSensitiveInputAction(action: ReplayableBrowserAction): action is Extract<ReplayableBrowserAction, { kind: "fill" | "select" }> {
  return action.kind === "fill" || action.kind === "select";
}

export function actionSecret(action: DirectBrowserAction): string | null {
  return action.kind !== "webmcp" && isSensitiveInputAction(action) && action.value.length > 0 ? action.value : null;
}

export function actionSecrets(actions: ReplayableBrowserAction[]): string[] {
  return actions.flatMap((action) => {
    const secret = actionSecret(action);
    return secret ? [secret] : [];
  });
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function scrubReplayFrame(frame: ReplayFrame, secrets: string[]): ReplayFrame {
  const sanitized = replaceSecrets(frame, secrets) as ReplayFrame;
  // These fields are created by the host, never supplied by page content.
  sanitized.capturedAt = frame.capturedAt;
  sanitized.attemptId = frame.attemptId;
  sanitized.trigger = frame.trigger;
  sanitized.url = scrubSelectedUrl(frame.url, frame.url, secrets);
  if (frame.action) sanitized.action = scrubAction(frame.action, secrets);
  frame.console.forEach((entry, index) => { if (sanitized.console[index]) sanitized.console[index]!.level = entry.level; });
  sanitized.dom.bodyText = boundText(sanitized.dom.bodyText, 4_000);
  sanitized.title = boundText(sanitized.title, 300);
  sanitized.console.forEach(entry => { entry.text = boundText(entry.text, 2_000); });
  frame.network.forEach((entry, index) => {
    if (sanitized.network[index]) Object.assign(sanitized.network[index]!, { ...(isHostRequestId(entry.requestId, secrets) ? { requestId: entry.requestId } : {}), method: entry.method, resourceType: entry.resourceType, url: scrubSelectedUrl(entry.url, frame.url, secrets) });
  });
  return sanitized;
}
