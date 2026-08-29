import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stopOwnedProcess, waitForHttpReady, waitForOutputReady } from "../scripts/lib/managed-process.mjs";

describe("managed smoke process helper", () => {
  it("observes bounded output readiness and awaits graceful shutdown", async () => {
    const child = spawn(process.execPath, ["-e", "console.log('ready'); setInterval(() => {}, 1000)"], { stdio: ["ignore", "pipe", "pipe"] });
    try {
      await waitForOutputReady(child, "ready", { label: "ready child", timeoutMs: 1_000 });
      await expect(stopOwnedProcess(child, { label: "ready child", gracefulMs: 1_000 })).resolves.toMatchObject({ forced: false });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  });

  it("rejects a clean early exit and an HTTP readiness timeout", async () => {
    const exited = spawn(process.execPath, ["-e", ""], { stdio: ["ignore", "pipe", "pipe"] });
    await expect(waitForOutputReady(exited, "never", { label: "early child", timeoutMs: 1_000 })).rejects.toThrow(/exited before readiness/);

    const waiting = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: ["ignore", "pipe", "pipe"] });
    try {
      await expect(waitForHttpReady("http://127.0.0.1:1/", waiting, { label: "silent child", timeoutMs: 50, pollMs: 10 })).rejects.toThrow(/did not become ready/);
    } finally {
      await stopOwnedProcess(waiting, { label: "silent child", gracefulMs: 1_000 });
    }
  });

  it("escalates only its command-owned stubborn child after the graceful bound", async () => {
    const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)"], { stdio: ["ignore", "pipe", "pipe"] });
    try {
      await waitForOutputReady(child, "ready", { label: "stubborn child", timeoutMs: 1_000 });
      await expect(stopOwnedProcess(child, { label: "stubborn child", gracefulMs: 50, forceMs: 1_000 })).resolves.toMatchObject({ forced: true, signal: "SIGKILL" });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  });

  it.skipIf(process.platform === "win32")("escalates the exact command-owned process group including a stubborn grandchild", async () => {
    const directory = await mkdtemp(join(tmpdir(), "web-debug-mcp-process-group-test-"));
    const pidPath = join(directory, "grandchild.pid");
    const script = [
      "const { spawn } = require('node:child_process');",
      "const { writeFileSync } = require('node:fs');",
      "process.on('SIGTERM', () => {});",
      "const child = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\"], { stdio: 'ignore' });",
      "writeFileSync(process.argv[1], String(child.pid));",
      "console.log('ready');",
      "setInterval(() => {}, 1000);",
    ].join(" ");
    const child = spawn(process.execPath, ["-e", script, pidPath], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let grandchildPid = 0;
    try {
      await waitForOutputReady(child, "ready", { label: "process-group child", timeoutMs: 1_000 });
      grandchildPid = Number(await readFile(pidPath, "utf8"));
      expect(processExists(grandchildPid)).toBe(true);
      await expect(stopOwnedProcess(child, { label: "process-group child", processGroup: true, gracefulMs: 50, forceMs: 1_000 })).resolves.toMatchObject({ forced: true });
      expect(processExists(child.pid!)).toBe(false);
      expect(processExists(grandchildPid)).toBe(false);
    } finally {
      try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ }
      if (grandchildPid) try { process.kill(grandchildPid, "SIGKILL"); } catch { /* already gone */ }
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function processExists(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}
