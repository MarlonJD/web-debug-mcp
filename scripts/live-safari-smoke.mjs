import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { SessionManager } from "../dist/core/session-manager.js";
import { stopOwnedProcess, waitForHttpReady } from "./lib/managed-process.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = join(repositoryRoot, "fixtures/vanilla");
const serverScript = join(repositoryRoot, "scripts/serve-fixture.mjs");
const port = Number(process.env.WEB_DEBUG_SAFARI_FIXTURE_PORT ?? 4176);
const url = `http://127.0.0.1:${port}/`;
const browserVersion = execFileSync("/usr/bin/safaridriver", ["--version"], { encoding: "utf8" }).trim();

const fixture = spawn(process.execPath, [serverScript], {
  cwd: repositoryRoot,
  env: { ...process.env, WEB_DEBUG_FIXTURE_PORT: String(port) },
  stdio: ["ignore", "inherit", "inherit"],
  detached: process.platform !== "win32",
});
const manager = new SessionManager();

try {
  await waitForHttpReady(url, fixture, { label: "Safari vanilla fixture", timeoutMs: 15_000 });
  const session = await manager.start({
    projectRoot: fixtureRoot,
    url,
    browser: "safari",
    headless: false,
  });
  await manager.evaluate(session.id, "console.info('Safari BiDi smoke event')", true);
  await manager.act(session.id, { kind: "click", locator: { kind: "css", value: "#submit" } });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "#status" }, property: "text", expected: "Payment submitted", timeoutMs: 5_000 });
  const verificationEvidence = await manager.capture(session.id, true);
  if (!verificationEvidence) {
    throw new Error("Safari WebDriver evidence capture returned no evidence.");
  }
  const evidence = verificationEvidence.browser;
  const usesPerformanceNetwork = evidence.network.some((entry) => entry.requestId.startsWith("performance-"));
  const assertions = {
    flowCaptured: verificationEvidence.redaction.applied === true,
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
  const status = passed ? "verified" : assertions.bidiConsoleEvidence ? "failed" : "blocked";
  const reason = assertions.bidiConsoleEvidence ? undefined : "Safari WebDriver did not emit a BiDi console event; the console guardrail is unavailable even though WebDriver DOM/screenshot and Performance Resource Timing network evidence passed.";
  process.stdout.write(`${JSON.stringify({
    passed,
    status,
    ...(reason ? { reason } : {}),
    assertions,
    browserVersion,
    target: session.target,
    warnings: evidence.warnings,
    networkCount: evidence.network.length,
    networkSample: evidence.network.slice(0, 5),
    networkSource: usesPerformanceNetwork ? "performance-resource-timing" : "webdriver-bidi",
    consoleCount: evidence.console.length,
    bodyText: evidence.dom.bodyText,
    screenshotPath: evidence.screenshotPath,
  }, null, 2)}\n`);
  if (!passed) process.exitCode = status === "blocked" ? 2 : 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    passed: false,
    status: "blocked",
    reason: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`);
  process.exitCode = 2;
} finally {
  await manager.closeAll("delete");
  await stopOwnedProcess(fixture, { label: "Safari vanilla fixture", processGroup: true });
}
