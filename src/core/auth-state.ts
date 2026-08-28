import { constants as fsConstants } from "node:fs";
import { open, lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import type { PlaywrightStorageCookie, PlaywrightStorageOrigin, PlaywrightStorageState } from "../domain/types.js";
import {
  MAX_AUTH_COOKIES,
  MAX_AUTH_LOCAL_STORAGE_PER_ORIGIN,
  MAX_AUTH_ORIGINS,
  MAX_AUTH_STATE_BYTES,
  MAX_AUTH_STORAGE_ITEMS_TOTAL,
} from "../domain/types.js";
import { WebDebugError } from "./errors.js";

const MAX_COOKIE_NAME = 128;
const MAX_COOKIE_VALUE = 4_096;
const MAX_LOCAL_NAME = 128;
const MAX_LOCAL_VALUE = 8_192;
const MAX_DOMAIN = 253;
const MAX_PATH = 1_024;
const MAX_ORIGIN = 2_048;
const MAX_PERSISTENT_COOKIE_SECONDS = 900;

/**
 * Read one project-contained Playwright storage-state file from one already
 * open descriptor. The descriptor identity and metadata are checked again
 * after reading so a path replacement or in-place mutation fails closed.
 */
export async function loadAuthStorageState(path: string, projectRoot: string, approvedOrigin: string): Promise<{ state: PlaywrightStorageState; secrets: string[]; path: string }> {
  const root = resolve(projectRoot);
  const candidate = resolve(root, path);
  if (!isAbsolute(path) && !isContained(root, candidate)) throw authError("AUTH_PATH_OUTSIDE_PROJECT");
  const rootReal = await realpath(root).catch(() => root);
  const link = await lstat(candidate).catch(() => null);
  if (!link || link.isSymbolicLink() || !link.isFile()) throw authError("AUTH_FILE_INVALID");
  const candidateReal = await realpath(candidate).catch(() => candidate);
  if (!isContained(rootReal, candidateReal)) throw authError("AUTH_PATH_OUTSIDE_PROJECT");

  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(candidate, flags);
    const before = await handle.stat();
    if (!before.isFile() || before.size > MAX_AUTH_STATE_BYTES) throw authError("AUTH_STATE_BOUNDS");
    const data = await readBounded(handle, MAX_AUTH_STATE_BYTES + 1);
    if (Buffer.byteLength(data) > MAX_AUTH_STATE_BYTES) throw authError("AUTH_STATE_BOUNDS");
    const after = await handle.stat();
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw authError("AUTH_FILE_CHANGED");
    const parsed = parseState(data, approvedOrigin);
    return { state: parsed.state, secrets: [candidate, ...parsed.secrets], path: candidate };
  } catch (error) {
    if (error instanceof WebDebugError) throw error;
    throw authError("AUTH_FILE_INVALID");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readBounded(handle: { read(buffer: Buffer, offset: number, length: number, position: number | null): Promise<{ bytesRead: number }> }, maximum: number): Promise<string> {
  const buffer = Buffer.allocUnsafe(maximum);
  let offset = 0;
  while (offset < maximum) {
    const { bytesRead } = await handle.read(buffer, offset, maximum - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return buffer.subarray(0, offset).toString("utf8");
}

function parseState(raw: string, approvedOrigin: string): { state: PlaywrightStorageState; secrets: string[] } {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw authError("AUTH_JSON_INVALID"); }
  if (!isRecord(value) || !exactKeys(value, ["cookies", "origins"]) || !Array.isArray(value.cookies) || !Array.isArray(value.origins)) throw authError("AUTH_SHAPE_INVALID");
  if (value.cookies.length > MAX_AUTH_COOKIES || value.origins.length > MAX_AUTH_ORIGINS) throw authError("AUTH_STATE_BOUNDS");
  const host = new URL(approvedOrigin).hostname.toLowerCase();
  const now = Math.floor(Date.now() / 1_000);
  const cookieKeys = new Set<string>();
  const storageKeys = new Set<string>();
  const secrets: string[] = [];
  const cookies: PlaywrightStorageCookie[] = [];
  for (const item of value.cookies) {
    if (!isRecord(item) || !exactKeys(item, ["name", "value", "domain", "path", "expires", "httpOnly", "secure", "sameSite"])) throw authError("AUTH_COOKIE_INVALID");
    if (typeof item.name !== "string" || item.name.length === 0 || item.name.length > MAX_COOKIE_NAME || typeof item.value !== "string" || item.value.length > MAX_COOKIE_VALUE || typeof item.domain !== "string" || item.domain.length > MAX_DOMAIN || typeof item.path !== "string" || item.path.length === 0 || item.path.length > MAX_PATH || !item.path.startsWith("/") || typeof item.expires !== "number" || !Number.isFinite(item.expires) || !Number.isInteger(item.expires) || typeof item.httpOnly !== "boolean" || typeof item.secure !== "boolean" || !["Strict", "Lax", "None"].includes(String(item.sameSite))) throw authError("AUTH_COOKIE_INVALID");
    const domain = item.domain.replace(/^\./, "").toLowerCase();
    const approved = new URL(approvedOrigin);
    if (domain !== host || (item.expires !== -1 && (item.expires < 0 || item.expires > now + MAX_PERSISTENT_COOKIE_SECONDS)) || (item.secure && approved.protocol !== "https:")) throw authError("AUTH_COOKIE_SCOPE_INVALID");
    if (item.sameSite === "None" && item.secure !== true) throw authError("AUTH_COOKIE_SCOPE_INVALID");
    const key = `${item.name}\u0000${domain}\u0000${item.path}`;
    if (cookieKeys.has(key)) throw authError("AUTH_DUPLICATE_KEY");
    cookieKeys.add(key);
    const cookie = { name: item.name, value: item.value, domain: item.domain, path: item.path, expires: item.expires, httpOnly: item.httpOnly, secure: item.secure, sameSite: item.sameSite as PlaywrightStorageCookie["sameSite"] };
    cookies.push(cookie);
    // Values carry the credential material. Cookie/storage names and
    // domain/path are structural browser scope; treating generic strings such
    // as "role" or "/" as secrets corrupts locator kinds and every URL.
    secrets.push(item.value);
  }
  const origins: PlaywrightStorageOrigin[] = [];
  for (const item of value.origins) {
    if (!isRecord(item) || !exactKeys(item, ["origin", "localStorage"]) || typeof item.origin !== "string" || !Array.isArray(item.localStorage) || item.origin.length > MAX_ORIGIN || item.localStorage.length > MAX_AUTH_LOCAL_STORAGE_PER_ORIGIN) throw authError("AUTH_ORIGIN_INVALID");
    if (item.origin !== approvedOrigin) throw authError("AUTH_ORIGIN_SCOPE_INVALID");
    const localStorage: Array<{ name: string; value: string }> = [];
    for (const entry of item.localStorage) {
      if (!isRecord(entry) || !exactKeys(entry, ["name", "value"]) || typeof entry.name !== "string" || entry.name.length === 0 || entry.name.length > MAX_LOCAL_NAME || typeof entry.value !== "string" || entry.value.length > MAX_LOCAL_VALUE) throw authError("AUTH_STORAGE_ITEM_INVALID");
      const key = `${item.origin}\u0000${entry.name}`;
      if (storageKeys.has(key)) throw authError("AUTH_DUPLICATE_KEY");
      storageKeys.add(key);
      localStorage.push({ name: entry.name, value: entry.value });
      secrets.push(entry.value);
    }
    origins.push({ origin: item.origin, localStorage });
  }
  if (cookieKeys.size + storageKeys.size > MAX_AUTH_STORAGE_ITEMS_TOTAL) throw authError("AUTH_STATE_BOUNDS");
  return { state: { cookies, origins }, secrets };
}

function authError(code: string): WebDebugError {
  return new WebDebugError(code, "The disposable auth fixture was rejected by the bounded project-local policy.");
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function isContained(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${requireSeparator()}`) && !path.startsWith("/"));
}

function requireSeparator(): string { return "/"; }
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
