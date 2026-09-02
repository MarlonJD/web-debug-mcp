import { constants as fsConstants, readFileSync } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, readdir, rename, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

import { errorMessage } from "./errors.js";
import { PACKAGE_VERSION } from "./version.js";

const execFileAsync = promisify(execFile);
export const REGISTRY_DIRECTORY_CAP = 128;
export const REGISTRY_RECORD_CAP = 64;
export const REGISTRY_RECONCILIATION_ENTRY_CAP = REGISTRY_RECORD_CAP * 3;
export const REGISTRY_RECORD_BYTES = 16_384;
export const REGISTRY_HEARTBEAT_MS = 15_000;
export const REGISTRY_STALE_HEARTBEAT_MS = 45_000;
export const REGISTRY_DEFAULT_IDLE_TTL_MS = 300_000;
export const REGISTRY_MIN_IDLE_TTL_MS = 10_000;
export const REGISTRY_MAX_IDLE_TTL_MS = 3_600_000;
export const REGISTRY_LOCK_WAIT_MS = 500;
export const REGISTRY_SIGTERM_GRACE_MS = 2_000;
export const REGISTRY_SIGKILL_GRACE_MS = 1_000;
export const REGISTRY_CLEANUP_BUDGET_MS = 5_000;
export const REGISTRY_RECONCILIATION_BUDGET_MS = 2_000;
export const CLEANUP_REPORT_BYTES = 65_536;
export const CLEANUP_DETAIL_CAP = 64;

export type RegistryState = "idle" | "running" | "terminating";

export interface ProcessIdentity {
  pid: number;
  uid: number;
  startIdentity: string;
  executable: string;
  packageEntry: string;
}

export interface RegistryRecord {
  schemaVersion: 1;
  instance: string;
  pid: number;
  ppid: number;
  packageVersion: string;
  executable: string;
  packageEntry: string;
  startIdentity: string;
  startedAt: string;
  lastActivityAt: string;
  idleSince: string | null;
  heartbeatAt: string;
  idleTtlMs: number;
  activeSessionCount: number;
  activeRequestCount: number;
  busy: boolean;
  state: RegistryState;
}

export interface CleanupDetail { instance?: string; path: string; reason: string; }
export interface RegistryReconciliationReport {
  schemaVersion: 1;
  scanned: number;
  removedStaleRecords: number;
  retainedLiveRecords: number;
  retainedUnverifiableRecords: number;
  retainedMalformedRecords: number;
  failed: number;
  removedStaleRecordDetails: CleanupDetail[];
  retainedDetails: CleanupDetail[];
  failedDetails: CleanupDetail[];
  truncated: boolean;
}

export interface RegistryReadiness {
  schemaVersion: 1;
  status: "ready" | "warn" | "fail";
  entries: number;
  records: number;
  message: string;
  recovery?: string;
}

export interface CleanupReport {
  schemaVersion: 1;
  version: string;
  scanned: number;
  terminated: number;
  skippedActive: number;
  removedStaleRecords: number;
  failed: number;
  terminatedDetails: CleanupDetail[];
  skippedActiveDetails: CleanupDetail[];
  removedStaleRecordDetails: CleanupDetail[];
  failedDetails: CleanupDetail[];
  truncated: boolean;
}

export interface RegistryOptions {
  directory?: string;
  now?: () => number;
  timestamp?: () => string;
  idleTtlMs?: number;
  packageVersion?: string;
  packageEntry?: string;
  executable?: string;
  identity?: ProcessIdentity;
  platform?: NodeJS.Platform;
  identityReader?: (pid: number, platform: NodeJS.Platform) => Promise<ProcessIdentity | null>;
  processExists?: (pid: number) => Promise<boolean>;
}

export class RegistryStartupError extends Error {
  constructor(
    public readonly code: "REGISTRY_DIRECTORY_CAP" | "REGISTRY_RECORD_CAP" | "REGISTRY_RECONCILIATION_FAILED",
    public readonly entries: number,
    public readonly records: number,
    public readonly reconciliation: RegistryReconciliationReport,
  ) {
    super(`${code} after identity-safe reconciliation (entries=${entries}, records=${records}, removed=${reconciliation.removedStaleRecords})`);
    this.name = "RegistryStartupError";
  }
}

export class ProcessRegistry {
  readonly instance: string;
  readonly directory: string;
  readonly recordPath: string;
  readonly lockPath: string;
  private readonly now: () => number;
  private readonly timestamp: () => string;
  private readonly platform: NodeJS.Platform;
  private readonly packageVersion: string;
  private readonly packageEntry: string;
  private readonly executable: string;
  private readonly identity: ProcessIdentity;
  private readonly idleTtlMs: number;
  private readonly identityReader: (pid: number, platform: NodeJS.Platform) => Promise<ProcessIdentity | null>;
  private readonly processExists: (pid: number) => Promise<boolean>;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private shutdownPromise: Promise<void> | null = null;
  private initialized = false;
  private shutdownHandler: (() => Promise<void>) | null = null;

