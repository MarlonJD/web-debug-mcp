import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { performance } from "node:perf_hooks";

import { WebDebugError } from "../core/errors.js";
import { boundText } from "../core/redaction.js";
import { PACKAGE_NAME, PACKAGE_VERSION } from "../core/version.js";
import type { OperationContext } from "../domain/types.js";

const MAX_MESSAGE_BYTES = 256 * 1024;
const TOOLS = ["list_tabs", "create_tab", "close_tab", "switch_tab", "navigate_to_url", "page_info", "get_page_content", "evaluate_javascript", "page_interactions", "browser_console_messages", "list_network_requests", "screenshot", "set_viewport_size"] as const;
export type SafariTool = typeof TOOLS[number];

export interface SafariClient {
  connect(context?: OperationContext): Promise<void>;
  call<T = unknown>(name: SafariTool, args?: Record<string, unknown>, context?: OperationContext): Promise<T>;
  isConnected(): boolean;
  close(): Promise<void>;
}

/** The official, local Safari 27 Inspector bridge. No HTTP listener or second browser owner. */
export class SafariMcpClient implements SafariClient {
  private readonly client = new Client({ name: PACKAGE_NAME, version: PACKAGE_VERSION });
  private transport: StdioClientTransport | null = null;
  private connected = false;

  constructor(private readonly driverPath = process.env.WEB_DEBUG_SAFARIDRIVER_PATH ?? "safaridriver") {
    this.client.onclose = () => { this.connected = false; };
  }

  isConnected(): boolean { return this.connected; }

  async connect(context: OperationContext = {}): Promise<void> {
    this.transport = new StdioClientTransport({ command: this.driverPath, args: ["--mcp"], stderr: "ignore", maxBufferSize: MAX_MESSAGE_BYTES });
    try {
      await this.client.connect(this.transport, requestOptions(context));
      const catalog = await this.client.listTools({}, requestOptions(context));
      const names = new Set(catalog.tools.map(tool => tool.name));
      if (TOOLS.some(name => !names.has(name))) throw new WebDebugError("SAFARI_MCP_UNAVAILABLE", "Safari must provide the native MCP browser and Inspector tools. Use Safari 27 or newer with remote automation enabled.");
      this.connected = true;
    } catch (error) {
      await this.close();
      throw safariError(error, context, true);
    }
  }

  async call<T>(name: SafariTool, args: Record<string, unknown> = {}, context: OperationContext = {}): Promise<T> {
    if (!this.connected) throw new WebDebugError("SESSION_NOT_READY", "The Safari MCP session is disconnected.");
    try {
      const result = CallToolResultSchema.parse(await this.client.callTool({ name, arguments: args }, undefined, requestOptions(context)));
      if (Buffer.byteLength(JSON.stringify(result)) > MAX_MESSAGE_BYTES) throw new WebDebugError("UPSTREAM_RESPONSE_LIMIT_EXCEEDED", "Safari MCP exceeded the bounded response limit.");
      const text = result.content.filter(item => item.type === "text").map(item => item.text).join("\n");
      if (result.isError) throw new WebDebugError("SAFARI_MCP_COMMAND_FAILED", boundText(text, 500));
      try { return JSON.parse(text) as T; }
      catch { return text as T; }
    } catch (error) {
      if (context.signal?.aborted || (error instanceof McpError && error.code === ErrorCode.RequestTimeout)) await this.close();
      throw safariError(error, context, false);
    }
  }

  async close(): Promise<void> {
    this.connected = false;
    await this.client.close();
    this.transport = null;
  }
}

function requestOptions(context: OperationContext) {
  if (context.signal?.aborted) throw new WebDebugError("REQUEST_CANCELLED", "The Safari request was cancelled.");
  const timeout = Math.min(5_000, context.deadline === undefined ? 5_000 : context.deadline - performance.now());
  if (timeout <= 0) throw new WebDebugError("VERIFICATION_DEADLINE_EXCEEDED", "The bounded operation deadline was exhausted.");
  return { timeout, signal: context.signal };
}

function safariError(error: unknown, context: OperationContext, startup: boolean): WebDebugError {
  if (context.signal?.aborted) return new WebDebugError("REQUEST_CANCELLED", "The Safari request was cancelled.");
  if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) return new WebDebugError("SAFARI_MCP_TIMEOUT", "Safari exceeded the bounded request deadline. Enable remote automation and external agents. If normal Safari prevents startup, quit it while keeping windows only with user approval; release other client-owned automation sessions.");
  const message = error instanceof Error ? error.message : String(error);
  if (/already paired|already attached|another WebDriver session/i.test(message)) return new WebDebugError("SAFARI_SESSION_IN_USE", "Safari is paired with another automation client. End that client-owned session before starting Web Debug.");
  if (error instanceof WebDebugError) return error;
  return new WebDebugError(startup ? "SAFARI_MCP_UNAVAILABLE" : "SAFARI_MCP_COMMAND_FAILED", boundText(message, 500));
}
