import { constants as fsConstants } from "node:fs";
import { lstat, open, readdir, realpath, unlink } from "node:fs/promises";
import { basename, isAbsolute, join, relative } from "node:path";
import { randomUUID } from "node:crypto";

import { WebDebugError } from "./errors.js";
import { boundText } from "./redaction.js";

const MAX_ARTIFACTS = 64;
export const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
export const MAX_SESSION_SCREENSHOTS = 4;
export const MAX_SESSION_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_INLINE_ARTIFACT_BYTES = 128 * 1024;
const ARTIFACT_TTL_MS = 60 * 60 * 1_000;

export interface ScreenshotCandidate {
  path: string;
  artifactDir: string;
  name: string;
}

export interface ArtifactDescriptor {
  kind: "screenshot";
  uri: string;
  mimeType: "image/png";
  bytes: number;
  delivery: "inline" | "resource";
}

interface StoredArtifact {
  id: string;
  path: string;
  artifactDir: string;
  name: string;
  expiresAt: number;
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
}

export interface PreparedArtifacts {
  descriptors: ArtifactDescriptor[];
  content: Array<
    | { type: "image"; data: string; mimeType: "image/png" }
    | { type: "resource_link"; name: string; uri: string; description: string; mimeType: "image/png"; size: number }
  >;
  warnings: string[];
  commit: () => void;
  rollback: () => void;
}

export interface SessionArtifactPolicyResult {
  screenshotPath: string | null;
  warnings: string[];
}

export async function enforceSessionArtifactPolicy(
  artifactDir: string,
  currentPath: string | null,
  retainCurrent = true,
): Promise<SessionArtifactPolicyResult> {
  const warnings: string[] = [];
  let root: string;
  try {
    const rootInfo = await lstat(artifactDir);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("invalid artifact directory");
    root = await realpath(artifactDir);
  } catch {
    return { screenshotPath: null, warnings: ["Screenshot discarded because the session artifact directory could not be validated."] };
  }

  let currentTarget: string | null = null;
  if (currentPath) {
    try {
      currentTarget = await realpath(currentPath);
      const currentRelative = relative(root, currentTarget);
      if (!currentRelative || currentRelative.startsWith("..") || isAbsolute(currentRelative)) {
        return { screenshotPath: null, warnings: ["Screenshot discarded because it was outside the session artifact directory."] };
      }
    } catch {
      return { screenshotPath: null, warnings: ["Screenshot discarded because its file could not be validated."] };
    }
  }

  const files: Array<{ path: string; size: number; mtimeMs: number; current: boolean }> = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const isCurrent = currentTarget === path;
    if (!isCurrent && !entry.name.toLowerCase().endsWith(".png")) continue;
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) continue;
      files.push({ path, size: info.size, mtimeMs: info.mtimeMs, current: isCurrent });
    } catch {
      // A concurrently removed file does not consume the retained quota.
    }
  }
  files.sort((left, right) => Number(right.current) - Number(left.current) || right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));

  let retainedCount = 0;
  let retainedBytes = 0;
  let currentRetained = currentTarget === null;
  let pruned = 0;
  for (const file of files) {
    const withinQuota = (!file.current || retainCurrent)
      && file.size <= MAX_ARTIFACT_BYTES
      && retainedCount < MAX_SESSION_SCREENSHOTS
      && retainedBytes + file.size <= MAX_SESSION_ARTIFACT_BYTES;
    if (withinQuota) {
      retainedCount += 1;
      retainedBytes += file.size;
      if (file.current) currentRetained = true;
      continue;
    }
    await unlink(file.path).catch(() => undefined);
    pruned += 1;
    if (file.current && file.size > MAX_ARTIFACT_BYTES) {
      warnings.push(`Screenshot discarded because it exceeded the ${MAX_ARTIFACT_BYTES}-byte per-file limit.`);
    }
  }
  if (pruned > 0 && !warnings.length) {
    warnings.push(`Screenshot artifacts were pruned to ${MAX_SESSION_SCREENSHOTS} files and ${MAX_SESSION_ARTIFACT_BYTES} bytes per session.`);
  }
  if (currentTarget && !currentRetained && !warnings.length) warnings.push("Screenshot discarded by the session artifact policy.");
  return { screenshotPath: currentTarget && currentRetained ? currentTarget : null, warnings };
}