  constructor(options: RegistryOptions = {}) {
    this.instance = randomUUID();
    const uid = typeof process.getuid === "function" ? process.getuid() : null;
    if (uid === null && !options.directory) throw new Error("Web Debug process registry requires a numeric user identity.");
    this.directory = options.directory ?? join(tmpdir(), `web-debug-mcp-registry-${uid}`);
    this.recordPath = join(this.directory, `${this.instance}.json`);
    this.lockPath = join(this.directory, `${this.instance}.lock`);
    this.now = options.now ?? (() => Date.now());
    this.timestamp = options.timestamp ?? (() => new Date().toISOString());
    this.platform = options.platform ?? process.platform;
    this.packageVersion = options.packageVersion ?? PACKAGE_VERSION;
    this.packageEntry = resolve(options.packageEntry ?? process.argv[1] ?? "");
    this.executable = resolve(options.executable ?? process.execPath);
    this.identity = options.identity ?? {
      pid: process.pid,
      uid: uid ?? 0,
      startIdentity: currentStartIdentity(this.platform, process.pid),
      executable: this.executable,
      packageEntry: this.packageEntry,
    };
    this.identityReader = options.identityReader ?? readProcessIdentity;
    this.processExists = options.processExists ?? processExistsForRegistry;
    this.idleTtlMs = parseIdleTtl(options.idleTtlMs ?? process.env.WEB_DEBUG_IDLE_TTL_MS);
  }

  get ttlMs(): number { return this.idleTtlMs; }
  setShutdownHandler(handler: () => Promise<void>): void { this.shutdownHandler = handler; }

  async start(): Promise<void> {
    await ensureSecureDirectory(this.directory, this.identity.uid);
    const reconciliation = await reconcileRegistryArtifacts({
      directory: this.directory,
      platform: this.platform,
      identityReader: this.identityReader,
      processExists: this.processExists,
      now: this.now,
    });
    const existingEntries = await readdir(this.directory, { withFileTypes: true });
    const existingRecords = existingEntries.filter((entry) => entry.isFile() && isRegistryRecordFilename(entry.name));
    if (reconciliation.failed > 0) throw new RegistryStartupError("REGISTRY_RECONCILIATION_FAILED", existingEntries.length, existingRecords.length, reconciliation);
    if (existingEntries.length >= REGISTRY_DIRECTORY_CAP) throw new RegistryStartupError("REGISTRY_DIRECTORY_CAP", existingEntries.length, existingRecords.length, reconciliation);
    if (existingRecords.length >= REGISTRY_RECORD_CAP) throw new RegistryStartupError("REGISTRY_RECORD_CAP", existingEntries.length, existingRecords.length, reconciliation);
    const initial: RegistryRecord = {
      schemaVersion: 1,
      instance: this.instance,
      pid: this.identity.pid,
      ppid: process.ppid,
      packageVersion: this.packageVersion,
      executable: this.identity.executable,
      packageEntry: this.identity.packageEntry,
      startIdentity: this.identity.startIdentity,
      startedAt: this.timestamp(),
      lastActivityAt: this.timestamp(),
      idleSince: this.timestamp(),
      heartbeatAt: this.timestamp(),
      idleTtlMs: this.idleTtlMs,
      activeSessionCount: 0,
      activeRequestCount: 0,
      busy: false,
      state: "idle",
    };
    await this.withLock(async () => writeRecord(this.recordPath, initial));
    this.initialized = true;
    this.heartbeatTimer = setInterval(() => { void this.heartbeat(); }, REGISTRY_HEARTBEAT_MS);
    this.heartbeatTimer.unref?.();
    this.armIdleTimer(this.idleTtlMs);
  }

  async heartbeat(): Promise<void> {
    if (!this.initialized) return;
    await this.withLock(async () => {
      const record = await readRecord(this.recordPath);
      if (!record || record.state === "terminating") return;
      record.heartbeatAt = this.timestamp();
      await writeRecord(this.recordPath, record);
    }).catch(() => undefined);
  }

  async beginRequest(): Promise<void> {
    await this.update((record) => {
      if (record.state === "terminating") throw new Error("PROCESS_TERMINATING");
      record.activeRequestCount += 1;
      record.busy = true;
      record.state = "running";
      record.idleSince = null;
      record.lastActivityAt = this.timestamp();
    });
    this.clearIdleTimer();
  }

  async endRequest(activeSessionCount: () => number): Promise<void> {
    await this.update((record) => {
      const sessionCount = activeSessionCount();
      if (!Number.isSafeInteger(sessionCount) || sessionCount < 0) throw new Error("ACTIVE_SESSION_COUNT_INVALID");
      const terminating = record.state === "terminating";
      record.activeSessionCount = sessionCount;
      record.activeRequestCount = Math.max(0, record.activeRequestCount - 1);
      record.busy = record.activeRequestCount > 0 || record.activeSessionCount > 0;
      record.lastActivityAt = this.timestamp();
      if (terminating) { record.state = "terminating"; record.idleSince = null; }
      else if (record.busy) { record.state = "running"; record.idleSince = null; }
      else { record.state = "idle"; record.idleSince ??= this.timestamp(); }
    });
    await this.armIdleFromRecord();
  }

