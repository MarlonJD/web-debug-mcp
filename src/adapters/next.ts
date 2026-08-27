import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { open, realpath } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { boundText, redactValue, safeUrl } from "../core/redaction.js";
import type { NetworkEntry, NextInspection, NextInspectionResult, NextRequestTrace, NextSnapshot, OperationContext } from "../domain/types.js";

interface RpcResponse {
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

interface ToolResult {
  value: unknown | null;
  warning?: string;
}

const OPTIONAL_TOOLS = [
  "get_project_metadata",
  "get_errors",
  "get_routes",
  "get_logs",
  "get_compilation_issues",
  "get_page_metadata",
  "get_request_insights",
] as const;

const MAX_LOG_BYTES = 64 * 1024;
const MAX_LOG_LINES = 200;
const MAX_LOG_CHARS = 32_000;

export class NextAdapter {
  async snapshot(baseUrl: string, projectRoot?: string, network: NetworkEntry[] = [], context: OperationContext = {}): Promise<NextSnapshot | null> {
    const endpoint = new URL("/_next/mcp", baseUrl).toString();
    const client = new NextMcpClient(endpoint);
    const listed = await client.request("tools/list", {}, context);
    const tools = extractToolNames(listed.result);
    if (tools.length === 0) return null;

    const warnings: string[] = [];
    const values = new Map<string, unknown | null>();
    for (const toolName of OPTIONAL_TOOLS) {
      if (!tools.includes(toolName)) {
        warnings.push(`Next runtime tool is not advertised: ${toolName}`);
        values.set(toolName, null);
        continue;
      }
      const result = await client.callTool(toolName, {}, context);
      values.set(toolName, result.value);
      if (result.warning) warnings.push(result.warning);
    }

    const logTail = projectRoot
      ? await readLogTail(values.get("get_logs"), projectRoot, warnings)
      : null;
    const requestTraces = extractRequestTraces(values.get("get_request_insights"));
    const serverActionExecutions = await resolveExecutedServerActions(client, tools, network, requestTraces, warnings, context);

    return {
      detected: true,
      endpoint: safeUrl(endpoint),
      tools,
      projectMetadata: values.get("get_project_metadata") ?? null,
      errors: values.get("get_errors") ?? null,
      routes: values.get("get_routes") ?? null,
      logs: values.get("get_logs") ?? null,
      compilationIssues: values.get("get_compilation_issues") ?? null,
      pageMetadata: values.get("get_page_metadata") ?? null,
      requestInsights: values.get("get_request_insights") ?? null,
      requestTraces,
      logTail,
      serverActionExecutions,
      warnings,
    };
  }

