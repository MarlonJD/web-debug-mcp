import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { stopOwnedProcess, waitForHttpReady } from "./lib/managed-process.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = join(repositoryRoot, "fixtures/next");
const serverScript = join(repositoryRoot, "scripts/serve-next.mjs");
const browserPath = process.env.WEB_DEBUG_CHROME_EXECUTABLE_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.WEB_DEBUG_NEXT_PORT ?? 4175);
const url = `http://127.0.0.1:${port}/`;

if (!existsSync(browserPath)) {
  throw new Error(`Chromium executable not found: ${browserPath}. Set WEB_DEBUG_CHROME_EXECUTABLE_PATH.`);
}

const next = spawn(process.execPath, [serverScript], {
  cwd: repositoryRoot,
  env: { ...process.env, WEB_DEBUG_NEXT_PORT: String(port) },
  stdio: ["ignore", "inherit", "inherit"],
  detached: process.platform !== "win32",
});
const transport = new StdioClientTransport({ command: process.execPath, args: [join(repositoryRoot, "bin/web-debug-mcp.mjs")], cwd: repositoryRoot, stderr: "pipe" });
const client = new Client({ name: "next-public-mcp-smoke", version: "1.0.0" });
const rawCalls = [];
let ownedSessionId;
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 150_000 });
  rawCalls.push({ name, result });
  if (result.isError || !result.structuredContent?.ok) throw new Error(JSON.stringify(result.structuredContent?.error ?? result));
  return result.structuredContent.data;
};
const manager = {
  start: async (args) => { const value = await call("web_session_start", args); ownedSessionId = value.id; return value; },
  capture: (sessionId, view) => call("web_issue_capture", { sessionId, ...(view ? { view } : {}) }),
  act: (sessionId, action) => call("web_browser_action", { sessionId, action }),
  inspectNext: (sessionId, inspection) => call("web_next_inspect", { sessionId, inspection }),
  closeAll: async () => { if (ownedSessionId) await call("web_session_close", { sessionId: ownedSessionId, artifactPolicy: "delete" }); },
};
let session;

