import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { SessionManager } from "../dist/core/session-manager.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = join(repositoryRoot, "fixtures/vanilla");
const serverScript = join(repositoryRoot, "scripts/serve-fixture.mjs");
const port = Number(process.env.WEB_DEBUG_SAFARI_FIXTURE_PORT ?? 4176);
const url = `http://127.0.0.1:${port}/`;

const fixture = spawn(process.execPath, [serverScript], {
  cwd: repositoryRoot,
  env: { ...process.env, WEB_DEBUG_FIXTURE_PORT: String(port) },
  stdio: ["ignore", "inherit", "inherit"],
});
const manager = new SessionManager();

try {
  await waitForUrl(url, fixture);
  const session = await manager.start({
    projectRoot: fixtureRoot,
    url,
    browser: "safari",
    headless: false,
  });
  await manager.evaluate(session.id, "console.info('Safari BiDi smoke event')", true);
  const scenario = manager.recordScenario({
    name: "submit Safari payment",
    url,
    actions: [
      { kind: "click", selector: "#submit" },
      { kind: "wait", selector: "#status", text: "Payment submitted", timeoutMs: 5_000 },
    ],
    checks: [
      { kind: "textContains", value: "Payment submitted" },
      { kind: "noConsoleErrors" },
    ],
  });
  const verification = await manager.verifyScenario(session.id, scenario.id);
  const evidence = verification.evidence.browser;
  const usesPerformanceNetwork = evidence.network.some((entry) => entry.requestId.startsWith("performance-"));
  const assertions = {
    scenarioPassed: verification.passed,
    safariTarget: session.target?.browser === "safari",
    profileBoundary: session.target?.isolated === false && evidence.warnings.some((warning) => warning.includes("profile isolation")),
    domEvidence: evidence.dom.bodyText.includes("Payment submitted"),
    screenshot: Boolean(evidence.screenshotPath),
    networkEvidence: evidence.network.length > 0,
    networkSourceDisclosed: !usesPerformanceNetwork || evidence.warnings.some((warning) => warning.includes("Performance Resource Timing")),
    bidiConsoleEvidence: evidence.console.some((entry) => entry.text.includes("Safari BiDi smoke event")),
    debuggerUnavailableIsExplicit: evidence.debugger.paused === false && evidence.warnings.some((warning) => warning.includes("JavaScript debugger")),
  };
  const passed = Object.values(assertions).every(Boolean);
  process.stdout.write(`${JSON.stringify({
    passed,
    assertions,
    target: session.target,
    warnings: evidence.warnings,
    networkCount: evidence.network.length,
    networkSample: evidence.network.slice(0, 5),
    networkSource: usesPerformanceNetwork ? "performance-resource-timing" : "webdriver-bidi",
    consoleCount: evidence.console.length,
    bodyText: evidence.dom.bodyText,
    screenshotPath: evidence.screenshotPath,
  }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    passed: false,
    status: "blocked",
    reason: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`);
  process.exitCode = 2;
} finally {
  await manager.closeAll();
  fixture.kill("SIGTERM");
}

async function waitForUrl(targetUrl, child) {
  const deadline = Date.now() + 15_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vanilla fixture exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(targetUrl);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Safari fixture did not become ready: ${lastError}`);
}
