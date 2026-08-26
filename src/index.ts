import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import type { BrowserAction, ScenarioCheck } from "./domain/types.js";
import { WebDebugError, errorMessage } from "./core/errors.js";
import { SessionManager } from "./core/session-manager.js";

const DEFAULT_PROJECT_ROOT = process.cwd();

const browserActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("navigate"), url: z.string().url() }),
  z.object({ kind: z.literal("click"), selector: z.string().min(1).max(500) }),
  z.object({ kind: z.literal("fill"), selector: z.string().min(1).max(500), value: z.string().max(10_000) }),
  z.object({
    kind: z.literal("wait"),
    selector: z.string().min(1).max(500).optional(),
    timeoutMs: z.number().int().min(0).max(30_000).optional(),
  }),
  z.object({ kind: z.literal("reload") }),
]);

const scenarioCheckSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("urlContains"), value: z.string().min(1).max(500) }),
  z.object({ kind: z.literal("textContains"), value: z.string().min(1).max(500) }),
  z.object({ kind: z.literal("noConsoleErrors") }),
]);

export function createServer(manager = new SessionManager()): McpServer {
  const server = new McpServer(
    { name: "web-debug-mcp", version: "0.1.0" },
    {
      instructions:
        "Use this local server to detect a web project, attach to an explicitly selected local browser target, reproduce a flow, and capture bounded evidence. Start with web_project_detect, then web_session_start and web_issue_capture. Remote targets, side-effect evaluation, secrets, cookies, and raw response bodies are blocked or redacted by default.",
      capabilities: { tools: {} },
    },
  );

  server.registerTool(
    "web_project_detect",
    {
      title: "Detect web project capabilities",
      description: "Inspect known project markers and report supported browser/framework capabilities without starting a process.",
      inputSchema: z.object({ projectRoot: z.string().min(1).default(DEFAULT_PROJECT_ROOT) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ projectRoot }) => respond(() => manager.detect(projectRoot)),
  );

  server.registerTool(
    "web_session_start",
    {
      title: "Start web debug session",
      description: "Start or attach to a local Chromium page using an explicit URL and optional CDP endpoint or executable path.",
      inputSchema: z.object({
        projectRoot: z.string().min(1).default(DEFAULT_PROJECT_ROOT),
        url: z.string().url(),
        cdpEndpoint: z.string().url().optional(),
        executablePath: z.string().min(1).optional(),
        headless: z.boolean().default(true),
        allowRemote: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => respond(() => manager.start(input)),
  );

  server.registerTool(
    "web_session_status",
    {
      title: "Read web debug session status",
      description: "List active sessions or read one session summary.",
      inputSchema: z.object({ sessionId: z.string().uuid().optional() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ sessionId }) => respond(() => (sessionId ? manager.status(sessionId) : manager.list())),
  );

  server.registerTool(
    "web_browser_action",
    {
      title: "Perform bounded browser action",
      description: "Navigate, click, fill, wait, or reload within the selected debug session and same-origin target.",
      inputSchema: z.object({ sessionId: z.string().uuid(), action: browserActionSchema }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sessionId, action }) => respond(() => manager.act(sessionId, action as BrowserAction)),
  );

  server.registerTool(
    "web_issue_capture",
    {
      title: "Capture bounded web issue evidence",
      description: "Combine browser state, DOM summary, console, network metadata, debugger state, and an optional screenshot into one redacted evidence bundle.",
      inputSchema: z.object({ sessionId: z.string().uuid(), captureScreenshot: z.boolean().default(true) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ sessionId, captureScreenshot }) => respond(() => manager.capture(sessionId, captureScreenshot)),
  );

  server.registerTool(
    "web_breakpoint_set",
    {
      title: "Set JavaScript breakpoint",
      description: "Set a breakpoint by source URL and one-based line number through the local Chromium debugger.",
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        sourceUrl: z.string().min(1).max(2_000),
        line: z.number().int().min(1),
        column: z.number().int().min(1).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sessionId, sourceUrl, line, column }) => respond(() => manager.setBreakpoint(sessionId, { sourceUrl, line, column })),
  );

  server.registerTool(
    "web_debug_control",
    {
      title: "Control paused JavaScript debugger",
      description: "Resume or step a paused local JavaScript target.",
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        action: z.enum(["resume", "stepOver", "stepInto", "stepOut"]),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sessionId, action }) => respond(() => manager.control(sessionId, action)),
  );

  server.registerTool(
    "web_debug_evaluate",
    {
      title: "Evaluate JavaScript expression",
      description: "Evaluate an expression in the local page runtime. Side effects are rejected unless explicitly enabled.",
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        expression: z.string().min(1).max(5_000),
        allowSideEffects: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sessionId, expression, allowSideEffects }) => respond(() => manager.evaluate(sessionId, expression, allowSideEffects)),
  );

  server.registerTool(
    "web_repro_record",
    {
      title: "Record reproducible web flow",
      description: "Store a bounded browser action sequence and explicit checks for later fix verification.",
      inputSchema: z.object({
        name: z.string().min(1).max(200),
        url: z.string().url(),
        actions: z.array(browserActionSchema).max(100),
        checks: z.array(scenarioCheckSchema).max(20),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ name, url, actions, checks }) =>
      respond(() => manager.recordScenario({
        name,
        url,
        actions: actions as BrowserAction[],
        checks: checks as ScenarioCheck[],
      })),
  );

  server.registerTool(
    "web_fix_verify",
    {
      title: "Verify web fix against recorded flow",
      description: "Replay a stored local flow, run its checks, and return evidence-backed pass/fail output.",
      inputSchema: z.object({ sessionId: z.string().uuid(), scenarioId: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sessionId, scenarioId }) => respond(() => manager.verifyScenario(sessionId, scenarioId)),
  );

  server.registerTool(
    "web_session_close",
    {
      title: "Close web debug session",
      description: "Close the selected session and release any browser resources owned by it.",
      inputSchema: z.object({ sessionId: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ sessionId }) => respond(() => manager.close(sessionId)),
  );

  return server;
}

async function respond<T>(operation: () => T | Promise<T>) {
  try {
    const value = await operation();
    return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
  } catch (error) {
    const details = error instanceof WebDebugError ? { code: error.code, details: error.details } : undefined;
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: errorMessage(error), ...details }, null, 2) }],
    };
  }
}

export async function startStdioServer(): Promise<void> {
  const manager = new SessionManager();
  const server = createServer(manager);
  const transport = new StdioServerTransport();
  const shutdown = async () => {
    await manager.closeAll();
    await server.close().catch(() => undefined);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  await server.connect(transport);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startStdioServer();
}
