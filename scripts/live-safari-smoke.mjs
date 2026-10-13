import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { SessionManager } from "../dist/core/session-manager.js";
import { SafariAdapter } from "../dist/adapters/safari.js";
import { evaluateCheck } from "../dist/core/scenario-verification.js";
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
const adapter = new SafariAdapter();
const manager = new SessionManager(() => adapter);
let phase = "fixture-ready";

try {
  await waitForHttpReady(url, fixture, { label: "Safari vanilla fixture", timeoutMs: 15_000 });
  phase = "session-start";
  const session = await manager.start({
    projectRoot: fixtureRoot,
    url,
    browser: "safari",
    headless: false,
  });
  phase = "initial-screenshot";
  const initialCapture = await manager.capture(session.id, { profile: "full" });
  phase = "native-action-contract";
  await manager.evaluate(session.id, `(() => {
    const controls = document.createElement('section');
    controls.id = 'native-action-probe';
    controls.innerHTML = '<input id="native-key"><select id="native-select"><option value="one">One</option><option value="safari-option-two">Two</option></select><input id="native-check" type="checkbox"><button id="native-hover">Hover probe</button>';
    document.body.append(controls);
    window.__nativeKeys = [];
    document.querySelector('#native-key').addEventListener('keydown', event => { window.__nativeKeys.push(event.key); });
    document.querySelector('#native-hover').addEventListener('mouseenter', () => { window.__nativeHovered = true; });
    return true;
  })()`, true);
  const keys = ["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace", "Delete", "Space"];
  for (const key of keys) await manager.act(session.id, { kind: "press", locator: { kind: "css", value: "#native-key" }, key });
  await manager.act(session.id, { kind: "select", locator: { kind: "css", value: "#native-select" }, value: "safari-option-two" });
  await manager.act(session.id, { kind: "check", locator: { kind: "css", value: "#native-check" }, checked: true });
  await manager.act(session.id, { kind: "hover", locator: { kind: "css", value: "#native-hover" } });
  await manager.act(session.id, { kind: "scroll", locator: { kind: "css", value: "#amount" } });
  const nativeActions = await manager.evaluate(session.id, `({
    keys: JSON.stringify(window.__nativeKeys) === JSON.stringify(['Enter','Escape','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Backspace','Delete',' ']),
    selected: document.querySelector('#native-select').value === 'safari-option-two',
    checked: document.querySelector('#native-check').checked === true,
    hovered: window.__nativeHovered === true,
    observedKeys: window.__nativeKeys
  })`, true);
  await manager.evaluate(session.id, "document.querySelector('#native-action-probe').remove()", true);
  phase = "console-probe";
  await manager.evaluate(session.id, "console.info('Safari native smoke event')", true);
  phase = "application-console-error";
  await manager.act(session.id, { kind: "fill", locator: { kind: "css", value: "#amount" }, value: "bad-number" });
  await manager.act(session.id, { kind: "click", locator: { kind: "css", value: "#submit" } });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "#status" }, property: "text", expected: "Invalid amount", timeoutMs: 5_000 });
  const errorSnapshot = await adapter.snapshot({ artifactDir: session.artifactDir, captureScreenshot: false, checksOnly: true });
  const errorCheck = evaluateCheck({ kind: "noConsoleErrors" }, errorSnapshot);
  phase = "observer-reset";
  await adapter.resetObservers();
  await manager.act(session.id, { kind: "reload" });
  await manager.evaluate(session.id, "console.info('Safari native smoke event after reset')", true);
  phase = "browser-action";
  await manager.act(session.id, { kind: "fill", locator: { kind: "css", value: "#amount" }, value: "249.90" });
  await manager.act(session.id, { kind: "click", locator: { kind: "css", value: "#submit" } });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "#status" }, property: "text", expected: "Payment submitted", timeoutMs: 5_000 });
  phase = "capture";
  const verificationCapture = await manager.capture(session.id, { profile: "full" });
  if (!verificationCapture) {
    throw new Error("Safari native evidence capture returned no evidence.");
  }
  const evidence = verificationCapture.details;
  const interactive = evidence.interactiveElements?.elements ?? [];
  const submit = interactive.find((element) => element.name === "Submit payment");
  const amount = interactive.find((element) => element.name === "Amount");
  const disabled = interactive.find((element) => element.name === "Disabled action");
  const remember = interactive.find((element) => element.name === "Remember this device");
  const usesPerformanceNetwork = evidence.network.some((entry) => entry.requestId.startsWith("performance-"));
  const assertions = {
    networkFreshness: verificationCapture.collection.network === "fresh" && verificationCapture.summary.observations?.network?.freshness === "fresh",
    flowCaptured: verificationCapture.redaction.applied === true,
    safariTarget: session.target?.browser === "safari",
    runtimeNegotiated: session.runtimeCapabilities?.transport === "safari-mcp" && session.runtimeCapabilities.javascriptDebugger.state === "unsupported" && session.runtimeCapabilities.locators.semantic.state === "unsupported",
    profileBoundary: session.target?.isolated === false && verificationCapture.warnings.some((warning) => warning.includes("profile isolation")),
    domEvidence: evidence.dom.bodyText.includes("Payment submitted"),
    screenshot: initialCapture.details?.screenshot?.status === "captured",
    privateInputScreenshotSuppressed: evidence.screenshot?.status === "suppressed",
    networkEvidence: evidence.network.length > 0,
    networkSourceDisclosed: !usesPerformanceNetwork || verificationCapture.warnings.some((warning) => warning.includes("Performance Resource Timing")),
    nativeConsoleEvidence: evidence.console.some((entry) => entry.text.includes("Safari native smoke event after reset")),
    applicationErrorEvidence: errorSnapshot.console.some(entry => entry.level === "error" && entry.text.includes("Payment validation failed") && entry.url?.endsWith("/app.js") && entry.line === 18),
    noConsoleErrorsRejectsRealError: errorCheck.state === "fail",
    observerReset: !evidence.console.some(entry => entry.text.includes("Payment validation failed")),
    nativeProvenance: verificationCapture.summary.observations?.console.provenance === "safari-mcp",
    nativeActionContract: ["keys", "selected", "checked", "hovered"].every(name => nativeActions.value?.[name] === true),
    consoleAvailabilityTruthful: evidence.console.length > 0
      ? verificationCapture.summary.observations?.console.state === "pass"
      : verificationCapture.summary.observations?.console.state === "unavailable",
    debuggerUnavailableIsExplicit: evidence.debugger.paused === false && verificationCapture.warnings.some((warning) => warning.includes("JavaScript debugger")),
    interactiveMap: Boolean(submit?.uniqueAtCapture && submit.locator.kind === "css" && submit.locator.value === "#submit"),
    interactiveGeometry: Boolean((submit?.bounds?.width ?? 0) > 0 && (submit?.bounds?.height ?? 0) > 0),
    interactiveInputValueNotExposed: !JSON.stringify(amount ?? {}).includes("249.90") && amount?.text === "",
    interactiveState: disabled?.enabled === false && remember?.checked === true && !interactive.some((element) => element.name === "Hidden action") && !interactive.some((element) => element.role === "status"),
  };
  const passed = Object.values(assertions).every(Boolean);
  const failures = Object.entries(assertions).filter(([, value]) => !value).map(([name]) => name);
  const status = passed ? "verified" : "failed";
  const reason = passed ? undefined : `Smoke assertions failed: ${failures.join(", ")}`;
  process.stdout.write(`${JSON.stringify({
    passed,
    status,
    phase: "complete",
    ...(reason ? { reason } : {}),
    assertions,
    browserVersion,
    target: session.target,
    warnings: verificationCapture.warnings,
    networkCount: evidence.network.length,
    networkSample: evidence.network.slice(0, 5),
    networkSource: usesPerformanceNetwork ? "performance-resource-timing" : "safari-mcp",
    consoleSource: "safari-mcp",
    nativeActions: nativeActions.value,
    consoleCount: evidence.console.length,
    bodyText: evidence.dom.bodyText,
    screenshot: evidence.screenshot,
    initialScreenshot: initialCapture.details?.screenshot,
  }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    passed: false,
    status: phase === "fixture-ready" || phase === "session-start" ? "blocked" : "failed",
    phase,
    errorCode: error?.code ?? null,
    browserVersion,
    reason: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`);
  process.exitCode = phase === "fixture-ready" || phase === "session-start" ? 2 : 1;
} finally {
  await manager.closeAll("delete");
  await stopOwnedProcess(fixture, { label: "Safari vanilla fixture", processGroup: true });
}
