import { randomUUID } from "node:crypto";

import type { Page } from "playwright-core";

import type {
  OperationContext,
  WebMcpCaptureDetail,
  WebMcpCaptureTool,
  WebMcpDirectAction,
} from "../domain/types.js";
import {
  MAX_WEBMCP_ARGUMENT_BYTES,
  MAX_WEBMCP_ARGUMENT_DEPTH,
  MAX_WEBMCP_ARGUMENT_KEY_CHARS,
  MAX_WEBMCP_ARGUMENT_KEYS,
  MAX_WEBMCP_ARGUMENT_NODES,
  MAX_WEBMCP_ARGUMENT_STRING_BYTES,
  MAX_WEBMCP_DETAIL_BYTES,
  MAX_WEBMCP_RESULT_BYTES,
  MAX_WEBMCP_SCHEMA_BYTES,
  MAX_WEBMCP_TOOLS,
  MAX_WEBMCP_TOOL_DESCRIPTION_CHARS,
  MAX_WEBMCP_TOOL_NAME_CHARS,
  MAX_WEBMCP_TOOL_ORIGIN_CHARS,
  MAX_WEBMCP_TOOL_TITLE_CHARS,
} from "../domain/types.js";
import { WebDebugError } from "../core/errors.js";
import { boundText } from "../core/redaction.js";
import { originOf } from "../core/origin-policy.js";

type PageApiStatus =
  | { status: "unavailable" }
  | { status: "not-found" }
  | { status: "ambiguous" }
  | { status: "rejected" }
  | { status: "invalid-result" }
  | { status: "result-limit" }
  | { status: "ok"; result: string | null };

interface RawTool {
  origin?: unknown;
  name?: unknown;
  title?: unknown;
  description?: unknown;
  inputSchema?: unknown;
  annotations?: unknown;
  windowMatches?: unknown;
}

interface RawInspection {
  available: boolean;
  tools: RawTool[];
}

const serializedArgumentsCache = new WeakMap<object, string>();

export interface WebMcpArgumentValidation {
  strings: string[];
}

/**
 * WebMCP is a page-provided API. This class deliberately keeps all browser
 * objects inside the selected Playwright page and never treats page metadata
 * as trusted instructions or as replayable state.
 */
export class WebMcpPageApi {
  constructor(private readonly page: Page) {}

  async inspect(context: OperationContext = {}): Promise<WebMcpCaptureDetail | null> {
    const observedAt = new Date().toISOString();
    const raw = await withContext(this.page.evaluate(async () => {
      const modelContext = (document as Document & { modelContext?: unknown }).modelContext as {
        getTools?: () => Promise<unknown>;
      } | undefined;
      if (!modelContext || typeof modelContext.getTools !== "function") return { available: false, tools: [] } satisfies RawInspection;
      try {
        const tools = await modelContext.getTools();
        if (!Array.isArray(tools)) return { available: true, tools: [] } satisfies RawInspection;
        return {
          available: true,
          tools: tools.map((tool) => {
            if (!tool || typeof tool !== "object") return {};
            const candidate = tool as {
              origin?: unknown;
              name?: unknown;
              title?: unknown;
              description?: unknown;
              inputSchema?: unknown;
              annotations?: unknown;
              window?: unknown;
            };
            const annotations = candidate.annotations && typeof candidate.annotations === "object"
              ? candidate.annotations as { readOnlyHint?: unknown; untrustedContentHint?: unknown }
              : undefined;
            return {
              origin: typeof candidate.origin === "string" ? candidate.origin.slice(0, 2_049) : candidate.origin,
              name: typeof candidate.name === "string" ? candidate.name.slice(0, 101) : candidate.name,
              title: typeof candidate.title === "string" ? candidate.title.slice(0, 201) : candidate.title,
              description: typeof candidate.description === "string" ? candidate.description.slice(0, 501) : candidate.description,
              inputSchema: typeof candidate.inputSchema === "string" ? candidate.inputSchema.slice(0, 8_193) : candidate.inputSchema,
              annotations: {
                readOnlyHint: typeof annotations?.readOnlyHint === "boolean" ? annotations.readOnlyHint : null,
                untrustedContentHint: typeof annotations?.untrustedContentHint === "boolean" ? annotations.untrustedContentHint : null,
              },
              windowMatches: candidate.window === window,
            } satisfies RawTool;
          }),
        } satisfies RawInspection;
      } catch {
        return { available: false, tools: [] } satisfies RawInspection;
      }
    }), context);
    if (!raw.available) return null;

    const tools: WebMcpCaptureTool[] = [];
    let truncated = raw.tools.length > MAX_WEBMCP_TOOLS;
    for (const candidate of raw.tools) {
      const projected = projectTool(candidate);
      if (!projected) {
        truncated = true;
        continue;
      }
      tools.push(projected);
    }
    tools.sort((first, second) => lexicalCompare(first.origin, second.origin) || lexicalCompare(first.name, second.name));
    if (tools.length > MAX_WEBMCP_TOOLS) {
      tools.length = MAX_WEBMCP_TOOLS;
      truncated = true;
    }
    const detail: WebMcpCaptureDetail = {
      provenance: "webmcp-page-api",
      observedAt,
      total: raw.tools.length,
      truncated,
      tools,
    };
    pruneDetail(detail);
    return detail;
  }

