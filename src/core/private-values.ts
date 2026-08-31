import type { DirectBrowserAction, ReplayableBrowserAction } from "../domain/types.js";

export function scrubText(value: string, secrets: string[]): string {
  const ordered = [...new Set(secrets)].sort((first, second) => second.length - first.length);
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
