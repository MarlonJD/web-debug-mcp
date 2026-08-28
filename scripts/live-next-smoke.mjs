import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { SessionManager } from "../dist/core/session-manager.js";

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
});
const manager = new SessionManager();
let session;

try {
  await waitForUrl(url, next);
  session = await manager.start({ projectRoot: fixtureRoot, url, executablePath: browserPath, headless: true });
  const actionId = await waitForServerActionId(fixtureRoot, next);
  const routeInspection = await manager.inspectNext(session.id, { kind: "compileRoute", routeSpecifier: "/" });
  const actionInspection = await manager.inspectNext(session.id, { kind: "resolveServerAction", actionId });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "[data-testid='hydration-status']" }, property: "text", expected: "Hydrated", timeoutMs: 5_000 });
  await manager.act(session.id, { kind: "click", locator: { kind: "css", value: "#health-button" } });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "[role=status]" }, property: "text", expected: "Healthy", timeoutMs: 5_000 });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "[data-testid='health-request-settled']" }, property: "text", expected: "Health request settled", timeoutMs: 5_000 });
  const verificationEvidence = await manager.capture(session.id, true);
  await manager.act(session.id, { kind: "click", locator: { kind: "css", value: "#payment-button" } });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "#server-action-status" }, property: "text", expected: "Submitted", timeoutMs: 5_000 });
  const actionCapture = await manager.capture(session.id, false);
  if (!verificationEvidence) throw new Error("Next evidence capture returned no evidence.");
  const nextEvidence = verificationEvidence.browser.next;
  const actionNextEvidence = actionCapture.browser.next;
  const routes = nextEvidence?.routes;
  const projectMetadata = nextEvidence?.projectMetadata;
  const compilationIssues = nextEvidence?.compilationIssues;
  const logTail = nextEvidence?.logTail;
  const routeCompilation = routeInspection.result;
  const actionResolution = actionInspection.result;
  const actionExecution = actionNextEvidence?.serverActionExecutions.find((execution) => execution.actionId === actionId);
  const requestInsights = actionNextEvidence?.requestInsights;
  const requestTraces = actionNextEvidence?.requestTraces;
  const assertions = {
    flowCaptured: verificationEvidence.redaction.applied === true,
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
    serverRenderedText: verificationEvidence.browser.dom.bodyText.includes("Next server component ready"),
    clientRenderedText: verificationEvidence.browser.dom.bodyText.includes("Healthy"),
    consoleClean: verificationEvidence.browser.console.every((entry) => entry.level !== "error" && entry.level !== "pageerror"),
  };
  const passed = Object.values(assertions).every(Boolean);
  process.stdout.write(`${JSON.stringify({
    passed,
    assertions,
    tools: nextEvidence?.tools ?? [],
    warnings: nextEvidence?.warnings ?? [],
    routeInspection,
    actionInspection,
    actionExecution,
    requestTraces,
    actionNextEvidence,
    logTail,
    bodyText: verificationEvidence.browser.dom.bodyText,
    console: verificationEvidence.browser.console,
  }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} finally {
  await manager.closeAll();
  next.kill("SIGTERM");
}

function hasRoute(value, expected) {
  if (!isRecord(value)) return false;
  return Object.values(value).some((routes) => Array.isArray(routes) && routes.includes(expected));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function waitForUrl(targetUrl, child) {
  const deadline = Date.now() + 20_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next fixture exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(targetUrl);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Next fixture did not become ready: ${lastError}`);
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
