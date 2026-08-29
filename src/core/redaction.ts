const SENSITIVE_KEY = /authorization|cookie|set-cookie|token|secret|password|passwd|api-key|private-key|csrf/i;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const KEY_VALUE_SECRET = /((?:authorization|cookie|token|secret|password|passwd|api[-_]?key|private[-_]?key|csrf)\s*[:=]\s*)([^,;\s&]+)/gi;
const MAX_REDACTED_VALUE_NODES = 20_000;
const MAX_REDACTED_VALUE_BYTES = 1_048_576;
const MAX_REDACTED_STRING_BYTES = 8_000;
const MAX_REDACTED_KEY_BYTES = 200;
const MAX_REDACTED_OBJECT_ENTRIES = 50;

interface RedactionBudget {
  remainingNodes: number;
  remainingBytes: number;
}

export function redactText(input: string): string {
  return input
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(JWT, "[REDACTED_JWT]")
    .replace(KEY_VALUE_SECRET, "$1[REDACTED]");
}

export function safeUrl(input: string): string {
  const boundedInput = boundTextInput(input, 2_560);
  try {
    const url = new URL(boundedInput);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return redactText(url.toString());
  } catch {
    return redactText(boundedInput);
  }
}

export function redactValue(value: unknown, key?: string): unknown {
  return redactValueInternal(value, key, new WeakSet<object>(), 0, {
    remainingNodes: MAX_REDACTED_VALUE_NODES,
    remainingBytes: MAX_REDACTED_VALUE_BYTES,
  });
}

function redactValueInternal(
  value: unknown,
  key: string | undefined,
  seen: WeakSet<object>,
  depth: number,
  budget: RedactionBudget,
): unknown {
  if (budget.remainingNodes <= 0 || budget.remainingBytes <= 0) return "[TRUNCATED_BUDGET]";
  budget.remainingNodes -= 1;
  if (key && isSensitiveKey(key)) {
    return consumeText("[REDACTED]", budget);
  }
  if (typeof value === "string") {
    const boundedInput = truncateUtf8(value, Math.min(MAX_REDACTED_STRING_BYTES + 512, budget.remainingBytes + 512));
    const redacted = redactText(boundedInput);
    const available = Math.max(0, Math.min(MAX_REDACTED_STRING_BYTES, budget.remainingBytes));
    const bounded = truncateUtf8(redacted, available, "… [TRUNCATED]");
    budget.remainingBytes -= Buffer.byteLength(bounded);
    return bounded;
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
    return value.slice(0, MAX_REDACTED_OBJECT_ENTRIES).map((item) => redactValueInternal(item, undefined, seen, depth + 1, budget));
  }

  const output: Record<string, unknown> = {};
  let index = 0;
  for (const childKey in value) {
    if (!Object.prototype.hasOwnProperty.call(value, childKey)) continue;
    if (index >= MAX_REDACTED_OBJECT_ENTRIES) break;
    if (budget.remainingNodes <= 0 || budget.remainingBytes <= 0) break;
    const redactedKey = redactText(childKey);
    const boundedKey = truncateUtf8(redactedKey, Math.min(MAX_REDACTED_KEY_BYTES, budget.remainingBytes), "… [TRUNCATED]");
    budget.remainingBytes -= Buffer.byteLength(boundedKey);
    const uniqueKey = Object.prototype.hasOwnProperty.call(output, boundedKey) ? `${boundedKey}#${index}` : boundedKey;
    let childValue: unknown;
    try { childValue = (value as Record<string, unknown>)[childKey]; }
    catch { childValue = "[UNREADABLE_PROPERTY]"; }
    output[uniqueKey] = redactValueInternal(childValue, childKey, seen, depth + 1, budget);
    index += 1;
  }
  return output;
}

export function boundText(input: string, maxChars = 4_000): string {
  const text = redactText(boundTextInput(input, maxChars + 512));
  if (text.length <= maxChars) return text;
  const suffix = "… [TRUNCATED]";
  if (maxChars <= suffix.length) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - suffix.length)}${suffix}`;
}

function boundTextInput(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars);
}

export function boundItems<T>(items: T[], maxItems = 50): { items: T[]; truncated: boolean } {
  return {
    items: items.slice(0, maxItems),
    truncated: items.length > maxItems,
  };
}

function consumeText(value: string, budget: RedactionBudget): string {
  const bounded = truncateUtf8(value, budget.remainingBytes);
  budget.remainingBytes -= Buffer.byteLength(bounded);
  return bounded;
}

function truncateUtf8(value: string, maxBytes: number, suffix = ""): string {
  if (maxBytes <= 0) return "";
  if (Buffer.byteLength(value) <= maxBytes) return value;
  const boundedSuffix = Buffer.byteLength(suffix) <= maxBytes ? suffix : "";
  const contentBudget = maxBytes - Buffer.byteLength(boundedSuffix);
  let output = "";
  let used = 0;
  for (const character of value) {
    const bytes = Buffer.byteLength(character);
    if (used + bytes > contentBudget) break;
    output += character;
    used += bytes;
  }
  return `${output}${boundedSuffix}`;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  return SENSITIVE_KEY.test(normalized) || normalized === "session" || normalized === "session-token";
}
