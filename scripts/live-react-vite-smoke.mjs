import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { SessionManager } from "../dist/core/session-manager.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = join(repositoryRoot, "fixtures/react-vite");
const serverScript = join(repositoryRoot, "scripts/serve-react-vite.mjs");
const browserPath = process.env.WEB_DEBUG_CHROME_EXECUTABLE_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.WEB_DEBUG_REACT_VITE_PORT ?? 4174);
const url = `http://127.0.0.1:${port}/`;
const sourceUrl = `${url}src/App.jsx`;
const appPath = join(fixtureRoot, "src/App.jsx");
const artifactDir = await mkdtemp(join(tmpdir(), "web-debug-mcp-react-vite-"));

if (!existsSync(browserPath)) {
  throw new Error(`Chromium executable not found: ${browserPath}. Set WEB_DEBUG_CHROME_EXECUTABLE_PATH.`);
}

const vite = spawn(process.execPath, [serverScript], {
  cwd: repositoryRoot,
  env: { ...process.env, WEB_DEBUG_REACT_VITE_PORT: String(port) },
  stdio: ["ignore", "inherit", "inherit"],
});
const manager = new SessionManager();
let verificationSession;
let breakpointSession;
let originalApp = null;
let appMutated = false;
let hmrEvidence = null;

try {
  await waitForUrl(url, vite);

  verificationSession = await manager.start({ projectRoot: fixtureRoot, url, executablePath: browserPath, headless: true });
  const scenario = manager.recordScenario({
    name: "submit React payment",
    url,
    actions: [{ kind: "click", selector: "button" }],
    checks: [
      { kind: "textContains", value: "Payment submitted: 249.90" },
      { kind: "noConsoleErrors" },
    ],
  });
  const verification = await manager.verifyScenario(verificationSession.id, scenario.id);
  const verifiedComponent = findComponent(verification.evidence.browser.react?.components ?? [], "CheckoutForm");
  const viteEvidence = verification.evidence.browser.vite;
  const appModule = viteEvidence?.modules.find((module) => module.url.includes("/src/App.jsx"));
  await manager.close(verificationSession.id);

  breakpointSession = await manager.start({ projectRoot: fixtureRoot, url, executablePath: browserPath, headless: true });
  const breakpoint = await manager.setBreakpoint(breakpointSession.id, { sourceUrl, line: 17 });
  await manager.act(breakpointSession.id, { kind: "click", selector: "button" });
  const paused = await manager.capture(breakpointSession.id, true);
  const pausedFrame = paused.browser.debugger.callFrames.find((frame) => frame.url.includes("/src/App.jsx"));
  const pausedComponent = findComponent(paused.browser.react?.components ?? [], "CheckoutForm");
  await manager.control(breakpointSession.id, "resume");
  await new Promise((resolve) => setTimeout(resolve, 150));
  const after = await manager.capture(breakpointSession.id, false);
  const afterComponent = findComponent(after.browser.react?.components ?? [], "CheckoutForm");
  const lastCommit = after.browser.react?.commits.at(-1);
  originalApp = await readFile(appPath, "utf8");
  try {
    await writeFile(appPath, originalApp.replace("Checkout fixture", "Checkout fixture HMR"));
    appMutated = true;
    await waitForViteTransformDiff(url);
    hmrEvidence = (await manager.capture(breakpointSession.id, false)).browser.vite;
  } finally {
    if (appMutated && originalApp !== null) {
      await writeFile(appPath, originalApp);
      appMutated = false;
    }
  }

  const assertions = {
    scenarioPassed: verification.passed,
    reactDetected: Boolean(verifiedComponent),
    submittedText: verification.evidence.browser.dom.bodyText.includes("Payment submitted: 249.90"),
    submittedState: componentContainsValue(afterComponent, true),
    renderCause: afterComponent?.renderCause === "state" || afterComponent?.renderCause === "props+state",
    commitProfiler: (after.browser.react?.commits.length ?? 0) >= 2 && (lastCommit?.changedComponentCount ?? 0) > 0,
    viteDetected: viteEvidence?.detected === true,
    viteModuleGraph: (viteEvidence?.moduleCount ?? 0) > 0,
    appModule: Boolean(appModule),
    hmrActive: viteEvidence?.hmr.active === true,
    viteTransformDiff: isRecord(hmrEvidence) && isRecord(hmrEvidence.hmr) && isRecord(hmrEvidence.hmr.lastUpdate) && isRecord(hmrEvidence.hmr.lastUpdate.transformDiff) && typeof hmrEvidence.hmr.lastUpdate.transformDiff.patch === "string" && hmrEvidence.hmr.lastUpdate.transformDiff.patch.includes("@@"),
    paused: paused.browser.debugger.paused,
    source: pausedFrame?.url.includes("/src/App.jsx") ?? false,
    sourceLine: pausedFrame?.line === 17,
    screenshot: Boolean(paused.browser.screenshotPath),
    consoleClean: noConsoleErrors(paused.browser.console) && noConsoleErrors(after.browser.console),
  };
  const passed = Object.values(assertions).every(Boolean);
  process.stdout.write(`${JSON.stringify({
    passed,
    assertions,
    breakpoint,
    pausedFrame,
    pausedConsole: paused.browser.console,
    afterConsole: after.browser.console,
    reactAfter: after.browser.react,
    appModule,
    hmrEvidence,
    artifactDir,
  }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} finally {
  if (appMutated && originalApp !== null) await writeFile(appPath, originalApp);
  await manager.closeAll();
  vite.kill("SIGTERM");
}

function findComponent(nodes, name) {
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    if (node.name === name) return node;
    const child = findComponent(node.children, name);
    if (child) return child;
  }
  return null;
}

function componentContainsValue(component, expected) {
  if (!component) return false;
  return component.hooks.some((value) => value === expected);
}

function noConsoleErrors(entries) {
  return entries.every((entry) => entry.level !== "error" && entry.level !== "pageerror");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function waitForViteTransformDiff(targetUrl) {
  const endpoint = new URL("/__web_debug/vite", targetUrl).toString();
  const deadline = Date.now() + 10_000;
  let lastError = "transform diff not ready";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint);
      const snapshot = await response.json();
      const diff = snapshot?.hmr?.lastUpdate?.transformDiff;
      if (response.ok && typeof diff?.patch === "string" && diff.patch.includes("@@")) return snapshot;
      lastError = response.ok ? "Vite has not published a transform diff yet" : `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Vite transform diff did not become ready: ${lastError}`);
}

async function waitForUrl(targetUrl, child) {
  const deadline = Date.now() + 15_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`React/Vite fixture exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(targetUrl);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`React/Vite fixture did not become ready: ${lastError}`);
}
