const SENSITIVE_KEY = /authorization|cookie|set-cookie|token|secret|password|passwd|api[-_]?key|private[-_]?key|csrf/i;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const REDACTION_MARKER = "[REDACTED]";
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
  return redactSensitiveAssignments(input)
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(JWT, "[REDACTED_JWT]");
}

interface TextAssignment {
  key: string;
  valueStart: number;
}

interface RedactedTextValue {
  end: number;
  replacement: string;
}

function redactSensitiveAssignments(input: string): string {
  let output = "";
  let cursor = 0;
  let index = 0;
  let quoteContext: '"' | "'" | null = null;

  while (index < input.length) {
    const assignment = readTextAssignment(input, index, quoteContext);
    if (assignment && isSensitiveKey(assignment.key)) {
      const value = readSensitiveTextValue(input, assignment.valueStart, assignment.key, quoteContext);
      output += `${input.slice(cursor, assignment.valueStart)}${value.replacement}`;
      cursor = value.end;
      index = Math.max(value.end, index + 1);
      continue;
    }

    const character = input[index]!;
    if (isQuote(character) && !isEscapedAt(input, index)) {
      quoteContext = quoteContext === character ? null : quoteContext ?? character;
    }
    index += 1;
  }

  return `${output}${input.slice(cursor)}`;
}

function readTextAssignment(input: string, index: number, quoteContext: '"' | "'" | null): TextAssignment | null {
  const key = readTextKey(input, index, quoteContext);
  if (!key) return null;
  let cursor = key.end;
  while (isHorizontalWhitespace(input[cursor])) cursor += 1;
  if (input[cursor] !== ":" && input[cursor] !== "=") return null;
  cursor += 1;
  while (isHorizontalWhitespace(input[cursor])) cursor += 1;
  return { key: key.name, valueStart: cursor };
}

function readTextKey(input: string, index: number, quoteContext: '"' | "'" | null): { name: string; end: number } | null {
  const character = input[index];
  if (!character) return null;

  if (isQuote(character)) {
    if (quoteContext === character) return null;
    const end = findRawQuoteEnd(input, index, character);
    if (end === null || end === index + 2) return null;
    return { name: input.slice(index + 1, end - 1), end };
  }

  if (character === "\\" && isQuote(input[index + 1])) {
    const quote = input[index + 1] as '"' | "'";
    for (let cursor = index + 2; cursor < input.length - 1; cursor += 1) {
      if (input[cursor] === "\\" && input[cursor + 1] === quote && input[cursor - 1] !== "\\") {
        if (cursor === index + 2) return null;
        return { name: input.slice(index + 2, cursor), end: cursor + 2 };
      }
      if (input[cursor] === "\r" || input[cursor] === "\n") return null;
    }
    return null;
  }

  if (!isKeyStart(character) || index > 0 && isKeyCharacter(input[index - 1])) return null;
  let end = index + 1;
  while (isKeyCharacter(input[end])) end += 1;
  return { name: input.slice(index, end), end };
}

function readSensitiveTextValue(
  input: string,
  start: number,
  key: string,
  quoteContext: '"' | "'" | null,
): RedactedTextValue {
  const character = input[start];
  if (isQuote(character)) {
    const end = findRawQuoteEnd(input, start, character);
    if (end !== null) return { end, replacement: `${character}${REDACTION_MARKER}${character}` };
  }

  if (character === "\\" && isQuote(input[start + 1])) {
    const quote = input[start + 1] as '"' | "'";
    const end = findEscapedQuoteEnd(input, start, quote, quoteContext);
    if (end !== null) return { end, replacement: `\\${quote}${REDACTION_MARKER}\\${quote}` };
  }

  return {
    end: readUnquotedValueEnd(input, start, isSensitiveHeaderKey(key), quoteContext),
    replacement: REDACTION_MARKER,
  };
}

function readUnquotedValueEnd(input: string, start: number, header: boolean, quoteContext: '"' | "'" | null): number {
  if (header && quoteContext === null) return readHeaderValueEnd(input, start);
  let end = start;
  const markerEnd = input.startsWith(REDACTION_MARKER, start) ? start + REDACTION_MARKER.length : -1;
  while (end < input.length) {
    const character = input[end]!;
    if (quoteContext && character === quoteContext && !isEscapedAt(input, end)) break;
    if (character === "\r" || character === "\n") break;
    if (!header && ",;&}]".includes(character) && end >= markerEnd) break;
    if (isHorizontalWhitespace(character)) {
      let next = end;
      while (isHorizontalWhitespace(input[next])) next += 1;
      if (readTextAssignment(input, next, quoteContext)) break;
    }
    end += 1;
  }
  return end;
}

function readHeaderValueEnd(input: string, start: number): number {
  let cursor = start;
  while (true) {
    while (cursor < input.length && input[cursor] !== "\r" && input[cursor] !== "\n") cursor += 1;
    const lineEnd = cursor;
    if (cursor >= input.length) return cursor;
    cursor += input[cursor] === "\r" && input[cursor + 1] === "\n" ? 2 : 1;
    if (!isHorizontalWhitespace(input[cursor])) return lineEnd;
  }
}

function findRawQuoteEnd(input: string, start: number, quote: '"' | "'"): number | null {
  for (let cursor = start + 1; cursor < input.length; cursor += 1) {
    if (input[cursor] === quote && !isEscapedAt(input, cursor)) return cursor + 1;
  }
  return null;
}

function findEscapedQuoteEnd(
  input: string,
  start: number,
  quote: '"' | "'",
  quoteContext: '"' | "'" | null,
): number | null {
  for (let cursor = start + 2; cursor < input.length - 1; cursor += 1) {
    if (input[cursor] !== "\\" || input[cursor + 1] !== quote || input[cursor - 1] === "\\") continue;
    const end = cursor + 2;
    if (isEscapedValueBoundary(input, end, quoteContext)) return end;
  }
  return null;
}

function isEscapedValueBoundary(input: string, index: number, quoteContext: '"' | "'" | null): boolean {
  if (index >= input.length) return true;
  const character = input[index]!;
  if (quoteContext && character === quoteContext && !isEscapedAt(input, index)) return true;
  if (",;&\r\n}]".includes(character)) return true;
  if (!isHorizontalWhitespace(character)) return false;
  let next = index;
  while (isHorizontalWhitespace(input[next])) next += 1;
  return next >= input.length
    || Boolean(quoteContext && input[next] === quoteContext && !isEscapedAt(input, next))
    || readTextAssignment(input, next, quoteContext) !== null;
}

function isEscapedAt(input: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && input[cursor] === "\\"; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function isHorizontalWhitespace(character: string | undefined): boolean {
  return character === " " || character === "\t";
}

function isQuote(character: string | undefined): character is '"' | "'" {
  return character === '"' || character === "'";
}

function isKeyStart(character: string | undefined): boolean {
  return Boolean(character && /[A-Za-z_]/.test(character));
}

function isKeyCharacter(character: string | undefined): boolean {
  return Boolean(character && /[A-Za-z0-9_.-]/.test(character));
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
  const normalized = normalizeSensitiveKey(key);
  return SENSITIVE_KEY.test(normalized) || normalized === "session" || normalized === "session-token";
}

function isSensitiveHeaderKey(key: string): boolean {
  const normalized = normalizeSensitiveKey(key);
  return normalized.includes("authorization") || normalized.includes("cookie");
}

function normalizeSensitiveKey(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
