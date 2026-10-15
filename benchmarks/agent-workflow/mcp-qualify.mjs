// Public stdio qualification of the candidate on the pinned applications.
import assert from "node:assert/strict";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [kind, url, reference, bin, output] = process.argv.slice(2);
const transport = new StdioClientTransport({ command: process.execPath, args: [bin], cwd: process.cwd(), stderr: "pipe" });
const client = new Client({ name: "pinned-project-public-mcp-qualification", version: "1.0.0" });
const calls = [];
let sessionId;
const css = value => ({ kind: "css", value });
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 150_000 });
  calls.push({ name, result });
  assert.equal(result.structuredContent?.ok, true, JSON.stringify(result.structuredContent?.error ?? result));
  return result.structuredContent.data;
};
try {
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 13);
  await call("web_project_detect", { projectRoot: process.cwd() });
  sessionId = (await call("web_session_start", { projectRoot: process.cwd(), url, executablePath: process.env.BENCH_CHROME, headless: true, logFile: "server.log" })).id;
  let actions, checks, signature, completion;
  if (kind === "todo") {
    actions = [];
    for (const value of ["MCP Alpha", "MCP Beta", "MCP Gamma"]) actions.push({ kind: "fill", locator: css(".new-todo"), value }, { kind: "press", locator: css(".new-todo"), key: "Enter" });
    actions.push({ kind: "check", locator: css(".todo-list li:nth-child(1) .toggle"), checked: true }, { kind: "check", locator: css(".todo-list li:nth-child(3) .toggle"), checked: true }, { kind: "click", locator: css(".clear-completed") });
    checks = [{ kind: "locatorCount", locator: css(".todo-list li"), count: 1 }, { kind: "locatorCount", locator: css(".todo-list li.completed"), count: 0 }];
    signature = [{ ...checks[1], expected: "fail" }];
  } else if (kind === "grid") {
    actions = [{ kind: "fill", locator: css("input[name=query]"), value: "e" }, { kind: "click", locator: css("th:first-child") }];
    checks = [{ kind: "locatorCount", locator: css("tbody tr"), count: 3 }, { kind: "locatorText", locator: css("tbody tr:first-child td:first-child"), text: "Jet Li", match: "exact" }];
    signature = [{ ...checks[1], expected: "fail" }];
    completion = { checks: [checks[0]], timeoutMs: 5_000 };
  } else {
    const value = (await readFile("private-input.txt", "utf8")).trimEnd();
    actions = [{ kind: "fill", locator: css("#todo"), value }, { kind: "click", locator: { kind: "role", role: "button", name: "Add" } }, { kind: "wait", locator: css("main > ul > li"), property: "count", expected: 2, timeoutMs: 5_000 }, { kind: "click", locator: css("main > ul > li:nth-child(2) button") }];
    checks = [{ kind: "locatorCount", locator: css("main > ul > li"), count: 1 }];
    signature = [{ ...checks[0], expected: "fail" }];
    completion = { checks: [{ kind: "networkComplete", path: "/", method: "POST", minimumCount: 2 }], timeoutMs: 5_000 };
  }
  const scenario = await call("web_repro_record", { sessionId, name: "Pinned application repair", url, actions, failureSignature: signature, acceptanceChecks: checks, minimumPostFixAttempts: 3, requestedLevel: "standard", ...(completion ? { completion } : {}), ...(kind === "forms" ? { risks: { serverStateLeakage: true }, serverStateReset: { action: { kind: "navigate", url: `${url}/api/bench-reset` }, readyCheck: { kind: "route", path: "/" } } } : {}) });
  assert.equal(scenario.baseline.status, "reproduced");
  const file = kind === "todo" ? "src/controller.js" : kind === "grid" ? "index.html" : "app/actions.ts";
  await copyFile(resolve(reference, file), resolve(file));
  const verified = await call("web_fix_verify", { sessionId, scenarioId: scenario.id });
  assert.equal(verified.outcome, "verified");
  assert.equal(verified.postFix.attempts.length, 3);
  const recorded = await call("web_issue_capture", { sessionId, view: { profile: "recorded", evidenceRef: verified.evidence.postFix.uri } });
  assert.equal(recorded.evidence.session.id, sessionId);
  if (kind === "forms") {
    const secret = (await readFile("private-input.txt", "utf8")).trimEnd();
    assert(!JSON.stringify(calls).includes(secret));
    const logs = await call("web_issue_capture", { sessionId, view: { profile: "include", surfaces: ["serverLogs", "next"] } });
    assert.equal(logs.collection.serverLogs, "fresh");
    assert.equal(logs.collection.next, "fresh");
    assert(logs.details.next.serverActionExecutions.length >= 2);
    assert(!JSON.stringify(calls).includes(secret));
  }
  await call("web_session_close", { sessionId, artifactPolicy: "delete" });
  const report = { passed: true, case: kind, transport: "public-stdio-mcp", actualBaselineAttempts: scenario.baseline.attempts.length, actualPostFixAttempts: verified.postFix.attempts.length, retainedEvidenceRead: true };
  await writeFile(output, JSON.stringify({ report, calls }, null, 2));
  process.stdout.write(JSON.stringify(report) + "\n");
} catch (error) {
  await writeFile(output, JSON.stringify({ report: { passed: false, case: kind, error: error.message }, calls }, null, 2));
  throw error;
} finally {
  if (sessionId) await client.callTool({ name: "web_session_close", arguments: { sessionId, artifactPolicy: "delete" } }).catch(() => undefined);
  await client.close().catch(() => undefined);
  await transport.close().catch(() => undefined);
}