  async execute(action: WebMcpDirectAction, context: OperationContext = {}): Promise<string | null> {
    if (context.signal?.aborted) throw new WebDebugError("REQUEST_CANCELLED", "The request was cancelled.");
    validateWebMcpAction(action);
    const argumentsValidation = validateWebMcpArguments(action.arguments);
    if (!argumentsValidation.valid) throw new WebDebugError(argumentsValidation.code, argumentsValidation.message);
    const argumentsJson = argumentsValidation.argumentsJson;
    const pageOrigin = this.currentOrigin();
    if (pageOrigin !== action.origin) throw new WebDebugError("NAVIGATION_ORIGIN_BLOCKED", "The selected page origin no longer matches the WebMCP action origin.");

    const timeoutMs = action.timeoutMs ?? 30_000;
    const deadline = Math.min(context.deadline ?? Number.POSITIVE_INFINITY, performance.now() + timeoutMs);
    if (deadline <= performance.now()) throw new WebDebugError("VERIFICATION_DEADLINE_EXCEEDED", "The bounded operation deadline was exhausted.");
    const requestId = randomUUID();
    const abortKey = `__web_debug_webmcp_abort_${requestId.replace(/-/g, "")}`;
    const aborter = async (): Promise<void> => {
      await this.page.evaluate((key) => {
        const candidate = (globalThis as Record<string, unknown>)[key];
        if (typeof candidate === "function") (candidate as () => void)();
      }, abortKey).catch(() => undefined);
    };
    const onAbort = () => { void aborter(); };
    context.signal?.addEventListener("abort", onAbort, { once: true });
    let result: PageApiStatus;
    try {
      const pageExecution = this.page.evaluate(async ({ name, origin, argumentsJson: json, abortKey }) => {
        const modelContext = (document as Document & { modelContext?: unknown }).modelContext as {
          getTools?: () => Promise<unknown>;
          executeTool?: (tool: unknown, args: string, options?: { signal?: AbortSignal }) => Promise<unknown>;
        } | undefined;
        if (!modelContext || typeof modelContext.getTools !== "function" || typeof modelContext.executeTool !== "function") return { status: "unavailable" } satisfies PageApiStatus;
        const controller = new AbortController();
        (globalThis as Record<string, unknown>)[abortKey] = () => controller.abort();
        try {
          let tools: unknown;
          try { tools = await modelContext.getTools(); } catch { return { status: "unavailable" } satisfies PageApiStatus; }
          if (!Array.isArray(tools)) return { status: "unavailable" } satisfies PageApiStatus;
          const matches = tools.filter((tool) => {
            if (!tool || typeof tool !== "object") return false;
            const candidate = tool as { origin?: unknown; name?: unknown; window?: unknown };
            return candidate.origin === origin && candidate.name === name;
          });
          const topLevelMatches = matches.filter((tool) => (tool as { window?: unknown }).window === window);
          if (topLevelMatches.length === 0) return { status: "not-found" } satisfies PageApiStatus;
          if (matches.length > 1 || topLevelMatches.length > 1) return { status: "ambiguous" } satisfies PageApiStatus;
          try {
            const initialUrl = location.href;
            const value = await modelContext.executeTool(topLevelMatches[0], json, { signal: controller.signal });
            if (value === null) return location.href !== initialUrl ? { status: "ok", result: null } satisfies PageApiStatus : { status: "invalid-result" } satisfies PageApiStatus;
            if (typeof value === "string") {
              if (new TextEncoder().encode(value).byteLength > 8_192) return { status: "result-limit" } satisfies PageApiStatus;
              return { status: "ok", result: value } satisfies PageApiStatus;
            }
            return { status: "invalid-result" } satisfies PageApiStatus;
          } catch {
            return { status: "rejected" } satisfies PageApiStatus;
          }
        } finally {
          delete (globalThis as Record<string, unknown>)[abortKey];
        }
      }, { name: action.name, origin: action.origin, argumentsJson, abortKey });
      trackPending(pageExecution, context);
      result = await withContext(pageExecution, { ...context, deadline });
    } catch (error) {
      if (error instanceof WebDebugError && error.code === "VERIFICATION_DEADLINE_EXCEEDED" && !context.signal?.aborted) {
        await aborter();
        throw new WebDebugError("WEBMCP_EXECUTION_REJECTED", "The WebMCP tool execution was rejected or timed out.");
      }
      throw error;
    } finally {
      context.signal?.removeEventListener("abort", onAbort);
      const finalOrigin = this.currentOrigin();
      if (finalOrigin !== pageOrigin || finalOrigin !== action.origin) {
        throw new WebDebugError("NAVIGATION_ORIGIN_BLOCKED", "The selected page origin changed during the WebMCP action.");
      }
    }

    switch (result.status) {
      case "unavailable": throw new WebDebugError("WEBMCP_UNAVAILABLE", "The selected page does not expose a callable WebMCP API.");
      case "not-found": throw new WebDebugError("WEBMCP_TOOL_NOT_FOUND", "The requested WebMCP tool was not found on the selected page.");
      case "ambiguous": throw new WebDebugError("WEBMCP_TOOL_AMBIGUOUS", "The requested WebMCP tool was registered more than once on the selected page.");
      case "rejected": throw new WebDebugError("WEBMCP_EXECUTION_REJECTED", "The WebMCP tool execution was rejected or timed out.");
      case "invalid-result": throw new WebDebugError("WEBMCP_RESULT_INVALID", "The WebMCP tool returned a result outside the supported string-or-null contract.");
      case "result-limit": throw new WebDebugError("WEBMCP_RESULT_LIMIT", "The WebMCP tool result exceeded the 8,192-byte limit.");
      case "ok":
        if (result.result !== null && Buffer.byteLength(result.result, "utf8") > MAX_WEBMCP_RESULT_BYTES) throw new WebDebugError("WEBMCP_RESULT_LIMIT", "The WebMCP tool result exceeded the 8,192-byte limit.");
        return result.result;
    }
  }

