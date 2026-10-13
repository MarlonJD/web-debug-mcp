import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { transformWithEsbuild } from "vite";
import { SessionManager } from "../dist/core/session-manager.js";
import { toolDataSchemas } from "../dist/domain/wire-schemas.js";

const browserPath = process.env.WEB_DEBUG_CHROME_EXECUTABLE_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixtureSource = (fixed) => `function h(tag: string, props: unknown, ...children: unknown[]) { return children.join(""); }
async function run() {
  const response = await fetch("/api");
  const body = await response.json();
  const message = <span>{body.value}</span>;
  if (globalThis.__never) console.error("unexecuted branch");
  document.querySelector("#result")!.textContent = "${fixed ? "fixed" : "broken"}";
  ${fixed ? 'console.info("fixed response", message);' : 'console.error("fixture bug", message);'}
  document.querySelector("#status")!.textContent = "done";
}
document.querySelector("#run")!.addEventListener("click", run);
`;
const compile = async (fixed) => {
  const output = await transformWithEsbuild(fixtureSource(fixed), "Fixture.tsx", { minify: true, sourcemap: true, jsxFactory: "h", target: "es2022" });
  return `${output.code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(output.map)).toString("base64")}\n`;
};
const versions = { before: await compile(false), after: await compile(true) };
let fixed = false;
const server = createServer((request, response) => {
  response.setHeader("cache-control", "no-store");
  if (request.url === "/bundle.js") { response.setHeader("content-type", "text/javascript"); response.end(fixed ? versions.after : versions.before); }
  else if (request.url === "/api") { response.setHeader("content-type", "application/json"); response.end('{"value":"synthetic"}'); }
  else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><title>Source correlation fixture</title><button id="run">Run</button><div id="result">ready</div><div id="status">idle</div><script src="/bundle.js"></script>'); }
});
const manager = new SessionManager();
const sessions = [];
try {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/`;
  const session = await manager.start({ projectRoot: resolve("fixtures/vanilla"), url, executablePath: browserPath, headless: true });
  sessions.push(session.id);
  const before = await manager.capture(session.id, { profile: "include", surfaces: ["sources", "console", "network"] });
  toolDataSchemas.web_issue_capture.parse(before);
  const script = before.details.sources.scripts.find((item) => item.url.endsWith("/bundle.js"));
  assert.ok(script && script.mapping === "available", "inline source map resolved");
  const originalUrl = script.sources.find((source) => source.endsWith("/Fixture.tsx"));
  assert.ok(originalUrl, "original TSX file appears in inventory");
  const action = await manager.act(session.id, { kind: "click", locator: { kind: "css", value: "#run" } }, { diagnostics: { coverage: true, settleMs: 150 } });
  toolDataSchemas.web_browser_action.parse(action);
  assert.equal(action.diagnostics.cleanup, "complete");
  assert.equal(action.diagnostics.coverage.state, "collected");
  assert.ok(action.diagnostics.coverage.scripts.some((item) => item.functions.some((fn) => fn.ranges.some((range) => range.count > 0 && range.source?.original?.url === originalUrl))), "executed code mapped to TSX");
  const request = action.diagnostics.requests.find((item) => item.url.endsWith("/api"));
  assert.ok(request?.initiator?.original?.url === originalUrl, "fetch initiator maps to original TSX");
  assert.equal(request.status, 200);
  const delta = await manager.capture(session.id, { profile: "delta", cursor: before.cursor, surfaces: ["console", "network", "execution"] });
  toolDataSchemas.web_issue_capture.parse(delta);
  assert.ok(delta.differences.console.added.some((text) => text.includes("fixture bug")), "semantic console difference");
  assert.ok(delta.differences.requests.some((item) => item.key.includes("/api") && item.after > item.before), "semantic request difference");

  const line = fixtureSource(false).split("\n").findIndex((text) => text.includes('querySelector("#result")')) + 1;
  const breakpoint = await manager.setBreakpoint(session.id, { sourceUrl: originalUrl, line, column: 3, coordinateSpace: "original", scriptId: script.scriptId });
  toolDataSchemas.web_breakpoint_set.parse(breakpoint);
  assert.equal(breakpoint.resolved.line, 1, "original line maps into minified bundle");
  await manager.act(session.id, { kind: "click", locator: { kind: "css", value: "#run" } });
  let paused;
  for (let attempt = 0; attempt < 20; attempt++) {
    paused = await manager.capture(session.id, { profile: "include", surfaces: ["debugger"] });
    if (paused.details.debugger.paused) break;
    await delay(50);
  }
  assert.equal(paused.details.debugger.paused, true);
  assert.ok(paused.details.debugger.callFrames.some((frame) => frame.source?.original?.url === originalUrl && frame.source.original.line === line), "paused stack maps to requested original line");
  await manager.control(session.id, "resume");
  await manager.act(session.id, { kind: "reload" });
  const reloaded = await manager.capture(session.id, { profile: "include", surfaces: ["debugger"] });
  assert.equal(reloaded.details.debugger.breakpoints.find((item) => item.id === breakpoint.id).status, "stale", "original breakpoint identity invalidated on reload");
  await manager.close(session.id, "delete");

  const verificationSession = await manager.start({ projectRoot: resolve("fixtures/vanilla"), url, executablePath: browserPath, headless: true });
  sessions.push(verificationSession.id);
  const scenario = await manager.recordScenario({
    sessionId: verificationSession.id, name: "Mapped TSX repair", url,
    actions: [{ kind: "click", locator: { kind: "css", value: "#run" } }, { kind: "wait", locator: { kind: "css", value: "#status" }, property: "text", expected: "done", timeoutMs: 3000 }],
    failureSignature: [{ kind: "locatorText", locator: { kind: "css", value: "#result" }, text: "broken", match: "exact", expected: "pass" }],
    acceptanceChecks: [{ kind: "locatorText", locator: { kind: "css", value: "#result" }, text: "fixed", match: "exact" }, { kind: "noConsoleErrors" }],
  });
  assert.equal(scenario.baseline.status, "reproduced");
  fixed = true;
  const verified = await manager.verifyScenario({ sessionId: verificationSession.id, scenarioId: scenario.id });
  toolDataSchemas.web_fix_verify.parse(verified);
  assert.equal(verified.outcome, "verified");
  assert.equal(verified.evidence.postFix.browser.execution, null, "verification runs without coverage");
  assert.ok(verified.differences.console.removed.some((text) => text.includes("fixture bug")), "fix explanation records removed error");
  assert.equal(verified.differences.execution, null, "missing coverage is unknown");
  const newSources = await manager.capture(verificationSession.id, { profile: "include", surfaces: ["sources"] });
  const changedScript = newSources.details.sources.scripts.find((item) => item.url.endsWith("/bundle.js"));
  assert.notEqual(changedScript.hash, script.hash, "new generated script identity after source update");
  console.log(JSON.stringify({ passed: true, originalBreakpoint: true, staleBreakpointAfterReload: true, minifiedTsx: true, coverage: true, requestInitiator: true, semanticDelta: true, changedSourceIdentity: true, fixVerification: verified.outcome, coverageDisabledDuringVerification: true, cleanup: "awaited in finally" }, null, 2));
} finally {
  for (const id of sessions) await manager.close(id, "delete");
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