  async requestShutdown(closeOwned: () => Promise<void>): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = (async () => {
      await this.markTerminating().catch(() => undefined);
      this.clearIdleTimer();
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      await waitBounded(closeOwned(), REGISTRY_CLEANUP_BUDGET_MS);
      await this.removeRecord().catch(() => undefined);
    })();
    return this.shutdownPromise;
  }

  async markTerminating(): Promise<boolean> {
    let changed = false;
    await this.withLock(async () => {
      const record = await readRecord(this.recordPath);
      if (!record || record.state === "terminating") return;
      record.state = "terminating";
      await writeRecord(this.recordPath, record);
      changed = true;
    });
    return changed;
  }

  async removeRecord(): Promise<void> {
    await removeRegistryArtifacts(this.directory, this.instance);
  }

  async read(): Promise<RegistryRecord | null> { return readRecord(this.recordPath); }

  private async update(mutator: (record: RegistryRecord) => void): Promise<void> {
    if (!this.initialized) return;
    await this.withLock(async () => {
      const record = await readRecord(this.recordPath);
      if (!record) return;
      mutator(record);
      await writeRecord(this.recordPath, record);
    });
  }

  private async armIdleFromRecord(): Promise<void> {
    const record = await this.read();
    if (!record || record.busy || record.state !== "idle") return;
    this.armIdleTimer(Math.max(0, record.idleTtlMs - (this.now() - Date.parse(record.idleSince ?? this.timestamp()))));
  }

  private armIdleTimer(delayMs: number): void {
    this.clearIdleTimer();
    if (this.idleTtlMs === 0) return;
    this.idleTimer = setTimeout(() => { void this.expireIfIdle(); }, Math.max(1, delayMs));
    this.idleTimer.unref?.();
  }

  private clearIdleTimer(): void { if (this.idleTimer) clearTimeout(this.idleTimer); this.idleTimer = undefined; }

  private async expireIfIdle(): Promise<void> {
    let shouldClose = false;
    await this.withLock(async () => {
      const record = await readRecord(this.recordPath);
      if (!record || record.state !== "idle" || record.busy || record.activeRequestCount !== 0 || record.activeSessionCount !== 0 || !record.idleSince) return;
      if (this.now() - Date.parse(record.idleSince) < record.idleTtlMs) return;
      record.state = "terminating";
      await writeRecord(this.recordPath, record);
      shouldClose = true;
    }).catch(() => undefined);
    if (shouldClose) await this.requestShutdown(this.shutdownHandler ?? (async () => undefined));
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await acquireLock(this.lockPath, REGISTRY_LOCK_WAIT_MS);
    try { return await operation(); } finally { await rm(this.lockPath, { force: true }); }
  }
}

const registryRecordFilenamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i;
const registryInstancePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function reconcileRegistryArtifacts(options: {
  directory: string;
  platform?: NodeJS.Platform;
  identityReader?: (pid: number, platform: NodeJS.Platform) => Promise<ProcessIdentity | null>;
  processExists?: (pid: number) => Promise<boolean>;
  now?: () => number;
  budgetMs?: number;
}): Promise<RegistryReconciliationReport> {
  const report: RegistryReconciliationReport = {
    schemaVersion: 1,
    scanned: 0,
    removedStaleRecords: 0,
    retainedLiveRecords: 0,
    retainedUnverifiableRecords: 0,
    retainedMalformedRecords: 0,
    failed: 0,
    removedStaleRecordDetails: [],
    retainedDetails: [],
    failedDetails: [],
    truncated: false,
  };
  const platform = options.platform ?? process.platform;
  const identityReader = options.identityReader ?? readProcessIdentity;
  const processExists = options.processExists ?? processExistsForRegistry;
  const now = options.now ?? (() => Date.now());
  const entries = await readdir(options.directory, { withFileTypes: true }).catch(() => [] as import("node:fs").Dirent[]);
  const records = entries.filter((entry) => entry.isFile() && isRegistryRecordFilename(entry.name));
  if (entries.length > REGISTRY_RECONCILIATION_ENTRY_CAP || records.length > REGISTRY_RECORD_CAP) {
    addReconciliationDetail(report.retainedDetails, { path: options.directory, reason: entries.length > REGISTRY_RECONCILIATION_ENTRY_CAP ? "RECONCILIATION_ENTRY_CAP" : "REGISTRY_RECORD_CAP" }, report);
    return report;
  }
  const recordInstances = new Set(records.map((entry) => entry.name.slice(0, -".json".length).toLowerCase()));
  const deadline = now() + Math.max(1, Math.min(REGISTRY_RECONCILIATION_BUDGET_MS, options.budgetMs ?? REGISTRY_RECONCILIATION_BUDGET_MS));

  for (const entry of records) {
    report.scanned += 1;
    const path = join(options.directory, entry.name);
    const instance = entry.name.slice(0, -".json".length);
    if (now() >= deadline) {
      report.retainedUnverifiableRecords += 1;
      addReconciliationDetail(report.retainedDetails, { instance, path, reason: "RECONCILIATION_BUDGET" }, report);
      continue;
    }
    const record = await readRecord(path);
    if (!record || !registryInstancePattern.test(record.instance) || record.instance.toLowerCase() !== instance.toLowerCase()) {
      report.retainedMalformedRecords += 1;
      addReconciliationDetail(report.retainedDetails, { instance, path, reason: "MALFORMED_RECORD" }, report);
      continue;
    }
    if (platform !== "linux" && platform !== "darwin") {
      report.retainedUnverifiableRecords += 1;
      addReconciliationDetail(report.retainedDetails, { instance, path, reason: "UNSUPPORTED_PLATFORM" }, report);
      continue;
    }
    let identity: ProcessIdentity | null = null;
    try { identity = await identityReader(record.pid, platform); } catch { identity = null; }
    if (identity) {
      if (identityMatches(record, identity)) {
        report.retainedLiveRecords += 1;
        addReconciliationDetail(report.retainedDetails, { instance, path, reason: "LIVE_IDENTITY_MATCH" }, report);
      } else {
        await removeReconciledRecord(options.directory, instance, path, report, "IDENTITY_MISMATCH");
      }
      continue;
    }
    let exists = true;
    try { exists = await processExists(record.pid); } catch { exists = true; }
    if (!exists) {
      await removeReconciledRecord(options.directory, instance, path, report, "DEAD_OR_STALE");
    } else {
      report.retainedUnverifiableRecords += 1;
      addReconciliationDetail(report.retainedDetails, { instance, path, reason: "IDENTITY_UNAVAILABLE" }, report);
    }
  }

  const orphanInstances = new Set(entries
    .filter((entry) => entry.isFile() && /\.(?:lock|tmp)$/i.test(entry.name))
    .map((entry) => entry.name.replace(/\.(?:lock|tmp)$/i, ""))
    .filter((instance) => registryInstancePattern.test(instance) && !recordInstances.has(instance.toLowerCase())));
  for (const instance of orphanInstances) {
    report.scanned += 1;
    const path = join(options.directory, `${instance}.lock`);
    if (now() >= deadline) {
      report.retainedUnverifiableRecords += 1;
      addReconciliationDetail(report.retainedDetails, { instance, path, reason: "RECONCILIATION_BUDGET" }, report);
      continue;
    }
    const artifactPaths = [join(options.directory, `${instance}.lock`), join(options.directory, `${instance}.tmp`)];
    const artifacts = (await Promise.all(artifactPaths.map(async (artifactPath) => ({
      path: artifactPath,
      info: await lstat(artifactPath).catch(() => null),
    })))).filter((artifact) => artifact.info !== null);
    const uid = typeof process.getuid === "function" ? process.getuid() : null;
    const trusted = uid !== null && artifacts.length > 0 && artifacts.every(({ info }) => info!.isFile()
      && !info!.isSymbolicLink()
      && info!.uid === uid
      && (info!.mode & 0o077) === 0
      && info!.size <= REGISTRY_RECORD_BYTES);
    if (!trusted || artifacts.some(({ info }) => now() - info!.mtimeMs <= REGISTRY_STALE_HEARTBEAT_MS)) {
      report.retainedUnverifiableRecords += 1;
      addReconciliationDetail(report.retainedDetails, { instance, path: artifacts[0]?.path ?? path, reason: trusted ? "RECENT_ORPHAN_SIDECAR" : "UNTRUSTED_ORPHAN_SIDECAR" }, report);
      continue;
    }
    await removeReconciledRecord(options.directory, instance, artifacts[0]!.path, report, "ORPHAN_SIDECARS");
  }
  return report;
}

async function removeReconciledRecord(directory: string, instance: string, recordPath: string, report: RegistryReconciliationReport, reason: string): Promise<void> {
  try {
    await removeRegistryArtifacts(directory, instance);
    report.removedStaleRecords += 1;
    addReconciliationDetail(report.removedStaleRecordDetails, { instance, path: recordPath, reason }, report);
  } catch {
    report.failed += 1;
    addReconciliationDetail(report.failedDetails, { instance, path: recordPath, reason: "ARTIFACT_REMOVE_FAILED" }, report);
  }
}

async function removeRegistryArtifacts(directory: string, instance: string): Promise<void> {
  if (!registryInstancePattern.test(instance)) throw new Error("REGISTRY_INSTANCE_INVALID");
  const paths = [
    join(directory, `${instance}.json`),
    join(directory, `${instance}.lock`),
    join(directory, `${instance}.tmp`),
  ];
  const failures: unknown[] = [];
  for (const path of paths) {
    try { await rm(path, { force: true }); } catch (error) { failures.push(error); }
  }
  if (failures.length > 0) throw failures[0];
}

