const SENSITIVE_KEY = /authorization|cookie|set-cookie|token|secret|password|passwd|api-key|private-key|csrf/i;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const KEY_VALUE_SECRET = /((?:authorization|cookie|token|secret|password|passwd|api[-_]?key|private[-_]?key|csrf)\s*[:=]\s*)([^,;\s&]+)/gi;

export function redactText(input: string): string {
  return input
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(JWT, "[REDACTED_JWT]")
    .replace(KEY_VALUE_SECRET, "$1[REDACTED]");
}

export function safeUrl(input: string): string {
  try {
    const url = new URL(input);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return redactText(url.toString());
  } catch {
    return redactText(input);
  }
}

export function redactValue(value: unknown, key?: string): unknown {
  return redactValueInternal(value, key, new WeakSet<object>(), 0);
}

function redactValueInternal(
  value: unknown,
  key: string | undefined,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (key && isSensitiveKey(key)) {
    return "[REDACTED]";
  }
  if (typeof value === "string") {
    return redactText(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (depth >= 8) {
    return "[TRUNCATED_OBJECT]";
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactValueInternal(item, undefined, seen, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = redactValueInternal(childValue, childKey, seen, depth + 1);
  }
  return output;
}

export function boundText(input: string, maxChars = 4_000): string {
  const text = redactText(input);
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}… [TRUNCATED]`;
}

export function boundItems<T>(items: T[], maxItems = 50): { items: T[]; truncated: boolean } {
  return {
    items: items.slice(0, maxItems),
    truncated: items.length > maxItems,
  };
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  return SENSITIVE_KEY.test(normalized) || normalized === "session" || normalized === "session-token";
}