  private currentOrigin(): string {
    try { return originOf(this.page.url()); }
    catch { return ""; }
  }
}

export function validateWebMcpAction(action: WebMcpDirectAction): WebMcpArgumentValidation {
  if (!action || action.kind !== "webmcp") throw new WebDebugError("WEBMCP_ARGUMENTS_INVALID", "The browser action is not a WebMCP direct action.");
  if (typeof action.origin !== "string" || !isCanonicalOrigin(action.origin)) throw new WebDebugError("WEBMCP_ARGUMENTS_INVALID", "WebMCP action origin must be a canonical HTTP or HTTPS origin.");
  if (typeof action.name !== "string" || action.name.length === 0 || action.name.length > MAX_WEBMCP_TOOL_NAME_CHARS) throw new WebDebugError("WEBMCP_ARGUMENTS_INVALID", "WebMCP tool names must be bounded non-empty strings.");
  if (action.allowSideEffects !== true) throw new WebDebugError("WEBMCP_ARGUMENTS_INVALID", "WebMCP direct actions require allowSideEffects=true.");
  if (action.timeoutMs !== undefined && (!Number.isInteger(action.timeoutMs) || action.timeoutMs < 1 || action.timeoutMs > 30_000)) throw new WebDebugError("WEBMCP_ARGUMENTS_INVALID", "WebMCP timeouts must be integers from 1 to 30,000 milliseconds.");
  const shape = validateWebMcpArguments(action.arguments);
  if (!shape.valid) throw new WebDebugError(shape.code, shape.message);
  return { strings: shape.strings };
}