export async function inspectRegistryReadiness(options: { directory: string; platform?: NodeJS.Platform } ): Promise<RegistryReadiness> {
  const directoryInfo = await lstat(options.directory).catch(() => null);
  if (!directoryInfo) {
    return { schemaVersion: 1, status: "ready", entries: 0, records: 0, message: "The Web Debug process registry directory is absent and will be created on server start." };
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (uid === null || directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory() || directoryInfo.uid !== uid || (directoryInfo.mode & 0o077) !== 0) {
    return { schemaVersion: 1, status: "fail", entries: 0, records: 0, message: "The Web Debug process registry directory is not owner-only and trusted.", recovery: "Repair the exact registry directory permissions or remove only that directory before retrying." };
  }
  let entries: import("node:fs").Dirent[];
  try { entries = await readdir(options.directory, { withFileTypes: true }); }
  catch { return { schemaVersion: 1, status: "fail", entries: 0, records: 0, message: "The Web Debug process registry directory could not be read.", recovery: "Repair the exact owner-only registry directory before retrying." }; }
  const records = entries.filter((entry) => entry.isFile() && isRegistryRecordFilename(entry.name));
  if (entries.length >= REGISTRY_DIRECTORY_CAP || records.length >= REGISTRY_RECORD_CAP) {
    const cap = entries.length >= REGISTRY_DIRECTORY_CAP ? "REGISTRY_DIRECTORY_CAP" : "REGISTRY_RECORD_CAP";
    return { schemaVersion: 1, status: "fail", entries: entries.length, records: records.length, message: `${cap} would prevent a new Web Debug process from starting.`, recovery: "Restart the MCP server to run identity-safe reconciliation, or use web-debug-mcp cleanup for verified idle processes." };
  }
  const unknown = entries.some((entry) => !entry.isFile() || !isOwnedRegistryFilename(entry.name));
  const recordInstances = new Set(records.map((entry) => entry.name.slice(0, -".json".length).toLowerCase()));
  const orphanSidecars = entries.filter((entry) => entry.isFile() && /\.(?:lock|tmp)$/i.test(entry.name)
    && !recordInstances.has(entry.name.replace(/\.(?:lock|tmp)$/i, "").toLowerCase()));
  return unknown
    ? { schemaVersion: 1, status: "warn", entries: entries.length, records: records.length, message: "The Web Debug process registry is readable but contains unknown entries that startup will retain.", recovery: "Inspect only the exact owner-only registry directory; do not delete unrelated files." }
    : orphanSidecars.length > 0
      ? { schemaVersion: 1, status: "warn", entries: entries.length, records: records.length, message: `The Web Debug process registry contains ${orphanSidecars.length} orphan sidecar artifact${orphanSidecars.length === 1 ? "" : "s"}; stale owner-only sidecars will be reconciled on server start.`, recovery: "Restart the MCP server to run identity-safe stale-artifact reconciliation." }
    : { schemaVersion: 1, status: "ready", entries: entries.length, records: records.length, message: `The Web Debug process registry is ready (${records.length} record${records.length === 1 ? "" : "s"}, ${entries.length} entr${entries.length === 1 ? "y" : "ies"}).` };
}

export async function cleanupRegistry(options: { directory?: string; allIdle?: boolean; now?: () => number; platform?: NodeJS.Platform } = {}): Promise<CleanupReport> {
  const directory = options.directory ?? defaultRegistryDirectory();
  const platform = options.platform ?? process.platform;
  const report: CleanupReport = { schemaVersion: 1, version: PACKAGE_VERSION, scanned: 0, terminated: 0, skippedActive: 0, removedStaleRecords: 0, failed: 0, terminatedDetails: [], skippedActiveDetails: [], removedStaleRecordDetails: [], failedDetails: [], truncated: false };
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  const directoryInfo = await lstat(directory).catch(() => null);
  if (!directoryInfo) return report;
  if (uid === null || directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory() || directoryInfo.uid !== uid || (directoryInfo.mode & 0o077) !== 0) {
    return addFailure(report, { path: directory, reason: "UNTRUSTED_REGISTRY_DIRECTORY" });
  }
  const reconciliation = await reconcileRegistryArtifacts({ directory, platform, now: options.now });
  report.scanned += reconciliation.scanned;
  report.removedStaleRecords += reconciliation.removedStaleRecords;
  report.failed += reconciliation.failed;
  for (const detail of reconciliation.removedStaleRecordDetails) addDetail(report.removedStaleRecordDetails, detail, report);
  for (const detail of reconciliation.failedDetails) addDetail(report.failedDetails, detail, report);
  if (reconciliation.truncated) report.truncated = true;
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [] as import("node:fs").Dirent[]);
  if (entries.length > REGISTRY_DIRECTORY_CAP) return addFailure(report, { path: directory, reason: "REGISTRY_DIRECTORY_CAP" });
  const records = entries.filter((entry) => entry.isFile() && isRegistryRecordFilename(entry.name));
  if (records.length > REGISTRY_RECORD_CAP) return addFailure(report, { path: directory, reason: "REGISTRY_RECORD_CAP" });
  for (const entry of entries) {
    if (!entry.isFile() || !isOwnedRegistryFilename(entry.name)) addFailure(report, { path: join(directory, entry.name), reason: "UNKNOWN_REGISTRY_ENTRY" });
  }
  for (const entry of records) {
    const path = join(directory, entry.name);
    const record = await readRecord(path);
    if (!record) { addFailure(report, { path, reason: "MALFORMED_RECORD" }); continue; }
    if (platform !== "linux" && platform !== "darwin") { report.failed += 1; addDetail(report.failedDetails, { instance: record.instance, path, reason: "UNSUPPORTED_PLATFORM" }, report); continue; }
    const identity = await readProcessIdentity(record.pid, platform);
    if (!identity) {
      if (!await processExists(record.pid)) {
        await removeRegistryArtifacts(directory, record.instance); report.removedStaleRecords += 1; addDetail(report.removedStaleRecordDetails, { instance: record.instance, path, reason: "DEAD_OR_STALE" }, report);
      } else { report.failed += 1; addDetail(report.failedDetails, { instance: record.instance, path, reason: "IDENTITY_UNAVAILABLE" }, report); }
      continue;
    }
    if (!identityMatches(record, identity)) { await removeRegistryArtifacts(directory, record.instance); report.removedStaleRecords += 1; addDetail(report.removedStaleRecordDetails, { instance: record.instance, path, reason: "IDENTITY_MISMATCH" }, report); continue; }
    const idle = record.state === "idle" && !record.busy && record.activeRequestCount === 0 && record.activeSessionCount === 0;
    const expired = staleHeartbeat(record, options.now ?? (() => Date.now())) || (record.idleSince !== null && (options.now ?? (() => Date.now()))() - Date.parse(record.idleSince) >= record.idleTtlMs);
    if (!idle || (!options.allIdle && !expired)) { report.skippedActive += 1; addDetail(report.skippedActiveDetails, { instance: record.instance, path, reason: idle ? "NOT_EXPIRED" : "ACTIVE_OR_BUSY" }, report); continue; }
    const registry = { lockPath: join(directory, `${record.instance}.lock`) };
    try {
      await acquireLock(registry.lockPath, REGISTRY_LOCK_WAIT_MS);
      const latest = await readRecord(path);
      if (!latest || latest.state !== "idle" || latest.busy || latest.activeRequestCount !== 0 || latest.activeSessionCount !== 0) { report.skippedActive += 1; addDetail(report.skippedActiveDetails, { instance: record.instance, path, reason: "STATE_CHANGED" }, report); await rm(registry.lockPath, { force: true }); continue; }
      const latestIdentity = await readProcessIdentity(latest.pid, platform);
      if (!latestIdentity) {
        await rm(registry.lockPath, { force: true });
        if (!await processExists(latest.pid)) { await removeRegistryArtifacts(directory, latest.instance); report.removedStaleRecords += 1; addDetail(report.removedStaleRecordDetails, { instance: latest.instance, path, reason: "DEAD_OR_STALE" }, report); }
        else { report.failed += 1; addDetail(report.failedDetails, { instance: latest.instance, path, reason: "IDENTITY_DRIFT" }, report); }
        continue;
      }
      if (!identityMatches(latest, latestIdentity)) { await rm(registry.lockPath, { force: true }); await removeRegistryArtifacts(directory, latest.instance); report.removedStaleRecords += 1; addDetail(report.removedStaleRecordDetails, { instance: latest.instance, path, reason: "IDENTITY_MISMATCH" }, report); continue; }
      latest.state = "terminating";
      await writeRecord(path, latest);
      await rm(registry.lockPath, { force: true });
      const signaled = await signalVerified(path, latest, platform);
      if (signaled) { report.terminated += 1; addDetail(report.terminatedDetails, { instance: latest.instance, path, reason: "SIGTERM" }, report); }
      else { report.failed += 1; addDetail(report.failedDetails, { instance: latest.instance, path, reason: "SIGNAL_SKIPPED" }, report); }
    } catch { report.failed += 1; addDetail(report.failedDetails, { instance: record.instance, path, reason: "LOCK_OR_CLEANUP_FAILED" }, report); await rm(registry.lockPath, { force: true }).catch(() => undefined); }
  }
  return boundCleanupReport(report);
}

