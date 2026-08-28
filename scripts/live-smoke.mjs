import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ChromiumAdapter } from "../dist/adapters/chromium.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureScript = join(repositoryRoot, "scripts/serve-fixture.mjs");
const browserPath = process.env.WEB_DEBUG_CHROME_EXECUTABLE_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.WEB_DEBUG_FIXTURE_PORT ?? 4173);
const url = `http://127.0.0.1:${port}/`;
const sourceUrl = `${url}app.js`;
const artifactDir = await mkdtemp(join(tmpdir(), "web-debug-mcp-live-"));

if (!existsSync(browserPath)) {
  throw new Error(`Chromium executable not found: ${browserPath}. Set WEB_DEBUG_CHROME_EXECUTABLE_PATH.`);
}

const fixture = spawn(process.execPath, [fixtureScript], {
  cwd: repositoryRoot,
  env: { ...process.env, WEB_DEBUG_FIXTURE_PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"],
});
const fixtureReady = waitForFixture(fixture);
const adapter = new ChromiumAdapter();

try {
  await fixtureReady;
  const target = await adapter.start({ url, executablePath: browserPath, headless: true });
  const breakpoint = await adapter.setBreakpoint({ sourceUrl, line: 12 });
  await adapter.act({ kind: "click", locator: { kind: "css", value: "#submit" } });
  const snapshot = await adapter.snapshot({ artifactDir, captureScreenshot: true });
  const frame = snapshot.debugger.callFrames.find((candidate) => candidate.url === sourceUrl);
  const assertions = {
    paused: snapshot.debugger.paused,
    reason: snapshot.debugger.reason === "breakpoint",
    source: frame?.url === sourceUrl,
    line: frame?.line === 12,
    locals: Object.values(frame?.locals ?? {}).some((value) => value === 249.9),
    localTarget: target.remote === false,
    screenshot: Boolean(snapshot.screenshotPath),
    consoleClean: snapshot.console.length === 0,
  };
  const passed = Object.values(assertions).every(Boolean);
  process.stdout.write(`${JSON.stringify({ passed, assertions, target, breakpoint, artifactDir }, null, 2)}\n`);
  if (snapshot.debugger.paused) await adapter.control("resume");
  if (!passed) process.exitCode = 1;
} finally {
  await adapter.close();
  fixture.kill("SIGTERM");
}

function waitForFixture(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes("Fixture available at")) {
        child.stdout.off("data", onData);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== null && code !== 0) reject(new Error(`Fixture server exited with code ${code}: ${output}`));
    });
  });
}
