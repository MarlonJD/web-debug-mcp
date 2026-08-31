import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { SessionManager } from "../dist/core/session-manager.js";
import { stopOwnedProcess, waitForHttpReady } from "./lib/managed-process.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = join(repositoryRoot, "fixtures/vue-vite");
const serverScript = join(repositoryRoot, "scripts/serve-vue-vite.mjs");
const browserPath = process.env.WEB_DEBUG_CHROME_EXECUTABLE_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.WEB_DEBUG_VUE_VITE_PORT ?? 4176);
const url = `http://127.0.0.1:${port}/`;
const appPath = join(fixtureRoot, "src/App.vue");

if (!existsSync(browserPath)) throw new Error(`Chromium executable not found: ${browserPath}. Set WEB_DEBUG_CHROME_EXECUTABLE_PATH.`);

const server = spawn(process.execPath, [serverScript], {
  cwd: repositoryRoot,
  env: { ...process.env, WEB_DEBUG_VUE_VITE_PORT: String(port) },
  stdio: ["ignore", "inherit", "inherit"],
  detached: process.platform !== "win32",
});
const manager = new SessionManager();
let session;
let originalApp = null;

try {
  await waitForHttpReady(url, server, { label: "Vue/Vite fixture", timeoutMs: 15_000 });
  session = await manager.start({ projectRoot: fixtureRoot, url, executablePath: browserPath, headless: true });
  const beforeCapture = await manager.capture(session.id, { profile: "include", surfaces: ["dom", "console", "angular", "vue", "vite", "replay"] });
  const before = beforeCapture.details;
  await manager.act(session.id, { kind: "click", locator: { kind: "css", value: "button" } });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "[data-testid='vue-update-ready']" }, property: "text", expected: "Updated", timeoutMs: 5_000 });
  const afterCapture = await manager.capture(session.id, { profile: "include", surfaces: ["dom", "console", "angular", "vue", "vite", "replay"] });
  const after = afterCapture.details;
  const component = findComponent(after.vue?.components ?? [], "CheckoutForm");
  const viteEvidence = after.vite;

  originalApp = await readFile(appPath, "utf8");
  await writeFile(appPath, originalApp.replace("Vue checkout fixture", "Vue checkout fixture HMR"));
  const hmr = await waitForViteTransformDiff(url);

  const assertions = {
    evidenceSchema: afterCapture.schemaVersion === 4,
    detected: afterCapture.project.frameworks.join(",") === "vite,vue" && after.vue?.detected === true,
    exactVersion: after.vue?.version === "3.5.42",
    componentTree: Boolean(component) && (after.vue?.componentCount ?? 0) >= 2,
    props: component?.props.currency === "TRY",
    state: component?.state["data.submitted"] === true,
    changedState: component?.changedStateKeys.includes("data.submitted") === true && (component?.updateCount ?? 0) > 0,
    sourceHint: component?.source?.file.endsWith("CheckoutForm.vue") === true,
    domUpdated: after.dom.bodyText.includes("Payment submitted: 249.90"),
    replayRuntime: after.replay.frames.some((frame) => frame.vue?.detected === true),
    viteDetected: viteEvidence?.detected === true && (viteEvidence.moduleCount ?? 0) > 0,
    viteTransformDiff: typeof hmr?.hmr?.lastUpdate?.transformDiff?.patch === "string" && hmr.hmr.lastUpdate.transformDiff.patch.includes("@@"),
    consoleClean: after.console.every((entry) => entry.level !== "error" && entry.level !== "pageerror"),
    angularAbsent: before.angular === null && after.angular === null,
  };
  const passed = Object.values(assertions).every(Boolean);
  process.stdout.write(`${JSON.stringify({ passed, assertions, vue: after.vue, vite: viteEvidence, hmr: hmr?.hmr?.lastUpdate ?? null, warnings: afterCapture.warnings }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} finally {
  if (originalApp !== null) await writeFile(appPath, originalApp);
  await manager.closeAll("delete");
  await stopOwnedProcess(server, { label: "Vue/Vite fixture", processGroup: true });
}

function findComponent(nodes, name) {
  for (const node of nodes) {
    if (node.name === name) return node;
    const child = findComponent(node.children ?? [], name);
    if (child) return child;
  }
  return null;
}

async function waitForViteTransformDiff(targetUrl) {
  const endpoint = new URL("/__web_debug/vite", targetUrl).toString();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint);
      const snapshot = await response.json();
      if (response.ok && typeof snapshot?.hmr?.lastUpdate?.transformDiff?.patch === "string") return snapshot;
    } catch {
      // The bounded loop reports the final timeout below.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Vue/Vite transform diff did not become ready within 10 seconds.");
}
