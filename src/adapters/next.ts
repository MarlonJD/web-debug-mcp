import { boundText, redactValue, safeUrl } from "../core/redaction.js";
import type { NextSnapshot } from "../domain/types.js";

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

export class NextAdapter {
  async snapshot(baseUrl: string): Promise<NextSnapshot | null> {
    const endpoint = new URL("/_next/mcp", baseUrl).toString();
    const client = new NextMcpClient(endpoint);
    const listed = await client.request("tools/list", {});
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
      const result = await client.callTool(toolName);
      values.set(toolName, result.value);
      if (result.warning) warnings.push(result.warning);
    }

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
      warnings,
    };
  }
}

class NextMcpClient {
  private requestId = 0;
  private sessionId: string | null = null;

  constructor(private readonly endpoint: string) {}

  async request(method: string, params: Record<string, unknown>): Promise<RpcResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
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
    }
  }

  async callTool(name: string): Promise<ToolResult> {
    try {
      const response = await this.request("tools/call", { name, arguments: {} });
      return parseToolResult(name, response.result);
    } catch (error) {
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