export function validateWebMcpArguments(value: unknown):
  | { valid: true; argumentsJson: string; strings: string[] }
  | { valid: false; code: "WEBMCP_ARGUMENTS_INVALID" | "WEBMCP_ARGUMENTS_LIMIT"; message: string } {
  const strings: string[] = [];
  const seen = new WeakSet<object>();
  let nodes = 0;
  const visit = (candidate: unknown, depth: number, key?: string): boolean => {
    if (depth > MAX_WEBMCP_ARGUMENT_DEPTH) throw new WebDebugError("WEBMCP_ARGUMENTS_LIMIT", "WebMCP arguments exceeded the maximum nesting depth.");
    if (typeof candidate === "string") {
      if (Buffer.byteLength(candidate, "utf8") > MAX_WEBMCP_ARGUMENT_STRING_BYTES) throw new WebDebugError("WEBMCP_ARGUMENTS_LIMIT", "A WebMCP argument string exceeded the 2,000-byte limit.");
      strings.push(candidate);
      nodes += 1;
      if (nodes > MAX_WEBMCP_ARGUMENT_NODES) throw new WebDebugError("WEBMCP_ARGUMENTS_LIMIT", "WebMCP arguments exceeded the aggregate node limit.");
      return true;
    }
    if (candidate === null || typeof candidate === "boolean" || typeof candidate === "number") {
      if (typeof candidate === "number" && !Number.isFinite(candidate)) throw new WebDebugError("WEBMCP_ARGUMENTS_INVALID", "WebMCP arguments must contain JSON values only.");
      nodes += 1;
      if (nodes > MAX_WEBMCP_ARGUMENT_NODES) throw new WebDebugError("WEBMCP_ARGUMENTS_LIMIT", "WebMCP arguments exceeded the aggregate node limit.");
      return true;
    }
    if (!candidate || typeof candidate !== "object") throw new WebDebugError("WEBMCP_ARGUMENTS_INVALID", "WebMCP arguments must be a JSON object.");
    if (seen.has(candidate)) throw new WebDebugError("WEBMCP_ARGUMENTS_INVALID", "WebMCP arguments must not contain circular references.");
    const prototype = Object.getPrototypeOf(candidate);
    if (!Array.isArray(candidate) && prototype !== Object.prototype && prototype !== null) throw new WebDebugError("WEBMCP_ARGUMENTS_INVALID", "WebMCP arguments must contain JSON values only.");
    seen.add(candidate);
    nodes += 1;
    if (nodes > MAX_WEBMCP_ARGUMENT_NODES) throw new WebDebugError("WEBMCP_ARGUMENTS_LIMIT", "WebMCP arguments exceeded the aggregate node limit.");
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item, depth + 1);
    } else {
      const entries = Object.entries(candidate);
      if (entries.length > MAX_WEBMCP_ARGUMENT_KEYS) throw new WebDebugError("WEBMCP_ARGUMENTS_LIMIT", "A WebMCP argument object exceeded the 64-key limit.");
      if (Object.getOwnPropertySymbols(candidate).length > 0) throw new WebDebugError("WEBMCP_ARGUMENTS_INVALID", "WebMCP arguments must contain JSON values only.");
      for (const [childKey, child] of entries) {
        if (childKey.length > MAX_WEBMCP_ARGUMENT_KEY_CHARS) throw new WebDebugError("WEBMCP_ARGUMENTS_LIMIT", "A WebMCP argument key exceeded the 100-character limit.");
        visit(child, depth + 1, childKey);
      }
    }
    seen.delete(candidate);
    return true;
  };

  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, code: "WEBMCP_ARGUMENTS_INVALID", message: "WebMCP arguments must be a JSON object." };
    if (Object.keys(value).length > MAX_WEBMCP_ARGUMENT_KEYS) return { valid: false, code: "WEBMCP_ARGUMENTS_LIMIT", message: "WebMCP arguments exceeded the 64-key limit." };
    visit(value, 0);
    const cached = serializedArgumentsCache.get(value);
    const argumentsJson = cached ?? JSON.stringify(value);
    if (typeof argumentsJson !== "string") return { valid: false, code: "WEBMCP_ARGUMENTS_INVALID", message: "WebMCP arguments must be serializable JSON." };
    if (Buffer.byteLength(argumentsJson, "utf8") > MAX_WEBMCP_ARGUMENT_BYTES) return { valid: false, code: "WEBMCP_ARGUMENTS_LIMIT", message: "WebMCP arguments exceeded the 16,384-byte limit." };
    if (!cached) serializedArgumentsCache.set(value, argumentsJson);
    return { valid: true, argumentsJson, strings };
  } catch (error) {
    if (error instanceof WebDebugError) return { valid: false, code: error.code as "WEBMCP_ARGUMENTS_INVALID" | "WEBMCP_ARGUMENTS_LIMIT", message: error.message };
    return { valid: false, code: "WEBMCP_ARGUMENTS_INVALID", message: "WebMCP arguments must be serializable JSON." };
  }
}