export class ArtifactStore {
  private readonly entries = new Map<string, StoredArtifact>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async prepare(candidates: readonly ScreenshotCandidate[], inlineWireBudgetBytes: number): Promise<PreparedArtifacts> {
    this.evictExpired();
    const descriptors: ArtifactDescriptor[] = [];
    const content: PreparedArtifacts["content"] = [];
    const warnings: string[] = [];
    const staged: StoredArtifact[] = [];
    let inlineAvailable = inlineWireBudgetBytes;
    let inlineUsed = false;

    for (const candidate of candidates.slice(0, 2)) {
      if (!candidate.path) continue;
      try {
        const stored = await this.register(candidate);
        staged.push(stored);
        const uri = artifactUri(stored.id);
        const estimatedInlineBytes = Math.ceil(stored.size * 4 / 3) + 256;
        const inline = !inlineUsed
          && stored.size <= MAX_INLINE_ARTIFACT_BYTES
          && estimatedInlineBytes <= inlineAvailable;
        if (inline) {
          const data = await this.readBytes(stored);
          content.push({ type: "image", data: data.toString("base64"), mimeType: "image/png" });
          inlineAvailable -= estimatedInlineBytes;
          inlineUsed = true;
        }
        content.push({
          type: "resource_link",
          name: stored.name,
          uri,
          description: "Bounded screenshot captured by web-debug-mcp.",
          mimeType: "image/png",
          size: stored.size,
        });
        descriptors.push({
          kind: "screenshot",
          uri,
          mimeType: "image/png",
          bytes: stored.size,
          delivery: inline ? "inline" : "resource",
        });
      } catch (error) {
        warnings.push(boundText(error instanceof Error ? error.message : String(error), 500));
      }
    }

    let finalized = false;
    return {
      descriptors,
      content,
      warnings: warnings.slice(0, 10),
      commit: () => {
        if (finalized) return;
        finalized = true;
        for (const stored of staged) this.entries.set(stored.id, stored);
        while (this.entries.size > MAX_ARTIFACTS) {
          const oldest = this.entries.keys().next().value as string | undefined;
          if (!oldest) break;
          this.entries.delete(oldest);
        }
      },
      rollback: () => { finalized = true; },
    };
  }

  async read(id: string, uri: URL): Promise<{ contents: Array<{ uri: string; mimeType: "image/png"; blob: string }> }> {
    this.evictExpired();
    const stored = this.entries.get(id);
    if (!stored || stored.expiresAt <= this.now()) {
      this.entries.delete(id);
      throw new WebDebugError("ARTIFACT_NOT_FOUND", "The screenshot artifact is unavailable or expired.");
    }
    const data = await this.readBytes(stored);
    return { contents: [{ uri: uri.toString(), mimeType: "image/png", blob: data.toString("base64") }] };
  }

  private async register(candidate: ScreenshotCandidate): Promise<StoredArtifact> {
    const handle = await open(candidate.path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > MAX_ARTIFACT_BYTES) throw new WebDebugError("ARTIFACT_SIZE_LIMIT", `Screenshot artifact exceeds the ${MAX_ARTIFACT_BYTES}-byte limit.`);
      const { root, target } = await validateOpenedContainment(candidate.artifactDir, candidate.path, info.dev, info.ino);
      const stored: StoredArtifact = {
        id: randomUUID(),
        path: target,
        artifactDir: root,
        name: boundText(candidate.name || basename(target), 120),
        expiresAt: this.now() + ARTIFACT_TTL_MS,
        dev: info.dev,
        ino: info.ino,
        size: info.size,
        mtimeMs: info.mtimeMs,
      };
      return stored;
    } finally {
      await handle.close();
    }
  }

  private async readBytes(stored: StoredArtifact): Promise<Buffer> {
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(stored.path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    } catch {
      this.entries.delete(stored.id);
      throw new WebDebugError("ARTIFACT_NOT_FOUND", "The screenshot artifact is unavailable or was pruned by the session quota.");
    }
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.dev !== stored.dev || info.ino !== stored.ino || info.size !== stored.size || info.mtimeMs !== stored.mtimeMs) {
        this.entries.delete(stored.id);
        throw new WebDebugError("ARTIFACT_CHANGED", "Screenshot artifact identity changed after capture.");
      }
      if (info.size > MAX_ARTIFACT_BYTES) throw new WebDebugError("ARTIFACT_SIZE_LIMIT", `Screenshot artifact exceeds the ${MAX_ARTIFACT_BYTES}-byte limit.`);
      await validateOpenedContainment(stored.artifactDir, stored.path, info.dev, info.ino);
      const buffer = Buffer.alloc(stored.size + 1);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
        if (chunk.bytesRead === 0) break;
        bytesRead += chunk.bytesRead;
      }
      const after = await handle.stat();
      if (bytesRead !== stored.size || after.dev !== stored.dev || after.ino !== stored.ino || after.size !== stored.size || after.mtimeMs !== stored.mtimeMs) {
        this.entries.delete(stored.id);
        throw new WebDebugError("ARTIFACT_CHANGED", "Screenshot artifact changed while it was being read.");
      }
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  private evictExpired(): void {
    for (const [id, entry] of this.entries) if (entry.expiresAt <= this.now()) this.entries.delete(id);
  }
}

async function validateOpenedContainment(artifactDir: string, path: string, dev: number, ino: number): Promise<{ root: string; target: string }> {
  const [rootInfo, pathInfo] = await Promise.all([lstat(artifactDir), lstat(path)]);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory() || pathInfo.isSymbolicLink() || !pathInfo.isFile()) {
    throw new WebDebugError("ARTIFACT_INVALID", "Screenshot artifact and its owning directory must be non-symlink filesystem entries.");
  }
  if (pathInfo.dev !== dev || pathInfo.ino !== ino) throw new WebDebugError("ARTIFACT_CHANGED", "Screenshot artifact identity changed during validation.");
  const [root, target] = await Promise.all([realpath(artifactDir), realpath(path)]);
  const relativePath = relative(root, target);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new WebDebugError("ARTIFACT_OUTSIDE_SESSION", "Screenshot artifact is outside its owning session directory.");
  }
  return { root, target };
}

function artifactUri(id: string): string {
  return `web-debug://artifact/${id}`;
}
