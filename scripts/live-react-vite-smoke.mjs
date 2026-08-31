import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { SessionManager } from "../dist/core/session-manager.js";
import { stopOwnedProcess, waitForHttpReady } from "./lib/managed-process.mjs";

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
  detached: process.platform !== "win32",
});
const manager = new SessionManager();
let verificationSession;
let breakpointSession;
let originalApp = null;
let appMutated = false;
let hmrEvidence = null;

try {
  await waitForHttpReady(url, vite, { label: "React/Vite fixture", timeoutMs: 15_000 });

  verificationSession = await manager.start({ projectRoot: fixtureRoot, url, executablePath: browserPath, headless: true });
  const defaultSummary = await manager.capture(verificationSession.id);
  await manager.act(verificationSession.id, { kind: "click", locator: { kind: "css", value: "button" } });
  const verificationCapture = await manager.capture(verificationSession.id, { profile: "full" });
  const verificationEvidence = verificationCapture.details;
  if (!verificationEvidence) throw new Error("React/Vite evidence capture returned no evidence.");
  const verifiedComponent = findComponent(verificationEvidence.react?.components ?? [], "CheckoutForm");
  const viteEvidence = verificationEvidence.vite;
  const appModule = viteEvidence?.modules.find((module) => module.url.includes("/src/App.jsx"));
  const appTransform = appModule?.transform;
  const actionFrameIndex = verificationEvidence.replay.frames.find((frame) => frame.trigger === "action")?.index;
  if (actionFrameIndex === undefined) throw new Error("React/Vite replay did not retain the submitted action frame.");
  const replaySeek = await manager.seekReplay(verificationSession.id, actionFrameIndex);
  const replayRestore = await manager.seekReplay(verificationSession.id, actionFrameIndex, true);
  await manager.close(verificationSession.id);

  breakpointSession = await manager.start({ projectRoot: fixtureRoot, url, executablePath: browserPath, headless: true });
  const breakpoint = await manager.setBreakpoint(breakpointSession.id, { sourceUrl, line: 17 });
  await manager.act(breakpointSession.id, { kind: "click", locator: { kind: "css", value: "button" } });
  const pausedCapture = await manager.capture(breakpointSession.id, { profile: "full" });
  const paused = pausedCapture.details;
  const pausedFrame = paused.debugger.callFrames.find((frame) => frame.url.includes("/src/App.jsx"));
  const pausedComponent = findComponent(paused.react?.components ?? [], "CheckoutForm");
  await manager.control(breakpointSession.id, "resume");
  await manager.act(breakpointSession.id, { kind: "wait", locator: { kind: "css", value: "[data-testid='react-commit-ready']" }, property: "text", expected: "Committed", timeoutMs: 5_000 });
  const afterCapture = await manager.capture(breakpointSession.id, { profile: "include", surfaces: ["dom", "console", "react", "vite", "replay"] });
  const after = afterCapture.details;
  const afterComponent = findComponent(after.react?.components ?? [], "CheckoutForm");
  const lastCommit = after.react?.commits.at(-1);
  originalApp = await readFile(appPath, "utf8");
  try {
    await writeFile(appPath, originalApp.replace("Checkout fixture", "Checkout fixture HMR"));
    appMutated = true;
    await waitForViteTransformDiff(url);
    hmrEvidence = (await manager.capture(breakpointSession.id, { profile: "include", surfaces: ["vite"] })).details.vite;
  } finally {
    if (appMutated && originalApp !== null) {
      await writeFile(appPath, originalApp);
      appMutated = false;
    }
  }

  const assertions = {
    compactDefaultSummary: defaultSummary.profile === "summary" && defaultSummary.details === undefined && Buffer.byteLength(JSON.stringify(defaultSummary)) < 16 * 1024,
    projectRuntimeSeparated: verificationSession.projectCapabilities.react === true && verificationSession.runtimeCapabilities?.javascriptDebugger.state === "supported",
    flowCaptured: verificationCapture.redaction.applied === true,
    reactDetected: Boolean(verifiedComponent),
    submittedText: verificationEvidence.dom.bodyText.includes("Payment submitted: 249.90"),
    submittedState: componentContainsValue(afterComponent, true),
    renderCause: afterComponent?.renderCause === "state" || afterComponent?.renderCause === "props+state",
    renderCauseDetails: (afterComponent?.hookChanges ?? []).includes(1) && (afterComponent?.propChanges ?? []).length === 0,
    flamegraphDurations: typeof afterComponent?.treeDurationMs === "number" && typeof afterComponent?.selfDurationMs === "number",
    flamegraphView: (after.react?.flamegraph.length ?? 0) >= 2 && after.react?.flamegraph.some((node) => node.name === "CheckoutForm" && node.depth >= 1),
    commitProfiler: (after.react?.commits.length ?? 0) >= 2 && (lastCommit?.changedComponentCount ?? 0) > 0,
    profilerMode: after.react?.profiler.mode === "devtools-hook",
    replayTimeline: verificationEvidence.replay.frames.length >= 2,
    replaySeek: replaySeek.frame.index === actionFrameIndex && replaySeek.frame.trigger === "action",
    replayRestore: replayRestore.restored === true,
    viteDetected: viteEvidence?.detected === true,
    viteModuleGraph: (viteEvidence?.moduleCount ?? 0) > 0,
    appModule: Boolean(appModule),
    appTransform: isRecord(appTransform) && typeof appTransform.codeLength === "number" && isRecord(appTransform.sourceMap) && typeof appTransform.sourceMap.present === "boolean",
    hmrActive: viteEvidence?.hmr.active === true,
    viteTransformDiff: isRecord(hmrEvidence) && isRecord(hmrEvidence.hmr) && isRecord(hmrEvidence.hmr.lastUpdate) && isRecord(hmrEvidence.hmr.lastUpdate.transformDiff) && typeof hmrEvidence.hmr.lastUpdate.transformDiff.patch === "string" && hmrEvidence.hmr.lastUpdate.transformDiff.patch.includes("@@"),
    viteTransformProvenance: isRecord(hmrEvidence) && isRecord(hmrEvidence.hmr) && isRecord(hmrEvidence.hmr.lastUpdate) && isRecord(hmrEvidence.hmr.lastUpdate.transformProvenance) && isRecord(hmrEvidence.hmr.lastUpdate.transformProvenance.before) && isRecord(hmrEvidence.hmr.lastUpdate.transformProvenance.after) && typeof hmrEvidence.hmr.lastUpdate.transformProvenance.before.codeLength === "number" && typeof hmrEvidence.hmr.lastUpdate.transformProvenance.after.codeLength === "number",
    paused: paused.debugger.paused,
    source: pausedFrame?.url.includes("/src/App.jsx") ?? false,
    sourceLine: pausedFrame?.line === 17,
    screenshot: pausedCapture.details.screenshot?.status === "captured",
    consoleClean: noConsoleErrors(paused.console) && noConsoleErrors(after.console),
  };
  const passed = Object.values(assertions).every(Boolean);
  process.stdout.write(`${JSON.stringify({
    passed,
    assertions,
    breakpoint,
    pausedFrame,
    pausedConsole: paused.console,
    afterConsole: after.console,
    reactAfter: after.react,
    replaySeek,
    appModule,
    hmrEvidence,
    artifactDir,
  }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} finally {
  if (appMutated && originalApp !== null) await writeFile(appPath, originalApp);
  await manager.closeAll("delete");
  await stopOwnedProcess(vite, { label: "React/Vite fixture", processGroup: true });
  await rm(artifactDir, { recursive: true, force: true });
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