try {
  await waitForHttpReady(url, next, { label: "Next fixture", timeoutMs: 20_000, pollMs: 200 });
  await client.connect(transport);
  const project = await call("web_project_detect", { projectRoot: fixtureRoot, host: "next" });
  if (project.ambiguous || project.selection.host !== "next") throw new Error("The qualification fixture must be a correctly configured exact Next root.");
  session = await manager.start({ projectRoot: fixtureRoot, host: "next", url, executablePath: browserPath, headless: true });
  const summary = await manager.capture(session.id);
  // Inspect small project metadata before the full action trace can reach the
  // evidence bound and legitimately prune optional metadata.
  const metadataCapture = await manager.capture(session.id, { profile: "include", surfaces: ["next"] });
  const actionId = await waitForServerActionId(fixtureRoot, next);
  const routeInspection = await manager.inspectNext(session.id, { kind: "compileRoute", routeSpecifier: "/" });
  const actionInspection = await manager.inspectNext(session.id, { kind: "resolveServerAction", actionId });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "[data-testid='hydration-status']" }, property: "text", expected: "Hydrated", timeoutMs: 5_000 });
  await manager.act(session.id, { kind: "click", locator: { kind: "css", value: "#health-button" } });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "[role=status]" }, property: "text", expected: "Healthy", timeoutMs: 5_000 });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "[data-testid='health-request-settled']" }, property: "text", expected: "Health request settled", timeoutMs: 5_000 });
  const verificationCapture = await manager.capture(session.id, { profile: "full" });
  const verificationEvidence = verificationCapture.details;
  await manager.act(session.id, { kind: "click", locator: { kind: "css", value: "#payment-button" } });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "#server-action-status" }, property: "text", expected: "Submitted", timeoutMs: 5_000 });
  const actionCapture = await manager.capture(session.id, { profile: "include", surfaces: ["dom", "console", "network", "next", "replay"] });
  if (!verificationEvidence) throw new Error("Next evidence capture returned no evidence.");
  const nextEvidence = verificationEvidence.next;
  const actionNextEvidence = actionCapture.details.next;
  const routes = nextEvidence?.routes;
  const projectMetadata = metadataCapture.details.next?.projectMetadata;
  const compilationIssues = nextEvidence?.compilationIssues;
  const logTail = nextEvidence?.logTail;
  const routeCompilation = routeInspection.result;
  const actionResolution = actionInspection.result;
  const actionExecution = actionNextEvidence?.serverActionExecutions.find((execution) => execution.actionId === actionId);
  const requestInsights = actionNextEvidence?.requestInsights;
  const requestTraces = actionNextEvidence?.requestTraces;
  const assertions = {
    selectiveSummary: summary.collection.next === "not-collected" && summary.collection.react === "not-collected",
    selectedNextFresh: metadataCapture.collection.next === "fresh" && verificationCapture.collection.next === "fresh",
    flowCaptured: verificationCapture.redaction.applied === true,
    nextDetected: nextEvidence?.detected === true,
    nextEndpoint: nextEvidence?.endpoint.endsWith("/_next/mcp") ?? false,
    routeHome: hasRoute(routes, "/"),
    routeHealth: hasRoute(routes, "/api/health"),
    projectPath: isRecord(projectMetadata) && typeof projectMetadata.projectPath === "string" && projectMetadata.projectPath.endsWith("/fixtures/next"),
    devServerUrl: isRecord(projectMetadata) && projectMetadata.devServerUrl === url.slice(0, -1),
    compilationClean: isRecord(compilationIssues) && Array.isArray(compilationIssues.issues) && compilationIssues.issues.length === 0,
    logTail: isRecord(logTail) && typeof logTail.file === "string" && logTail.file.endsWith(".next/dev/logs/next-development.log") && typeof logTail.text === "string",
    routeCompiled: isRecord(routeCompilation) && routeCompilation.routeSpecifier === "/" && Array.isArray(routeCompilation.issues),
    serverActionResolved: isRecord(actionResolution) && actionResolution.actionId === actionId && typeof actionResolution.filename === "string" && actionResolution.filename.endsWith("actions.js"),
    serverActionExecuted: isRecord(actionExecution) && isRecord(actionExecution.request) && actionExecution.request.method === "POST" && actionExecution.request.ok === true && isRecord(actionExecution.resolution) && actionExecution.resolution.actionId === actionId,
    requestInsights: isRecord(requestInsights) && Array.isArray(requestInsights.requests) && requestInsights.requests.length > 0,
    requestTraces: Array.isArray(requestTraces) && requestTraces.length > 0 && requestTraces.some((trace) => Array.isArray(trace.spans) && trace.spans.length > 0 && typeof trace.durationMs === "number"),
    serverActionTraceLinked: isRecord(actionExecution?.trace) && Array.isArray(actionExecution.trace.spans) && actionExecution.trace.spans.some((span) => span.name === "POST" || span.attributes?.["http.method"] === "POST"),
    serverRenderedText: verificationEvidence.dom.bodyText.includes("Next server component ready"),
    clientRenderedText: verificationEvidence.dom.bodyText.includes("Healthy"),
    consoleClean: verificationEvidence.console.every((entry) => entry.level !== "error" && entry.level !== "pageerror"),
  };
  assertions.exactNextHost = project.selection.mode === "explicit" && project.frameworks.includes("next") && !project.frameworks.includes("vite");
  const passed = Object.values(assertions).every(Boolean);
  if (process.env.WEB_DEBUG_EVIDENCE_OUTPUT) await writeFile(process.env.WEB_DEBUG_EVIDENCE_OUTPUT, JSON.stringify({ passed, assertions, project, rawCalls }, null, 2));
  process.stdout.write(`${JSON.stringify({ passed, transport: "public-stdio-mcp", assertions, tools: nextEvidence?.tools ?? [], warnings: nextEvidence?.warnings ?? [] }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} catch (error) {
  if (process.env.WEB_DEBUG_EVIDENCE_OUTPUT) await writeFile(process.env.WEB_DEBUG_EVIDENCE_OUTPUT, JSON.stringify({ passed: false, error: error.message, rawCalls }, null, 2));
  throw error;
} finally {
  await manager.closeAll().catch(() => undefined);
  await client.close().catch(() => undefined);
  await transport.close().catch(() => undefined);
  await stopOwnedProcess(next, { label: "Next fixture", processGroup: true });
}

function hasRoute(value, expected) {
  if (!isRecord(value)) return false;
  return Object.values(value).some((routes) => Array.isArray(routes) && routes.includes(expected));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function waitForServerActionId(projectRoot, child) {
  const manifestPath = join(projectRoot, ".next", "dev", "server", "server-reference-manifest.json");
  const deadline = Date.now() + 20_000;
  let lastError = "manifest not ready";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next fixture exited with code ${child.exitCode}.`);
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const actionId = Object.keys(manifest.node ?? {})[0] ?? Object.keys(manifest.edge ?? {})[0];
      if (actionId) return actionId;
      lastError = "server-reference-manifest.json contains no action IDs";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Next Server Action manifest did not become ready: ${lastError}`);
}
