import { chmod, mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { spawn, execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import { createServer } from "../src/index.js";
import { loadAuthStorageState } from "../src/core/auth-state.js";
import { aggregateAttempt, aggregateBaselineWithFailureViewports, aggregatePhase, aggregatePostFixEveryViewport, aggregateViewport, observationDigest } from "../src/core/aggregation.js";
import { ProcessRegistry, cleanupRegistry, inspectProcessIdentity, processIdentityMatches, registryStartupDiagnostic, type ProcessIdentity, type RegistryRecord } from "../src/core/process-registry.js";
import { SafariAdapter } from "../src/adapters/safari.js";
import { SessionManager } from "../src/core/session-manager.js";
import { chromiumRuntimeCapabilities } from "../src/adapters/runtime-capabilities.js";

const execFile = promisify(execFileCallback);

describe("0.3.x local fidelity contracts", () => {
  it("rejects selector-only browser actions at the MCP schema boundary and keeps 13 tools", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    const client = new Client({ name: "contract-test", version: "0.3.1" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(13);
    const result = await client.callTool({ name: "web_browser_action", arguments: { sessionId: "00000000-0000-0000-0000-000000000000", action: { kind: "click", selector: "#submit" } } });
    expect(result.isError).toBe(true);
    await client.close();
    await server.close();
  });

  it("keeps pure aggregation deterministic and honors exact failure viewport scope", () => {
    const observations = [{ key: "status", state: "pass" as const, freshness: "fresh" as const, provenance: "browser", observed: "ready" }];
    const desktop = aggregateViewport({ name: "desktop", width: 1_440, height: 900, observations: [{ ...observations[0]!, state: "fail", observed: "broken" }] });
    const mobile = aggregateViewport({ name: "mobile", width: 390, height: 844, observations });
    expect(observationDigest(observations)).toBe(observationDigest(observations));
    expect(aggregateAttempt([desktop, mobile]).verdict).toBe("fail");
    expect(aggregateBaselineWithFailureViewports([desktop, mobile], ["mobile"])).toBe("pass");
    expect(aggregatePostFixEveryViewport([mobile, mobile])).toBe("pass");
    expect(aggregatePhase([{ verdict: "pass", viewports: [desktop] }, { verdict: "fail", viewports: [mobile] }], 1, 1)).toBe("pass");
  });

  it("reads only a bounded contained auth fixture and registers no plaintext in its result shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-auth-contract-"));
    const path = join(root, "state.json");
    try {
      await writeFile(path, JSON.stringify({ cookies: [{ name: "session", value: "disposable-secret", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }], origins: [{ origin: "http://127.0.0.1:4173", localStorage: [{ name: "role", value: "Lead Inspector" }] }] }));
      const loaded = await loadAuthStorageState(path, root, "http://127.0.0.1:4173");
      expect(loaded.state.cookies).toHaveLength(1);
      expect(loaded.secrets).toContain("disposable-secret");
      expect(loaded.secrets).not.toContain("/");
      expect(loaded.secrets).not.toContain("role");
      expect(JSON.stringify({ state: loaded.state })).toContain("disposable-secret");
      const manager = new SessionManager(() => new MatrixAdapter(0));
      const session = await manager.start({ projectRoot: root, url: "http://127.0.0.1:4173/", executablePath: "/explicit", authFixture: { kind: "playwrightStorageState", path } });
      expect(session.url).toBe("http://127.0.0.1:4173/");
      expect(JSON.stringify(session)).not.toContain("disposable-secret");
      expect(session.authFixture).toBe("seeded-disposable");
      await manager.close(session.id);
      await writeFile(path, JSON.stringify({ cookies: [], origins: [], extra: true }));
      await expect(loadAuthStorageState(path, root, "http://127.0.0.1:4173")).rejects.toMatchObject({ code: "AUTH_SHAPE_INVALID" });
      await rm(path);
      await symlink(join(root, "missing"), path);
      await expect(loadAuthStorageState(path, root, "http://127.0.0.1:4173")).rejects.toMatchObject({ code: "AUTH_FILE_INVALID" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("tracks all requests and removes its exact record through idempotent shutdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-registry-contract-"));
    const registry = new ProcessRegistry({ directory: root, idleTtlMs: 0 });
    try {
      await registry.start();
      expect((await registry.read())?.state).toBe("idle");
      await registry.beginRequest();
      expect((await registry.read())?.activeRequestCount).toBe(1);
      await registry.endRequest(() => 0);
      expect((await registry.read())?.state).toBe("idle");
      await registry.requestShutdown(async () => undefined);
      await registry.requestShutdown(async () => undefined);
      await expect(readFile(registry.recordPath)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reconciles a record-cap directory before admission and removes each stale sidecar", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-registry-reconcile-cap-"));
    const staleRecords = Array.from({ length: 64 }, () => randomUUID());
    try {
      for (const instance of staleRecords) await writeRegistryFixture(root, instance, { pid: 9_999_999 });
      const registry = new ProcessRegistry({
        directory: root,
        idleTtlMs: 0,
        identityReader: async () => null,
        processExists: async () => false,
      });
      await registry.start();
      const entries = await readdir(root);
      expect(entries.filter((name) => name.endsWith(".json"))).toHaveLength(1);
      expect(entries.some((name) => name.endsWith(".lock") || name.endsWith(".tmp"))).toBe(false);
      await registry.requestShutdown(async () => undefined);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("removes a PID-reused identity mismatch without signaling the unrelated live process", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-registry-pid-reuse-"));
    const identity = await inspectProcessIdentity(process.pid);
    if (!identity) throw new Error("Current process identity was unavailable for the PID-reuse fixture.");
    const instance = randomUUID();
    const kill = vi.spyOn(process, "kill");
    try {
      await writeRegistryFixture(root, instance, { ...identity, startIdentity: `${identity.startIdentity}-reused` });
      const registry = new ProcessRegistry({ directory: root, idleTtlMs: 0 });
      await registry.start();
      const entries = await readdir(root);
      expect(entries).not.toContain(`${instance}.json`);
      expect(entries).not.toContain(`${instance}.lock`);
      expect(entries).not.toContain(`${instance}.tmp`);
      expect(kill.mock.calls.some((call) => call[1] === "SIGTERM" || call[1] === "SIGKILL")).toBe(false);
      await registry.requestShutdown(async () => undefined);
    } finally {
      kill.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("makes cleanup idempotently remove the exact stale record family", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-registry-cleanup-sidecars-"));
    const instance = randomUUID();
    try {
      await writeRegistryFixture(root, instance, { pid: 9_999_999 });
      const first = await cleanupRegistry({ directory: root });
      expect(first.removedStaleRecords).toBe(1);
      expect(first.failed).toBe(0);
      expect(await readdir(root)).toEqual([]);
      const second = await cleanupRegistry({ directory: root });
      expect(second).toMatchObject({ scanned: 0, removedStaleRecords: 0, failed: 0 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reclaims only stale owner-only orphan sidecars and retains recent ones", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-registry-orphan-sidecars-"));
    const staleInstance = randomUUID();
    const recentInstance = randomUUID();
    try {
      await writeFile(join(root, `${staleInstance}.lock`), "", { mode: 0o600 });
      await writeFile(join(root, `${staleInstance}.tmp`), "", { mode: 0o600 });
      await writeFile(join(root, `${recentInstance}.lock`), "", { mode: 0o600 });
      const now = Date.now();
      const staleTime = new Date(now - 60_000);
      await utimes(join(root, `${staleInstance}.lock`), staleTime, staleTime);
      await utimes(join(root, `${staleInstance}.tmp`), staleTime, staleTime);
      const registry = new ProcessRegistry({ directory: root, idleTtlMs: 0, now: () => now });
      await registry.start();
      const entries = await readdir(root);
      expect(entries).not.toContain(`${staleInstance}.lock`);
      expect(entries).not.toContain(`${staleInstance}.tmp`);
      expect(entries).toContain(`${recentInstance}.lock`);
      await registry.requestShutdown(async () => undefined);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps startup diagnostics bounded and on one stderr-safe line", () => {
    const diagnostic = registryStartupDiagnostic(new Error(`registry failed\n${"x".repeat(2_000)}`));
    expect(Buffer.byteLength(diagnostic, "utf8")).toBeLessThanOrEqual(550);
    expect(diagnostic).toContain("MCP server startup failed");
    expect(diagnostic).not.toContain("\n");
  });

  it("retains live-matching and identity-unverifiable records during startup repair", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-registry-retain-"));
    const identity = await inspectProcessIdentity(process.pid);
    if (!identity) throw new Error("Current process identity was unavailable for the retention fixture.");
    const liveInstance = randomUUID();
    const unknownInstance = randomUUID();
    try {
      await writeRegistryFixture(root, liveInstance, identity);
      await writeRegistryFixture(root, unknownInstance, { pid: process.ppid });
      const registry = new ProcessRegistry({
        directory: root,
        idleTtlMs: 0,
        identityReader: async (pid) => pid === process.pid ? identity : null,
        processExists: async () => true,
      });
      await registry.start();
      const entries = await readdir(root);
      expect(entries.filter((name) => name.endsWith(".json"))).toHaveLength(3);
      expect(entries).toContain(`${liveInstance}.json`);
      expect(entries).toContain(`${unknownInstance}.json`);
      await registry.requestShutdown(async () => undefined);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when live records still exhaust capacity after reconciliation", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-registry-live-cap-"));
    const identity = await inspectProcessIdentity(process.pid);
    if (!identity) throw new Error("Current process identity was unavailable for the cap fixture.");
    try {
      for (let index = 0; index < 64; index += 1) await writeRegistryFixture(root, randomUUID(), identity, false);
      const registry = new ProcessRegistry({
        directory: root,
        idleTtlMs: 0,
        identityReader: async () => identity,
        processExists: async () => true,
      });
      await expect(registry.start()).rejects.toMatchObject({
        code: "REGISTRY_RECORD_CAP",
        reconciliation: { retainedLiveRecords: 64, removedStaleRecords: 0 },
      });
      expect((await readdir(root)).filter((name) => name.endsWith(".json"))).toHaveLength(64);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects unsafe positive idle TTL values before registry startup", () => {
    expect(() => new ProcessRegistry({ directory: "/tmp/web-debug-ttl-test", idleTtlMs: 9 })).toThrow();
    expect(() => new ProcessRegistry({ directory: "/tmp/web-debug-ttl-test", idleTtlMs: 3_600_001 })).toThrow();
  });

  it("keeps matrix candidates ephemeral and captures named checkpoint boundaries", async () => {
    const adapters: MatrixAdapter[] = [];
    const manager = new SessionManager(() => { const adapter = new MatrixAdapter(adapters.length); adapters.push(adapter); return adapter; });
    const session = await manager.start({ projectRoot: "fixtures/vanilla", url: "http://127.0.0.1:4173/", executablePath: "/explicit" });
    const targetId = session.target?.targetId;
    const scenario = await manager.recordScenario({
      sessionId: session.id,
      name: "responsive checkpoint",
      url: "http://127.0.0.1:4173/",
      actions: [],
      failureSignature: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Bug", match: "contains", expected: "pass" }],
      acceptanceChecks: [{ kind: "locatorVisible", locator: { kind: "css", value: "body" }, visible: true }],
      checkpoints: [{ name: "initial", offset: 0, probes: [{ name: "status", locator: { kind: "css", value: "body" }, property: "visible", expected: true }] }],
      viewports: [{ name: "desktop", width: 1_440, height: 900 }, { name: "mobile", width: 390, height: 844 }],
      failureViewports: ["mobile"],
    });
    expect(scenario.baseline.status).toBe("reproduced");
    expect(scenario.baseline.evidence?.schemaVersion).toBe(4);
    expect(scenario.baseline.attempts[0]?.viewports).toHaveLength(2);
    expect(scenario.baseline.attempts[0]?.checkpoints?.length).toBeGreaterThan(0);
    expect(scenario.environmentFingerprint.schemaVersion).toBe(4);
    expect(scenario.baseline.evidence?.session.target?.targetId).toBe("matrix-2");
    expect(manager.status(session.id).target?.targetId).toBe(targetId);
    expect(adapters).toHaveLength(3);
    const changedScope = await manager.recordScenario({
      sessionId: session.id,
      name: "responsive checkpoint changed scope",
      url: "http://127.0.0.1:4173/",
      actions: [],
      failureSignature: [{ kind: "locatorText", locator: { kind: "css", value: "body" }, text: "Bug", match: "contains", expected: "pass" }],
      acceptanceChecks: [{ kind: "locatorVisible", locator: { kind: "css", value: "body" }, visible: true }],
      checkpoints: [{ name: "initial", offset: 0, probes: [{ name: "status", locator: { kind: "css", value: "body" }, property: "visible", expected: true }] }],
      viewports: [{ name: "desktop", width: 1_440, height: 900 }, { name: "mobile", width: 390, height: 844 }],
      failureViewports: ["desktop"],
    });
    expect(changedScope.contractHash).not.toBe(scenario.contractHash);
    const verification = await manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id });
    expect(verification.schemaVersion).toBe(6);
    expect(verification.evidence.postFix?.schemaVersion).toBe(4);
    const evidence = await manager.capture(session.id, { profile: "summary" });
    expect(evidence.schemaVersion).toBe(5);
    await manager.close(session.id);
  });

  it("keeps Safari strict and reports semantic capabilities unavailable", async () => {
    const safari = new SafariAdapter("http://127.0.0.1:4444");
    await expect(safari.start({ url: "https://127.0.0.1:4173/", tls: "allow-insecure-loopback" })).rejects.toMatchObject({ code: "SAFARI_TLS_UNAVAILABLE" });
    await expect(safari.probe({ kind: "role", role: "button" }, ["count"])).rejects.toMatchObject({ code: "LOCATOR_STRATEGY_UNAVAILABLE" });
  });

  it("fails closed for unsupported cleanup platforms and leaves unknown entries untouched", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-registry-unsupported-"));
    const registry = new ProcessRegistry({ directory: root, idleTtlMs: 0 });
    const sentinel = join(root, "sentinel.txt");
    try {
      await registry.start();
      await writeFile(sentinel, "keep");
      const report = await (await import("../src/core/process-registry.js")).cleanupRegistry({ directory: root, allIdle: true, platform: "freebsd" });
      expect(report.failed).toBeGreaterThan(0);
      expect(await readFile(sentinel, "utf8")).toBe("keep");
      expect((await registry.read())?.state).toBe("idle");
    } finally {
      await registry.requestShutdown(async () => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked or non-owner-only cleanup registry directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-registry-directory-"));
    const trusted = join(root, "trusted");
    const linked = join(root, "linked");
    try {
      await import("node:fs/promises").then(({ mkdir }) => mkdir(trusted, { mode: 0o700 }));
      await symlink(trusted, linked);
      const linkedReport = await cleanupRegistry({ directory: linked, allIdle: true });
      expect(linkedReport.failed).toBe(1);
      expect(linkedReport.failedDetails[0]?.reason).toBe("UNTRUSTED_REGISTRY_DIRECTORY");
      await rm(linked);
      await chmod(trusted, 0o755);
      const permissiveReport = await cleanupRegistry({ directory: trusted, allIdle: true });
      expect(permissiveReport.failedDetails[0]?.reason).toBe("UNTRUSTED_REGISTRY_DIRECTORY");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("closes the packaged stdio process on EOF and removes its exact registry record", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-stdio-eof-"));
    const child = spawn(process.execPath, [resolve("bin/web-debug-mcp.mjs")], {
      cwd: resolve("."),
      env: { ...process.env, TMPDIR: root, WEB_DEBUG_IDLE_TTL_MS: "0" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      const registryDirectory = await waitForRegistryRecord(root);
      child.stdin.end();
      const [code, signal] = await waitForChildExit(child, 7_000);
      expect(signal).toBeNull();
      expect(code).toBe(0);
      expect((await readdir(registryDirectory)).filter((name) => name.endsWith(".json"))).toHaveLength(0);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      await rm(root, { recursive: true, force: true });
    }
  }, 10_000);

  it("cleanup --all-idle terminates only its command-owned registered stdio child", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-cleanup-child-"));
    const launcher = join(root, "web-debug-mcp");
    await symlink(resolve("bin/web-debug-mcp.mjs"), launcher);
    const child = spawn(launcher, [], {
      cwd: resolve("."),
      env: { ...process.env, TMPDIR: root, WEB_DEBUG_IDLE_TTL_MS: "0" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      const registryDirectory = await waitForRegistryRecord(root);
      const recordName = (await readdir(registryDirectory)).find((name) => name.endsWith(".json"));
      const record = JSON.parse(await readFile(join(registryDirectory, recordName!), "utf8"));
      const identity = await inspectProcessIdentity(child.pid!);
      if (!identity || !processIdentityMatches(record, identity)) throw new Error(`Pre-cleanup identity mismatch: ${JSON.stringify({ record, identity })}`);
      const cleanup = await execFile(process.execPath, [resolve("bin/web-debug-mcp.mjs"), "cleanup", "--all-idle"], {
        cwd: resolve("."),
        env: { ...process.env, TMPDIR: root, WEB_DEBUG_IDLE_TTL_MS: "0" },
      }).catch((error: Error & { stdout?: string; stderr?: string }) => {
        throw new Error(`${error.message}\nstdout=${error.stdout ?? ""}\nstderr=${error.stderr ?? ""}`);
      });
      const report = JSON.parse(cleanup.stdout) as { terminated: number; failed: number };
      expect(report.terminated).toBe(1);
      expect(report.failed).toBe(0);
      await waitForChildExit(child, 7_000);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      await rm(root, { recursive: true, force: true });
    }
  }, 12_000);
});

async function waitForRegistryRecord(root: string): Promise<string> {
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  const directory = join(root, `web-debug-mcp-registry-${uid}`);
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const entries = await readdir(directory).catch(() => [] as string[]);
    if (entries.some((name) => name.endsWith(".json"))) return directory;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error("Timed out waiting for the command-owned registry record.");
}

async function waitForChildExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<[number | null, NodeJS.Signals | null]> {
  if (child.exitCode !== null || child.signalCode !== null) return [child.exitCode, child.signalCode];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      once(child, "exit") as Promise<[number | null, NodeJS.Signals | null]>,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Timed out waiting for child exit.")), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function writeRegistryFixture(root: string, instance: string, identity: Partial<ProcessIdentity>, includeSidecars = true): Promise<RegistryRecord> {
  const timestamp = "2026-09-02T00:00:00.000Z";
  const record: RegistryRecord = {
    schemaVersion: 1,
    instance,
    pid: identity.pid ?? 9_999_999,
    ppid: process.pid,
    packageVersion: "0.7.0",
    executable: identity.executable ?? process.execPath,
    packageEntry: identity.packageEntry ?? resolve("bin/web-debug-mcp.mjs"),
    startIdentity: identity.startIdentity ?? "dead-process",
    startedAt: timestamp,
    lastActivityAt: timestamp,
    idleSince: timestamp,
    heartbeatAt: timestamp,
    idleTtlMs: 0,
    activeSessionCount: 0,
    activeRequestCount: 0,
    busy: false,
    state: "idle",
  };
  await writeFile(join(root, `${instance}.json`), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  if (includeSidecars) {
    await writeFile(join(root, `${instance}.lock`), "", { mode: 0o600 });
    await writeFile(join(root, `${instance}.tmp`), "", { mode: 0o600 });
  }
  return record;
}

class MatrixAdapter {
  readonly target: any;
  private viewport = { width: 1_440, height: 900 };
  constructor(private readonly ordinal: number) {
    this.target = { browser: "chromium", remote: false, url: "http://127.0.0.1:4173/", title: "fixture", viewport: this.viewport, isolated: true, mode: "launch", targetId: `matrix-${ordinal}`, isolation: { browserProcess: true, context: true, profile: true, storage: true, cache: true, serviceWorkers: true, navigation: true, serverState: false } };
  }
  async start(options: any): Promise<any> { this.viewport = options.viewport ?? this.viewport; this.target.viewport = this.viewport; return { ...this.target }; }
  async close(): Promise<void> {}
  async act(action: any): Promise<any> { if (action.kind === "navigate") this.target.url = action.url; return { kind: action.kind, url: this.target.url, title: this.target.title }; }
  async snapshot(): Promise<any> { const text = this.viewport.width < 500 ? "Bug" : "Healthy"; return { url: this.target.url, title: this.target.title, viewport: this.viewport, dom: { bodyText: text, elements: [] }, console: [], network: [], screenshotPath: null, debugger: { paused: false, reason: null, callFrames: [], breakpoints: [] }, react: null, angular: null, vue: null, next: null, vite: null, warnings: [], observations: { url: { state: "pass", freshness: "fresh", provenance: "browser" }, dom: { state: "pass", freshness: "fresh", provenance: "browser" }, console: { state: "pass", freshness: "fresh", provenance: "browser" } } }; }
  async probe(locator: any, properties: string[]): Promise<any> { const text = this.viewport.width < 500 ? "Bug" : "Healthy"; return { locator, properties, observedAt: new Date().toISOString(), provenance: "browser", count: 1, visible: true, enabled: true, checked: false, text, warnings: [] }; }
  targetIdentity(): string { return this.target.targetId; }
  browserVersion(): string { return "matrix"; }
  runtimeCapabilities() { return chromiumRuntimeCapabilities(false); }
  async setBreakpoint(): Promise<any> { return { id: "matrix", sourceUrl: "", line: 1, column: null }; }
  async control(): Promise<any> { return { paused: false, reason: null, callFrames: [], breakpoints: [] }; }
  async evaluate(): Promise<any> { return { value: null, type: "object", description: null }; }
}