function defaultRegistryDirectory(): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (uid === null) throw new Error("Web Debug cleanup requires a numeric user identity.");
  return join(tmpdir(), `web-debug-mcp-registry-${uid}`);
}

function parseIdleTtl(value: number | string | undefined): number {
  if (value === undefined) return REGISTRY_DEFAULT_IDLE_TTL_MS;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (parsed > 0 && (parsed < REGISTRY_MIN_IDLE_TTL_MS || parsed > REGISTRY_MAX_IDLE_TTL_MS))) throw new Error("WEB_DEBUG_IDLE_TTL_MS must be 0 or a value from 10000 through 3600000.");
  return Math.floor(parsed);
}

async function ensureSecureDirectory(directory: string, uid: number): Promise<void> {
  const existing = await lstat(directory).catch(() => null);
  if (!existing) { await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700); const created = await lstat(directory); if (created.isSymbolicLink() || !created.isDirectory() || created.uid !== uid || (created.mode & 0o077) !== 0) throw new Error("The Web Debug process registry directory is not owner-only and trusted."); return; }
  if (existing.isSymbolicLink() || !existing.isDirectory() || existing.uid !== uid || (existing.mode & 0o077) !== 0) throw new Error("The Web Debug process registry directory is not owner-only and trusted.");
}

async function acquireLock(path: string, waitMs: number): Promise<void> {
  const deadline = Date.now() + waitMs;
  while (true) {
    try {
      const handle = await open(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
      await handle.close();
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    }
  }
}

async function writeRecord(path: string, record: RegistryRecord): Promise<void> {
  const json = JSON.stringify(record);
  if (Buffer.byteLength(json) > REGISTRY_RECORD_BYTES) throw new Error("REGISTRY_RECORD_TOO_LARGE");
  const temp = path.replace(/\.json$/, ".tmp");
  const handle = await open(temp, fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  try { await handle.writeFile(json, "utf8"); await handle.sync(); } finally { await handle.close(); }
  await rename(temp, path);
}

async function readRecord(path: string): Promise<RegistryRecord | null> {
  try {
    const info = await lstat(path);
    const uid = typeof process.getuid === "function" ? process.getuid() : null;
    if (!info.isFile() || info.isSymbolicLink() || (uid !== null && info.uid !== uid) || (info.mode & 0o077) !== 0 || info.size > REGISTRY_RECORD_BYTES) return null;
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isValidRecord(parsed)) return null;
    return parsed;
  } catch { return null; }
}

function isValidRecord(value: unknown): value is RegistryRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RegistryRecord>;
  const expectedKeys = ["schemaVersion", "instance", "pid", "ppid", "packageVersion", "executable", "packageEntry", "startIdentity", "startedAt", "lastActivityAt", "idleSince", "heartbeatAt", "idleTtlMs", "activeSessionCount", "activeRequestCount", "busy", "state"].sort();
  const actualKeys = Object.keys(value as Record<string, unknown>).sort();
  return actualKeys.length === expectedKeys.length && actualKeys.every((key, index) => key === expectedKeys[index]) && record.schemaVersion === 1 && typeof record.instance === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.instance) && typeof record.pid === "number" && Number.isInteger(record.pid) && record.pid > 0 && typeof record.startIdentity === "string" && record.startIdentity.length > 0 && typeof record.executable === "string" && typeof record.packageEntry === "string" && typeof record.startedAt === "string" && Number.isFinite(Date.parse(record.startedAt)) && typeof record.lastActivityAt === "string" && Number.isFinite(Date.parse(record.lastActivityAt)) && typeof record.heartbeatAt === "string" && Number.isFinite(Date.parse(record.heartbeatAt)) && (record.idleSince === null || typeof record.idleSince === "string" && Number.isFinite(Date.parse(record.idleSince))) && ["idle", "running", "terminating"].includes(String(record.state)) && typeof record.activeSessionCount === "number" && Number.isInteger(record.activeSessionCount) && record.activeSessionCount >= 0 && typeof record.activeRequestCount === "number" && Number.isInteger(record.activeRequestCount) && record.activeRequestCount >= 0 && typeof record.busy === "boolean" && typeof record.idleTtlMs === "number" && Number.isInteger(record.idleTtlMs) && record.idleTtlMs >= 0;
}

