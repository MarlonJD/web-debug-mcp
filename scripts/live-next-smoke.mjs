import { existsSync } from "node:fs";
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
  const scenario = manager.recordScenario({
    name: "check Next route health",
    url,
    actions: [
      { kind: "click", selector: "button" },
      { kind: "wait", selector: "[role=status]", text: "Healthy", timeoutMs: 5_000 },
    ],
    checks: [
      { kind: "textContains", value: "Healthy" },
      { kind: "noConsoleErrors" },
    ],
  });
  const verification = await manager.verifyScenario(session.id, scenario.id);
  const nextEvidence = verification.evidence.browser.next;
  const routes = nextEvidence?.routes;
  const projectMetadata = nextEvidence?.projectMetadata;
  const compilationIssues = nextEvidence?.compilationIssues;
  const logTail = nextEvidence?.logTail;
  const assertions = {
    scenarioPassed: verification.passed,
    nextDetected: nextEvidence?.detected === true,
    nextEndpoint: nextEvidence?.endpoint.endsWith("/_next/mcp") ?? false,
    routeHome: hasRoute(routes, "/"),
    routeHealth: hasRoute(routes, "/api/health"),
    projectPath: isRecord(projectMetadata) && typeof projectMetadata.projectPath === "string" && projectMetadata.projectPath.endsWith("/fixtures/next"),
    devServerUrl: isRecord(projectMetadata) && projectMetadata.devServerUrl === url.slice(0, -1),
    compilationClean: isRecord(compilationIssues) && Array.isArray(compilationIssues.issues) && compilationIssues.issues.length === 0,
    logTail: isRecord(logTail) && typeof logTail.file === "string" && logTail.file.endsWith(".next/dev/logs/next-development.log") && typeof logTail.text === "string",
    serverRenderedText: verification.evidence.browser.dom.bodyText.includes("Next server component ready"),
    clientRenderedText: verification.evidence.browser.dom.bodyText.includes("Healthy"),
    consoleClean: verification.evidence.browser.console.every((entry) => entry.level !== "error" && entry.level !== "pageerror"),
  };
  const passed = Object.values(assertions).every(Boolean);
  process.stdout.write(`${JSON.stringify({
    passed,
    assertions,
    tools: nextEvidence?.tools ?? [],
    warnings: nextEvidence?.warnings ?? [],
    logTail,
    bodyText: verification.evidence.browser.dom.bodyText,
    console: verification.evidence.browser.console,
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