  async inspect(baseUrl: string, inspection: NextInspection, context: OperationContext = {}): Promise<NextInspectionResult> {
    const endpoint = new URL("/_next/mcp", baseUrl).toString();
    const client = new NextMcpClient(endpoint);
    const listed = await client.request("tools/list", {}, context);
    const tools = extractToolNames(listed.result);
    const warnings: string[] = [];
    const toolName = inspection.kind === "compileRoute" ? "compile_route" : "get_server_action_by_id";
    if (!tools.includes(toolName)) {
      warnings.push(`Next runtime tool is not advertised: ${toolName}`);
      return { detected: true, endpoint: safeUrl(endpoint), kind: inspection.kind, result: null, warnings };
    }

    let args: Record<string, unknown>;
    if (inspection.kind === "resolveServerAction") {
      args = { actionId: inspection.actionId };
    } else {
      const hasRouteSpecifier = Boolean(inspection.routeSpecifier);
      const hasPath = Boolean(inspection.path);
      if (hasRouteSpecifier === hasPath) {
        throw new Error("Next route compilation requires exactly one of routeSpecifier or path.");
      }
      args = hasRouteSpecifier ? { routeSpecifier: inspection.routeSpecifier } : { path: inspection.path };
    }

    const result = await client.callTool(toolName, args, context);
    if (result.warning) warnings.push(result.warning);
    return {
      detected: true,
      endpoint: safeUrl(endpoint),
      kind: inspection.kind,
      result: result.value,
      warnings,
    };
  }
}

async function resolveExecutedServerActions(
  client: NextMcpClient,
  tools: string[],
  network: NetworkEntry[],
  requestTraces: NextRequestTrace[],
  warnings: string[],
  context: OperationContext = {},
): Promise<NextSnapshot["serverActionExecutions"]> {
  const requests = network.filter((entry) => entry.nextActionId).slice(-10);
  if (requests.length === 0) return [];
  const executions: NextSnapshot["serverActionExecutions"] = [];
  const seen = new Set<string>();
  for (const request of requests) {
    const actionId = request.nextActionId;
    if (!actionId || seen.has(actionId)) continue;
    seen.add(actionId);
    if (!tools.includes("get_server_action_by_id")) {
      const warning = "Next runtime tool is not advertised: get_server_action_by_id";
      warnings.push(warning);
      executions.push({ actionId, request: actionRequest(request), resolution: null, trace: findActionTrace(requestTraces, request), warning });
      continue;
    }
    const result = await client.callTool("get_server_action_by_id", { actionId }, context);
    if (result.warning) warnings.push(result.warning);
    executions.push({
      actionId,
      request: actionRequest(request),
      resolution: result.value,
      trace: findActionTrace(requestTraces, request),
      ...(result.warning ? { warning: result.warning } : {}),
    });
  }
  return executions;
}

function extractRequestTraces(value: unknown): NextRequestTrace[] {
  if (!isRecord(value) || !Array.isArray(value.requests)) return [];
  return value.requests.flatMap((request): NextRequestTrace[] => {
    if (!isRecord(request) || typeof request.requestId !== "string") return [];
    const spans = Array.isArray(request.spans)
      ? request.spans.flatMap((span): NextRequestTrace["spans"] => {
        if (!isRecord(span)) return [];
        return [{
          name: boundedString(span.name, "span", 300),
          startTime: finiteNumber(span.startTime),
          durationMs: finiteNumber(span.durationMs),
          status: nullableString(span.status, 100),
          traceId: nullableString(span.traceId, 200),
          spanId: nullableString(span.spanId, 200),
          parentSpanId: nullableString(span.parentSpanId, 200),
          attributes: isRecord(span.attributes) ? redactValue(span.attributes) as Record<string, unknown> : {},
        }];
      }).slice(0, 100)
      : [];
    return [{
      requestId: boundText(request.requestId, 200),
      kind: nullableString(request.kind, 100),
      route: nullableString(request.route, 500),
      url: typeof request.url === "string" ? safeUrl(boundText(request.url, 2_000)) : null,
      status: nullableString(request.status, 100),
      startTime: finiteNumber(request.startTime),
      durationMs: finiteNumber(request.durationMs),
      spans,
      fetches: Array.isArray(request.fetches) ? request.fetches.slice(0, 50).map((fetch) => redactValue(fetch)) : [],
    }];
  }).slice(-50);
}

function findActionTrace(traces: NextRequestTrace[], request: NetworkEntry): NextRequestTrace | null {
  let pathname: string | null = null;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    // A malformed trace URL cannot be correlated to a browser request.
  }
  const candidates = traces.filter((trace) => trace.route === pathname || trace.url === pathname);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (candidate?.spans.some((span) => span.name === request.method || span.attributes["http.method"] === request.method)) return copyRequestTrace(candidate);
  }
  return candidates.at(-1) ? copyRequestTrace(candidates.at(-1)!) : null;
}