async function readProcessIdentity(pid: number, platform: NodeJS.Platform): Promise<ProcessIdentity | null> {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (platform === "linux") {
    try {
      const statText = await readFile(`/proc/${pid}/stat`, "utf8");
      const closeParen = statText.lastIndexOf(")");
      const fields = statText.slice(closeParen + 2).split(" ");
      const startIdentity = fields[19];
      const executable = await realPath(`/proc/${pid}/exe`);
      const status = await readFile(`/proc/${pid}/status`, "utf8");
      const uidLine = status.split("\n").find((line) => line.startsWith("Uid:"));
      const uid = Number(uidLine?.trim().split(/\s+/)[1]);
      const cmdline = (await readFile(`/proc/${pid}/cmdline`)).toString("utf8").split("\0").filter(Boolean);
      const packageEntry = cmdline.find(isPackageEntryToken) ?? cmdline[1] ?? "";
      if (!startIdentity || !executable || !Number.isInteger(uid)) return null;
      return { pid, uid, startIdentity, executable, packageEntry: resolve(packageEntry) };
    } catch { return null; }
  }
  if (platform === "darwin") {
    try {
      const [startResult, uidResult, commandResult, executableResult] = await Promise.all([
        execFileAsync("ps", ["-p", String(pid), "-o", "lstart="], { maxBuffer: 4_096 }),
        execFileAsync("ps", ["-p", String(pid), "-o", "uid="], { maxBuffer: 1_024 }),
        execFileAsync("ps", ["-p", String(pid), "-o", "command="], { maxBuffer: 16_384 }),
        execFileAsync("ps", ["-p", String(pid), "-o", "comm="], { maxBuffer: 4_096 }),
      ]);
      const startIdentity = startResult.stdout.trim();
      const uid = Number(uidResult.stdout.trim());
      const command = commandResult.stdout.trim();
      if (!startIdentity || !Number.isInteger(uid) || !command) return null;
      const executable = executableResult.stdout.trim();
      return { pid, uid, startIdentity, executable: executable.includes("/") ? resolve(executable) : executable, packageEntry: resolve(command.split(/\s+/).find(isPackageEntryToken) ?? "") };
    } catch { return null; }
  }
  return null;
}

function currentStartIdentity(platform: NodeJS.Platform, pid: number): string {
  if (platform === "linux") {
    try { const statText = readFileSync(`/proc/${pid}/stat`, "utf8"); const closeParen = statText.lastIndexOf(")"); return statText.slice(closeParen + 2).split(" ")[19] ?? ""; } catch { return ""; }
  }
  if (platform === "darwin") {
    try { return execFileSync("ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf8" }).trim(); } catch { return ""; }
  }
  return String(Date.now());
}

async function realPath(path: string): Promise<string> { return resolve(await realpath(path)); }

