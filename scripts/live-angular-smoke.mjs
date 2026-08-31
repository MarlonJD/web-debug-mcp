import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { SessionManager } from "../dist/core/session-manager.js";
import { stopOwnedProcess, waitForHttpReady } from "./lib/managed-process.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = join(repositoryRoot, "fixtures/angular");
const serverScript = join(repositoryRoot, "scripts/serve-angular.mjs");
const browserPath = process.env.WEB_DEBUG_CHROME_EXECUTABLE_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.WEB_DEBUG_ANGULAR_PORT ?? 4177);
const url = `http://127.0.0.1:${port}/`;

if (!existsSync(browserPath)) throw new Error(`Chromium executable not found: ${browserPath}. Set WEB_DEBUG_CHROME_EXECUTABLE_PATH.`);

const server = spawn(process.execPath, [serverScript], {
  cwd: repositoryRoot,
  env: { ...process.env, NG_CLI_ANALYTICS: "false", WEB_DEBUG_ANGULAR_PORT: String(port) },
  stdio: ["ignore", "inherit", "inherit"],
  detached: process.platform !== "win32",
});
const manager = new SessionManager();
let session;

try {
  await waitForHttpReady(url, server, { label: "Angular fixture", timeoutMs: 30_000 });
  session = await manager.start({ projectRoot: fixtureRoot, url, executablePath: browserPath, headless: true });
  const beforeCapture = await manager.capture(session.id, { profile: "include", surfaces: ["dom", "console", "angular", "vue", "vite", "replay"] });
  const before = beforeCapture.details;
  await manager.act(session.id, { kind: "click", locator: { kind: "css", value: "button" } });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "[data-testid='angular-change-ready']" }, property: "text", expected: "Changed", timeoutMs: 5_000 });
  const afterCapture = await manager.capture(session.id, { profile: "include", surfaces: ["dom", "console", "angular", "vue", "vite", "replay"] });
  const after = afterCapture.details;
  const component = findComponent(after.angular?.components ?? [], "CheckoutPanelComponent");
  const assertions = {
    evidenceSchema: afterCapture.schemaVersion === 4,
    detected: afterCapture.project.frameworks.join(",") === "angular" && after.angular?.detected === true,
    exactVersion: after.angular?.version === "21.2.22",
    domHostTree: after.angular?.treeMode === "dom-host" && (after.angular.componentCount ?? 0) >= 2,
    state: component?.state.submitted === true && component?.state.status === "Payment submitted: 249.90",
    changedState: component?.changedStateKeys.includes("submitted") === true && component.changedStateKeys.includes("status"),
    privateIvyAbsent: !JSON.stringify(after.angular).includes("__ngContext__"),
    domUpdated: after.dom.bodyText.includes("Payment submitted: 249.90"),
    replayRuntime: after.replay.frames.some((frame) => frame.angular?.detected === true),
    noViteClaim: afterCapture.project.projectCapabilities.vite === false && after.vite === null,
    consoleClean: after.console.every((entry) => entry.level !== "error" && entry.level !== "pageerror"),
    vueAbsent: before.vue === null && after.vue === null,
  };
  const passed = Object.values(assertions).every(Boolean);
  process.stdout.write(`${JSON.stringify({ passed, assertions, angular: after.angular, warnings: afterCapture.warnings }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} finally {
  await manager.closeAll("delete");
  await stopOwnedProcess(server, { label: "Angular fixture", processGroup: true });
}

function findComponent(nodes, name) {
  for (const node of nodes) {
    if (node.name === name) return node;
    const child = findComponent(node.children ?? [], name);
    if (child) return child;
  }
  return null;
}