function projectTool(candidate: RawTool): WebMcpCaptureTool | null {
  if (typeof candidate.origin !== "string" || typeof candidate.name !== "string") return null;
  if (!isCanonicalOrigin(candidate.origin)) return null;
  if (candidate.origin.length > MAX_WEBMCP_TOOL_ORIGIN_CHARS || candidate.name.length === 0 || candidate.name.length > MAX_WEBMCP_TOOL_NAME_CHARS) return null;
  const annotations = candidate.annotations && typeof candidate.annotations === "object" ? candidate.annotations as { readOnlyHint?: unknown; untrustedContentHint?: unknown } : {};
  const inputSchemaJson = canonicalSchema(candidate.inputSchema);
  return {
    origin: candidate.origin,
    name: candidate.name,
    title: typeof candidate.title === "string" ? boundText(candidate.title, MAX_WEBMCP_TOOL_TITLE_CHARS) : null,
    description: typeof candidate.description === "string" ? boundText(candidate.description, MAX_WEBMCP_TOOL_DESCRIPTION_CHARS) : "",
    inputSchemaJson,
    annotations: {
      readOnlyHint: typeof annotations.readOnlyHint === "boolean" ? annotations.readOnlyHint : null,
      untrustedContentHint: typeof annotations.untrustedContentHint === "boolean" ? annotations.untrustedContentHint : null,
    },
    untrusted: true,
  };
}

function canonicalSchema(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (Buffer.byteLength(value, "utf8") > MAX_WEBMCP_SCHEMA_BYTES) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    const canonical = JSON.stringify(parsed);
    return Buffer.byteLength(canonical, "utf8") <= MAX_WEBMCP_SCHEMA_BYTES ? canonical : null;
  } catch {
    return null;
  }
}

function lexicalCompare(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function pruneDetail(detail: WebMcpCaptureDetail): void {
  const serialized = () => Buffer.byteLength(JSON.stringify(detail), "utf8");
  if (serialized() <= MAX_WEBMCP_DETAIL_BYTES) return;
  detail.truncated = true;
  for (let index = detail.tools.length - 1; index >= 0 && serialized() > MAX_WEBMCP_DETAIL_BYTES; index -= 1) detail.tools[index]!.inputSchemaJson = null;
  for (let index = detail.tools.length - 1; index >= 0 && serialized() > MAX_WEBMCP_DETAIL_BYTES; index -= 1) detail.tools[index]!.description = "";
  while (detail.tools.length > 0 && serialized() > MAX_WEBMCP_DETAIL_BYTES) detail.tools.pop();
}

function isCanonicalOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin === value && !parsed.username && !parsed.password && parsed.pathname === "/" && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

function trackPending<T>(promise: Promise<T>, context: OperationContext): Promise<T> {
  if (!context.pending) return promise;
  const settled = promise.then(() => undefined, () => undefined);
  context.pending.add(settled);
  void settled.then(() => context.pending?.delete(settled));
  return promise;
}

async function withContext<T>(promise: Promise<T>, context: OperationContext): Promise<T> {
  if (context.signal?.aborted) throw new WebDebugError("REQUEST_CANCELLED", "The request was cancelled.");
  const remainingMs = context.deadline === undefined ? undefined : Math.max(0, context.deadline - performance.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => {
    onAbort = () => reject(new WebDebugError("REQUEST_CANCELLED", "The request was cancelled."));
    context.signal?.addEventListener("abort", onAbort, { once: true });
    if (remainingMs !== undefined) timer = setTimeout(() => reject(new WebDebugError("VERIFICATION_DEADLINE_EXCEEDED", "The bounded operation deadline was exhausted.")), remainingMs);
  });
  try { return await Promise.race([promise, cancellation]); }
  finally {
    if (onAbort) context.signal?.removeEventListener("abort", onAbort);
    if (timer) clearTimeout(timer);
    promise.catch(() => undefined);
  }
}