function copyRequestTrace(trace: NextRequestTrace): NextRequestTrace {
  return {
    ...trace,
    spans: trace.spans.map((span) => ({
      ...span,
      attributes: redactValue(span.attributes) as Record<string, unknown>,
    })),
    fetches: trace.fetches.map((fetch) => redactValue(fetch)),
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableString(value: unknown, maxChars: number): string | null {
  return typeof value === "string" ? boundText(value, maxChars) : null;
}

function boundedString(value: unknown, fallback: string, maxChars: number): string {
  return typeof value === "string" ? boundText(value, maxChars) : fallback;
}

function actionRequest(entry: NetworkEntry) {
  return {
    requestId: entry.requestId,
    method: entry.method,
    url: entry.url,
    status: entry.status,
    ok: entry.ok,
  };
}

async function readLogTail(
  value: unknown,
  projectRoot: string,
  warnings: string[],
): Promise<NonNullable<NextSnapshot["logTail"]> | null> {
  if (!isRecord(value) || typeof value.logFilePath !== "string") return null;

  let rootPath: string;
  let logPath: string;
  try {
    rootPath = await realpath(resolve(projectRoot));
    logPath = await realpath(resolve(value.logFilePath));
  } catch {
    warnings.push("Next development log tail is unavailable because the returned log file could not be resolved.");
    return null;
  }

  const relativePath = relative(rootPath, logPath);
  if (!relativePath || isAbsolute(relativePath) || relativePath.startsWith(`..${sep}`) || basename(logPath) !== "next-development.log") {
    warnings.push("Next development log tail was skipped because the returned log file is outside the project boundary.");
    return null;
  }

  let handle;
  try {
    handle = await open(logPath, "r");
    const size = (await handle.stat()).size;
    const length = Math.min(size, MAX_LOG_BYTES);
    const buffer = Buffer.alloc(length);
    if (length > 0) await handle.read(buffer, 0, length, Math.max(0, size - length));
    const rawText = buffer.toString("utf8");
    const lines = rawText.split(/\r?\n/);
    const truncated = size > MAX_LOG_BYTES || lines.length > MAX_LOG_LINES;
    const text = boundText(lines.slice(-MAX_LOG_LINES).join("\n"), MAX_LOG_CHARS);
    return {
      file: relativePath.split(sep).join("/"),
      text,
      truncated,
    };
  } catch (error) {
    warnings.push(`Next development log tail unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`);
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

class NextMcpClient {
  private requestId = 0;
  private sessionId: string | null = null;

  constructor(private readonly endpoint: string) {}

  async request(method: string, params: Record<string, unknown>, context: OperationContext = {}): Promise<RpcResponse> {
    const controller = new AbortController();
    const remainingMs = context.deadline === undefined ? 3_000 : Math.max(1, Math.min(3_000, context.deadline - performance.now()));
    const timeout = setTimeout(() => controller.abort(), remainingMs);
    const onAbort = () => controller.abort();
    context.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.requestId, method, params }),
        signal: controller.signal,
      });
      const responseSessionId = response.headers.get("mcp-session-id");
      if (responseSessionId) this.sessionId = responseSessionId;
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`Next MCP endpoint returned HTTP ${response.status}: ${boundText(body, 500)}`);
      }
      const payload = parseJsonRpcBody(body);
      if (!payload) throw new Error("Next MCP endpoint returned no JSON-RPC message.");
      if (payload.error) {
        throw new Error(`Next MCP ${method} failed: ${payload.error.message ?? "unknown error"}`);
      }
      return payload;
    } finally {
      clearTimeout(timeout);
      context.signal?.removeEventListener("abort", onAbort);
    }
  }

  async callTool(name: string, args: Record<string, unknown> = {}, context: OperationContext = {}): Promise<ToolResult> {
    try {
      const response = await this.request("tools/call", { name, arguments: args }, context);
      return parseToolResult(name, response.result);
    } catch (error) {
      if (context.signal?.aborted) throw error;
      return {
        value: null,
        warning: `Next runtime tool ${name} unavailable: ${boundText(error instanceof Error ? error.message : String(error), 500)}`,
      };
    }
  }
}

function parseJsonRpcBody(body: string): RpcResponse | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isRecord(parsed) ? (parsed as RpcResponse) : null;
  } catch {
    const dataLines = trimmed
      .replaceAll("\r\n", "\n")
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter(Boolean);
    const lastData = dataLines.at(-1);
    if (!lastData) return null;
    try {
      const parsed: unknown = JSON.parse(lastData);
      return isRecord(parsed) ? (parsed as RpcResponse) : null;
    } catch {
      return null;
    }
  }
}

function parseToolResult(name: string, result: unknown): ToolResult {
  if (!isRecord(result)) return { value: redactValue(result) };
  const content = Array.isArray(result.content) ? result.content : [];
  const textContent = content.find((item) => isRecord(item) && item.type === "text");
  const text = isRecord(textContent) && typeof textContent.text === "string" ? textContent.text : null;
  if (!text) return { value: redactValue(result) };

  let value: unknown = text;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  if (isRecord(value) && typeof value.error === "string") {
    return { value: null, warning: `Next runtime tool ${name}: ${boundText(value.error, 500)}` };
  }
  return { value: redactValue(value) };
}

function extractToolNames(result: unknown): string[] {
  if (!isRecord(result) || !Array.isArray(result.tools)) return [];
  return result.tools
    .filter((tool): tool is Record<string, unknown> => isRecord(tool) && typeof tool.name === "string")
    .map((tool) => tool.name as string)
    .slice(0, 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