function identityMatches(record: RegistryRecord, identity: ProcessIdentity): boolean {
  const executableMatches = identity.executable === resolve(record.executable)
    || !identity.executable.includes("/") && basename(record.executable) === identity.executable;
  return identity.pid === record.pid && identity.uid === (typeof process.getuid === "function" ? process.getuid() : identity.uid) && identity.startIdentity === record.startIdentity && executableMatches && identity.packageEntry === resolve(record.packageEntry);
}

function isPackageEntryToken(value: string): boolean {
  return value.endsWith("web-debug-mcp.mjs") || basename(value) === "web-debug-mcp";
}

function staleHeartbeat(record: RegistryRecord, now: () => number): boolean { return now() - Date.parse(record.heartbeatAt) > REGISTRY_STALE_HEARTBEAT_MS; }

async function signalVerified(path: string, record: RegistryRecord, platform: NodeJS.Platform): Promise<boolean> {
  const before = await readRecord(path);
  const identity = await readProcessIdentity(record.pid, platform);
  if (!before || before.state !== "terminating" || !identity || !identityMatches(before, identity)) return false;
  try { process.kill(record.pid, "SIGTERM"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") { await removeRegistryArtifacts(dirname(path), record.instance); return true; } return false; }
  await waitForExit(record.pid, REGISTRY_SIGTERM_GRACE_MS);
  if (!await processExists(record.pid)) { await removeRegistryArtifacts(dirname(path), record.instance); return true; }
  const beforeKill = await readRecord(path);
  const identityBeforeKill = await readProcessIdentity(record.pid, platform);
  if (!beforeKill || beforeKill.state !== "terminating" || !identityBeforeKill || !identityMatches(beforeKill, identityBeforeKill)) return false;
  try { process.kill(record.pid, "SIGKILL"); } catch { return false; }
  await waitForExit(record.pid, REGISTRY_SIGKILL_GRACE_MS);
  if (!await processExists(record.pid)) { await removeRegistryArtifacts(dirname(path), record.instance); return true; }
  return false;
}

async function processExistsForRegistry(pid: number): Promise<boolean> { try { process.kill(pid, 0); return true; } catch { return false; } }
async function processExists(pid: number): Promise<boolean> { return processExistsForRegistry(pid); }
async function waitForExit(pid: number, timeoutMs: number): Promise<void> { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline && await processExists(pid)) await new Promise((resolvePromise) => setTimeout(resolvePromise, 25)); }
async function waitBounded(promise: Promise<unknown>, timeoutMs: number): Promise<void> { let timer: ReturnType<typeof setTimeout> | undefined; await Promise.race([promise.catch(() => undefined), new Promise<void>((resolvePromise) => { timer = setTimeout(resolvePromise, timeoutMs); })]); if (timer) clearTimeout(timer); }
function isRegistryRecordFilename(name: string): boolean { return registryRecordFilenamePattern.test(name); }
function isOwnedRegistryFilename(name: string): boolean { return registryInstancePattern.test(name.replace(/\.(?:json|lock|tmp)$/i, "")) && /\.(?:json|lock|tmp)$/i.test(name); }
function addReconciliationDetail(target: CleanupDetail[], detail: CleanupDetail, report: RegistryReconciliationReport): void {
  const total = report.removedStaleRecordDetails.length + report.retainedDetails.length + report.failedDetails.length;
  if (total < CLEANUP_DETAIL_CAP) target.push(detail); else report.truncated = true;
}
function addDetail(target: CleanupDetail[], detail: CleanupDetail, report: CleanupReport): void {
  const total = report.terminatedDetails.length + report.skippedActiveDetails.length + report.removedStaleRecordDetails.length + report.failedDetails.length;
  if (total < CLEANUP_DETAIL_CAP) target.push(detail); else report.truncated = true;
}
function addFailure(report: CleanupReport, detail: CleanupDetail): CleanupReport { report.failed += 1; addDetail(report.failedDetails, detail, report); return boundCleanupReport(report); }
function boundCleanupReport(report: CleanupReport): CleanupReport {
  const detailKeys: Array<keyof CleanupReport> = ["terminatedDetails", "skippedActiveDetails", "removedStaleRecordDetails", "failedDetails"];
  for (const key of detailKeys) report[key] = (report[key] as CleanupDetail[]).slice(0, CLEANUP_DETAIL_CAP) as never;
  let json = JSON.stringify(report);
  while (Buffer.byteLength(json) > CLEANUP_REPORT_BYTES && report.failedDetails.length > 0) { report.failedDetails.pop(); report.truncated = true; json = JSON.stringify(report); }
  if (Buffer.byteLength(json) > CLEANUP_REPORT_BYTES) report.truncated = true;
  return report;
}

export function parseIdleTtlValue(value: string | undefined): number { return parseIdleTtl(value); }
export function registryDirectoryForUid(uid: number): string { return join(tmpdir(), `web-debug-mcp-registry-${uid}`); }
export async function inspectProcessIdentity(pid: number, platform: NodeJS.Platform = process.platform): Promise<ProcessIdentity | null> { return readProcessIdentity(pid, platform); }
export function processIdentityMatches(record: RegistryRecord, identity: ProcessIdentity): boolean { return identityMatches(record, identity); }
export function registryStartupDiagnostic(error: unknown): string { return `web-debug-mcp: MCP server startup failed: ${errorMessage(error).replace(/[\r\n]+/g, " ")}`; }
