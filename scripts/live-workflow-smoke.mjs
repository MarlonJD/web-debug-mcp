import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const baseline = Boolean(process.argv[2]);
const executablePath = process.env.WEB_DEBUG_CHROME_EXECUTABLE_PATH;
assert(executablePath, "Set an explicit command-owned test browser executable.");
const root = await mkdtemp(join(tmpdir(), "web-debug-workflow-fixture-"));
await writeFile(join(root, "index.html"), "<!doctype html><title>Workflow fixture</title>");
let fixed = false;
let partial = false;
const observations = [];
const server = createServer((request, response) => {
  response.setHeader("content-type", request.url === "/result" ? "application/json" : "text/html");
  if (request.url === "/result") {
    observations.push({ fixed, partial });
    response.flushHeaders();
    setTimeout(() => response.end(JSON.stringify({ value: fixed || partial ? "Fixed" : "Broken", number: fixed || partial ? 42 : 1 })), 70);
    return;
  }
  response.end(`<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
    <input id="private"><button id="run">Run</button><output id="status">Ready</output><output id="value"></output><output id="number"></output>
    <button id="resolve" style="position:fixed;left:20px;${partial ? "top:110vh" : "bottom:20px"}">Resolve</button>
    <div>${Array.from({ length: 160 }, (_, n) => `<p>Context item ${n}: bounded runtime evidence for diagnosis.</p>`).join("")}</div>
    <script>document.querySelector('#run').onclick=async()=>{
      const result=await fetch('/result').then(r=>r.json());
      document.querySelector('#value').textContent=result.value;
      document.querySelector('#number').textContent=result.number;
      document.querySelector('#status').textContent='Done';
    };</script>`);
});
server.listen(0, "127.0.0.1"); await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}/`;
const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(process.argv[2] ?? "bin/web-debug-mcp.mjs")], cwd: process.cwd(), stderr: "pipe" });
const client = new Client({ name: "workflow-public-mcp-smoke", version: "1.0.0" });
const results = [];
let sessionId;
const started = performance.now();
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 150_000 });
  results.push({ name, result });
  assert.notEqual(result.isError, true, JSON.stringify(result.structuredContent?.error));
  assert.equal(result.structuredContent?.ok, true);
  if (!baseline && (name === "web_repro_record" || name === "web_fix_verify")) {
    for (const artifact of result.structuredContent.artifacts) {
      assert.equal(artifact.delivery, "resource");
      const image = await client.readResource({ uri: artifact.uri });
      assert(image.contents[0].blob.length > 0);
    }
  }
  return { data: result.structuredContent.data, result };
};
try {
  await client.connect(transport);
  const catalog = await client.listTools(); assert.equal(catalog.tools.length, 13);
  if (!baseline) {
    assert(catalog.tools.every(tool => tool.inputSchema.examples?.length === 1));
    const privateValue = "invalid-private-value-must-not-be-reflected";
    const invalid = await client.callTool({ name: "web_browser_action", arguments: { sessionId: privateValue, action: { kind: privateValue } } });
    results.push({ name: "schema-rejection", result: invalid });
    assert.equal(invalid.structuredContent.error.code, "INVALID_TOOL_ARGUMENTS");
    assert(invalid.structuredContent.error.details.example);
    assert(!JSON.stringify(invalid).includes(privateValue));
  }
  await call("web_project_detect", { projectRoot: root });
  sessionId = (await call("web_session_start", { projectRoot: root, url, executablePath, headless: true, ...(!baseline ? { logFile: "dev.log" } : {}) })).data.id;
  const record = await call("web_repro_record", {
    sessionId, name: "Observe broken then corrected output", url,
    actions: baseline ? [{ kind: "click", locator: { kind: "css", value: "#run" } }, { kind: "wait", locator: { kind: "css", value: "#status" }, property: "text", expected: "Done", timeoutMs: 5_000 }] : [{ kind: "click", locator: { kind: "css", value: "#run" } }],
    failureSignature: [{ kind: "locatorText", locator: { kind: "css", value: "#value" }, text: "Fixed", match: "exact", expected: "fail" }],
    acceptanceChecks: [
      { kind: "locatorText", locator: { kind: "css", value: "#value" }, text: "Fixed", match: "exact" },
      ...(!baseline ? [
        { kind: "locatorNumber", locator: { kind: "css", value: "#number" }, value: 42 },
        { kind: "locatorInViewport", locator: { kind: "css", value: "#resolve" }, inViewport: true },
        { kind: "locatorUnobstructed", locator: { kind: "css", value: "#resolve" }, unobstructed: true },
        { kind: "networkResponse", path: "/result", method: "GET", status: 200 },
      ] : []),
    ],
    ...(!baseline ? { minimumPostFixAttempts: 3, completion: { checks: [{ kind: "networkComplete", path: "/result", method: "GET" }], timeoutMs: 5_000, stableForMs: 50 } } : {}),
  });
  assert.equal(record.data.baseline.status, "reproduced");
  if (!baseline) {
    partial = true;
    const rejected = await call("web_fix_verify", { sessionId, scenarioId: record.data.id });
    assert.equal(rejected.data.outcome, "failed");
    assert.equal(rejected.data.postFix.attempts.length, 3);
    assert(rejected.data.postFix.attempts.every(attempt => attempt.completion.state === "ready"));
    assert(rejected.data.postFix.attempts.every(attempt => attempt.checks.some(check => check.kind === "locatorInViewport" && check.state === "fail")));
    partial = false;
  }
  fixed = true;
  const verified = await call("web_fix_verify", { sessionId, scenarioId: record.data.id });
  assert.equal(verified.data.outcome, "verified");
  const flowCount = baseline ? 2 : 8;
  assert.equal(observations.length, flowCount);
  if (!baseline) {
    assert.equal(record.data.schemaVersion, 7); assert.equal(verified.data.schemaVersion, 7);
    assert.equal(verified.data.postFix.attempts.length, 3);
    assert(verified.data.postFix.attempts.every(attempt => attempt.completion.state === "ready"));
    assert(results.every(({ result }) => !result.content.some(item => item.type === "image")), "Compact verification must not inline screenshot pixels.");
    assert.equal(verified.data.evidence.baseline.uri, record.data.baseline.evidence.uri);
    const reference = verified.data.evidence.postFix;
    const original = await client.readResource({ uri: reference.uri });
    const read = await call("web_issue_capture", { sessionId, view: { profile: "recorded", evidenceRef: reference.uri } });
    assert.deepEqual(read.data, JSON.parse(original.contents[0].text));
    assert.equal(read.data.evidence.browser.dom.elements.find(element => element.id === "value").text, "Fixed");
    assert.equal(observations.length, flowCount, "Reading recorded evidence must not replay actions.");
    await call("web_browser_action", { sessionId, action: { kind: "fill", locator: { kind: "css", value: "#private" }, value: "3" } });
    await writeFile(join(root, "dev.log"), "private-echo=3\nAuthorization: Bearer local-fixture-credential\n");
    const logged = await call("web_issue_capture", { sessionId, view: { profile: "include", surfaces: ["serverLogs", "screenshot"] } });
    assert.equal(logged.data.collection.serverLogs, "fresh");
    assert.equal(logged.data.details.screenshot.status, "suppressed");
    assert(!logged.data.details.serverLogs.text.includes("=3"));
    assert(!logged.data.details.serverLogs.text.includes("local-fixture-credential"));
    assert.equal(logged.data.session.id, sessionId);
    assert.equal(new URL(logged.data.session.url).origin, new URL(url).origin);
    for (const expression of ["document.querySelector('#private').value", "Number(document.querySelector('#private').value)"]) {
      const evaluated = await call("web_debug_evaluate", { sessionId, expression });
      assert.notEqual(evaluated.data.value, "3"); assert.notEqual(evaluated.data.value, 3);
    }
    fixed = false;
    const privateRecord = await call("web_repro_record", {
      sessionId, name: "Short private input", url,
      actions: [{ kind: "fill", locator: { kind: "css", value: "#private" }, value: "3" }, { kind: "click", locator: { kind: "css", value: "#run" } }],
      failureSignature: [{ kind: "locatorText", locator: { kind: "css", value: "#value" }, text: "Fixed", expected: "fail" }],
      acceptanceChecks: [{ kind: "locatorNumber", locator: { kind: "css", value: "#number" }, value: 42 }],
      minimumPostFixAttempts: 3,
      completion: { checks: [{ kind: "networkComplete", path: "/result", method: "GET" }], timeoutMs: 5_000 },
    });
    assert.equal(privateRecord.data.baseline.status, "reproduced");
    fixed = true;
    const privateVerify = await call("web_fix_verify", { sessionId, scenarioId: privateRecord.data.id });
    assert.equal(privateVerify.data.outcome, "verified");
    assert.equal(privateVerify.result.structuredContent.artifacts.length, 0);
    const retained = await call("web_issue_capture", { sessionId, view: { profile: "recorded", evidenceRef: privateVerify.data.evidence.postFix.uri } });
    assert.equal(retained.data.evidence.session.id, sessionId);
    assert.equal(new URL(retained.data.evidence.browser.url).origin, new URL(url).origin);
    assert.equal(observations.length, flowCount + 5);
  }
  await call("web_session_close", { sessionId, artifactPolicy: "delete" });
  if (!baseline) {
    const expired = await client.callTool({ name: "web_issue_capture", arguments: { sessionId, view: { profile: "recorded", evidenceRef: verified.data.evidence.postFix.uri } } });
    assert.equal(expired.structuredContent.error.code, "EVIDENCE_NOT_FOUND");
  }
  const report = {
    passed: true, mode: baseline ? "released" : "candidate", transport: "public-stdio-mcp", tools: catalog.tools.length,
    catalogBytes: Buffer.byteLength(JSON.stringify(catalog)), elapsedSeconds: (performance.now() - started) / 1_000,
    recordBytes: Buffer.byteLength(JSON.stringify(record.result)), verificationBytes: Buffer.byteLength(JSON.stringify(verified.result)),
    structuredRecordBytes: Buffer.byteLength(JSON.stringify(record.data)), structuredVerificationBytes: Buffer.byteLength(JSON.stringify(verified.data)),
    actualFlowExecutions: observations.length, readWithoutReplay: !baseline, pixelDelivery: baseline ? "release-policy" : "resource-only",
    schemaGuidanceQualified: !baseline,
    logAndShortInputPrivacyQualified: !baseline,
  };
  if (process.env.WEB_DEBUG_EVIDENCE_OUTPUT) await writeFile(process.env.WEB_DEBUG_EVIDENCE_OUTPUT, JSON.stringify({ report, results }, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (process.env.WEB_DEBUG_EVIDENCE_OUTPUT) await writeFile(process.env.WEB_DEBUG_EVIDENCE_OUTPUT, JSON.stringify({ report: { passed: false, error: error.message }, results }, null, 2));
  throw error;
} finally {
  if (sessionId) await client.callTool({ name: "web_session_close", arguments: { sessionId, artifactPolicy: "delete" } }).catch(() => undefined);
  await client.close().catch(() => undefined);
  await transport.close().catch(() => undefined);
  await new Promise(resolveClose => server.close(resolveClose));
  await rm(root, { recursive: true, force: true });
}
