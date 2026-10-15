import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ProjectLogSnapshot } from "../domain/types.js";
import { privateRepresentations, scrubText } from "./private-values.js";
import { boundText, redactText } from "./redaction.js";

const MAX_READ_BYTES = 256 * 1024;
const MAX_TAIL_BYTES = 64 * 1024;
const MAX_LINES = 200;
const MAX_CHARS = 16_000;
const MAX_FILE_CHARS = 2_048;

export function validateLogFile(path: string): void {
  if (isAbsolute(path) || path.length > 2_048 || !path.endsWith(".log") || path.split(/[\\/]/).some(part => !part || part === "." || part === "..")) {
    throw new Error("Configure one project-relative .log file with no parent traversal.");
  }
}

/** Read only an explicitly selected regular file; never discover or start a logger. */
export async function readProjectLog(projectRoot: string, file: string, secrets: string[] = []): Promise<ProjectLogSnapshot> {
  const safeFile = () => boundText(scrubText(file, secrets), MAX_FILE_CHARS);
  const unavailable = (): ProjectLogSnapshot => ({ state: "unavailable", file: safeFile(), text: null, truncated: false, warnings: ["The configured log is missing, non-regular, linked, changed during validation, or outside the project. No log content was returned."] });
  let handle;
  try {
    validateLogFile(file);
    const root = await realpath(projectRoot);
    const path = resolve(root, file);
    await assertContainedPath(root, path);
    const before = await lstat(path);
    if (!before.isFile() || before.nlink !== 1) return unavailable();
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = await handle.stat();
    await assertContainedPath(root, path);
    const after = await lstat(path);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.dev !== after.dev || opened.ino !== after.ino) return unavailable();
    const variants = privateRepresentations(secrets);
    const overlap = Math.max(1, ...variants.map(value => Buffer.byteLength(value)));
    const length = Math.min(opened.size, MAX_READ_BYTES, MAX_TAIL_BYTES + overlap);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, Math.max(0, opened.size - length));
    let raw = buffer.subarray(0, bytesRead).toString("utf8");
    let discarded = opened.size > bytesRead;
    if (discarded) {
      // Drop the uncertain prefix and move past any known secret crossing that cut.
      let cut = Math.max(0, Buffer.byteLength(raw) - MAX_TAIL_BYTES);
      // Character indexing is conservative for UTF-8: it discards more, never less.
      for (const secret of variants) {
        let offset = raw.indexOf(secret);
        while (offset >= 0) {
          if (offset < cut && offset + secret.length > cut) cut = offset + secret.length;
          offset = raw.indexOf(secret, offset + 1);
        }
      }
      const newline = raw.indexOf("\n", cut);
      raw = newline < 0 ? "" : raw.slice(newline + 1);
    }
    // A partial final line can expose a prefix of a still-being-written secret.
    if (!raw.endsWith("\n")) { raw = raw.slice(0, Math.max(0, raw.lastIndexOf("\n") + 1)); discarded = true; }
    const redacted = redactText(scrubText(raw, secrets));
    const lines = redacted.trimEnd().split(/\r?\n/);
    const selected = lines.slice(-MAX_LINES).join("\n");
    return { state: "fresh", file: safeFile(), text: boundText(selected.slice(-MAX_CHARS), MAX_CHARS), truncated: discarded || lines.length > MAX_LINES || selected.length > MAX_CHARS, warnings: [] };
  } catch { return unavailable(); }
  finally { await handle?.close().catch(() => undefined); }
}

async function assertContainedPath(root: string, path: string): Promise<void> {
  const inside = relative(root, path);
  if (!inside || isAbsolute(inside) || inside.startsWith(`..${sep}`)) throw new Error("Outside log boundary.");
  let current = root;
  for (const part of inside.split(sep)) {
    current = resolve(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error("Linked log path.");
  }
  if (await realpath(path) !== path) throw new Error("Changed log path.");
}
