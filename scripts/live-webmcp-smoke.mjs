import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { SessionManager } from "../dist/core/session-manager.js";
import { actionResultSchema, issueCaptureResultSchema } from "../dist/domain/wire-schemas.js";
import { stopOwnedProcess, waitForOutputReady } from "./lib/managed-process.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureScript = join(repositoryRoot, "scripts/serve-fixture.mjs");
const browserPath = process.env.WEB_DEBUG_CHROME_EXECUTABLE_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.WEB_DEBUG_FIXTURE_PORT ?? 4173);
const url = `http://127.0.0.1:${port}/`;
const fixture = spawn(process.execPath, [fixtureScript], {
  cwd: repositoryRoot,
  env: { ...process.env, WEB_DEBUG_FIXTURE_PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"],
  detached: process.platform !== "win32",
});
const artifactDir = await mkdtemp(join(tmpdir(), "web-debug-mcp-webmcp-smoke-"));
const previousFlag = process.env.WEB_DEBUG_ENABLE_WEBMCP_TESTING;
process.env.WEB_DEBUG_ENABLE_WEBMCP_TESTING = "1";
const manager = new SessionManager();

try {
  if (!existsSync(browserPath)) throw new Error(`Chromium executable not found: ${browserPath}. Set WEB_DEBUG_CHROME_EXECUTABLE_PATH.`);
  await waitForOutputReady(fixture, "Fixture available at", { label: "Vanilla WebMCP fixture", timeoutMs: 15_000 });
  const session = await manager.start({ projectRoot: join(repositoryRoot, "fixtures/vanilla"), url, executablePath: browserPath, headless: true });
  const before = await manager.capture(session.id, { profile: "include", surfaces: ["webmcp"] });
  const action = await manager.act(session.id, {
    kind: "webmcp",
    origin: new URL(url).origin,
    name: "submit_payment",
    arguments: { amount: 249.9 },
    allowSideEffects: true,
  });
  let missingToolCode = null;
  try {
    await manager.act(session.id, {
      kind: "webmcp",
      origin: new URL(url).origin,
      name: "missing_tool",
      arguments: {},
      allowSideEffects: true,
    });
  } catch (error) {
    missingToolCode = error?.code ?? null;
  }
  const oracle = await manager.evaluate(session.id, "globalThis.__WEB_DEBUG_PAYMENT_RECEIPT__ ?? null", false);
  const after = await manager.capture(session.id, { profile: "full" });
  const replay = await manager.seekReplay(session.id, after.summary.replay.newestIndex ?? 0, false);
  let restoreBlocked = false;
  try { await manager.seekReplay(session.id, replay.frame.index, true); }
  catch (error) { restoreBlocked = error?.code === "REPLAY_RESTORE_UNAVAILABLE"; }
  const result = {
    passed: action.schemaVersion === 1
      && action.kind === "webmcp"
      && action.toolResult === "Payment submitted: 249.90"
      && actionResultSchema.safeParse(action).success
      && missingToolCode === "WEBMCP_TOOL_NOT_FOUND"
      && oracle.value === "Payment submitted: 249.90"
      && before.summary.webmcp.callableTools === 1
      && after.summary.webmcp.callableTools === 1
      && after.summary.replay.restorable === false
      && after.summary.replay.restoreBlockedReason === "webmcp-direct-action"
      && after.details?.screenshot?.status === "suppressed"
      && issueCaptureResultSchema.safeParse(after).success
      && restoreBlocked,
    browserVersion: session.runtimeCapabilities?.browser ? session.runtimeCapabilities : null,
    action,
    missingToolCode,
    oracle,
    before: { webmcp: before.summary.webmcp },
    after: { webmcp: after.summary.webmcp, replay: after.summary.replay, screenshot: after.details?.screenshot?.status },
    artifactDir,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
  await manager.close(session.id, "delete");
} finally {
  await manager.closeAll("delete");
  if (previousFlag === undefined) delete process.env.WEB_DEBUG_ENABLE_WEBMCP_TESTING;
  else process.env.WEB_DEBUG_ENABLE_WEBMCP_TESTING = previousFlag;
  await stopOwnedProcess(fixture, { label: "Vanilla WebMCP fixture", processGroup: true });
  await rm(artifactDir, { recursive: true, force: true });
}
