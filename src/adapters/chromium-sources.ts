import { TraceMap, originalPositionFor, allGeneratedPositionsFor, decodedMappings } from "@jridgewell/trace-mapping";
import type { CDPSession } from "playwright-core";
import type { BreakpointInput, OperationContext, SourceInventory, SourceReference } from "../domain/types.js";
import { WebDebugError } from "../core/errors.js";
import { readResponseTextBounded } from "../core/http.js";
import { remaining, throwIfCancelled } from "../core/operation-context.js";
import { safeUrl } from "../core/redaction.js";

const MAX_SCRIPTS = 200;
const MAX_MAP_BYTES = 512 * 1024;
const MAX_CACHED = 8;
const MAX_SOURCE_CHARS = 512 * 1024;
interface Script {
  scriptId: string; url: string; hash: string | null; executionContextId: number;
  startLine: number; startColumn: number; sourceMapURL: string; hasSourceURL: boolean;
}
type SourceEvent = "Runtime.executionContextCreated" | "Runtime.executionContextDestroyed" | "Runtime.executionContextsCleared" | "Debugger.scriptParsed";
interface MapRecord { map: TraceMap | null; reason?: string }

/** Session-owned transport state. Source names are identifiers and are never filesystem paths to read. */
export class ChromiumSources {
  private readonly contexts = new Set<number>();
  private readonly scripts = new Map<string, Script>();
  private readonly maps = new Map<string, MapRecord>();
  private readonly texts = new Map<string, string>();
  private truncated = false;
  private revision = 0;
  private readonly listeners: Array<[SourceEvent, (event: any) => void]> = [];

  constructor(private readonly cdp: CDPSession, private readonly origin: string, private readonly frameId: string) {
    this.on("Runtime.executionContextCreated", ({ context }) => {
      if (context?.auxData?.frameId === frameId && context.auxData.isDefault === true && Number.isInteger(context.id)) {
        if (this.contexts.size < MAX_SCRIPTS) this.contexts.add(context.id);
      }
    });
    this.on("Runtime.executionContextDestroyed", ({ executionContextId }) => {
      if (!this.contexts.has(executionContextId)) return;
      this.contexts.delete(executionContextId);
      for (const [id, script] of this.scripts) if (script.executionContextId === executionContextId) this.remove(id);
      this.revision++;
    });
    this.on("Runtime.executionContextsCleared", () => this.clear());
    this.on("Debugger.scriptParsed", (event) => this.parsed(event));
  }

  generation(): number { return this.revision; }
  identity(id: string): { scriptId: string; url: string; hash: string | null } | null {
    const script = this.scripts.get(id);
    return script && this.contexts.has(script.executionContextId)
      ? { scriptId: id, url: safeUrl(script.url), hash: script.hash } : null;
  }
  private on(name: SourceEvent, handler: (event: any) => void): void {
    this.listeners.push([name, handler]); this.cdp.on(name, handler);
  }
  private parsed(event: any): void {
    if (!this.contexts.has(event.executionContextId) || typeof event.scriptId !== "string" || event.scriptId.length > 100 || typeof event.url !== "string" || event.url.length > 2048) return;
    if (!this.allowedUrl(event.url)) return;
    if (this.scripts.size >= MAX_SCRIPTS || [...this.scripts.values()].reduce((bytes, script) => bytes + script.sourceMapURL.length, 0) + (event.sourceMapURL?.length ?? 0) > 4 * 1024 * 1024) { this.truncated = true; return; }
    this.remove(event.scriptId);
    this.scripts.set(event.scriptId, {
      scriptId: event.scriptId, url: event.url, executionContextId: event.executionContextId,
      hash: typeof event.hash === "string" ? event.hash.slice(0, 128) : null,
      startLine: Number.isInteger(event.startLine) ? event.startLine : 0,
      startColumn: Number.isInteger(event.startColumn) ? event.startColumn : 0,
      sourceMapURL: typeof event.sourceMapURL === "string" && event.sourceMapURL.length <= MAX_MAP_BYTES * 2 ? event.sourceMapURL : "",
      hasSourceURL: event.hasSourceURL === true,
    });
  }
  private allowedUrl(value: string): boolean {
    try { const url = new URL(value); return url.origin === this.origin && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  }
  private remove(id: string): void { this.scripts.delete(id); this.maps.delete(id); this.texts.delete(id); }
  clear(): void { this.contexts.clear(); this.scripts.clear(); this.maps.clear(); this.texts.clear(); this.truncated = false; this.revision++; }
  dispose(): void { for (const [name, handler] of this.listeners) this.cdp.off(name, handler); this.listeners.length = 0; this.clear(); }

  async inventory(context: OperationContext): Promise<SourceInventory> {
    const scripts: SourceInventory["scripts"] = [];
    const selected = [...this.scripts.values()].reverse().sort((a, b) => sourcePriority(a.url) - sourcePriority(b.url)).slice(0, 20);
    let truncatedSources = false;
    for (const script of selected) {
      if (remaining(context) <= 0 || context.signal?.aborted) break;
      const record = await this.mapFor(script, context);
      if (this.scripts.get(script.scriptId) !== script) continue;
      if ((record.map?.resolvedSources.length ?? 0) > 30) truncatedSources = true;
      scripts.push({ ...this.identity(script.scriptId)!, sources: record.map?.resolvedSources.slice(0, 30).map(safeUrl) ?? [], mapping: record.map ? "available" : "unavailable", ...(record.reason ? { reason: record.reason } : {}) });
    }
    return { schemaVersion: 1, scope: "main-frame-default-world", scripts, truncated: truncatedSources || this.truncated || scripts.length < this.scripts.size };
  }

  async location(id: string, line: number, column: number, context: OperationContext): Promise<SourceReference | null> {
    const script = this.scripts.get(id);
    if (!script || !this.contexts.has(script.executionContextId) || !Number.isInteger(line) || !Number.isInteger(column) || line < script.startLine || column < 0) return null;
    const reference: SourceReference = { scriptId: id, scriptHash: script.hash, generated: { url: safeUrl(script.url), line: line + 1, column: column + 1 }, original: null, mapping: "unavailable" };
    const relativeLine = line - script.startLine;
    const relativeColumn = column - (relativeLine === 0 ? script.startColumn : 0);
    if (relativeColumn < 0) return { ...reference, reason: "Position precedes the script resource start." };
    const record = await this.mapFor(script, context);
    if (this.scripts.get(id) !== script) return null;
    if (!record.map) return { ...reference, reason: record.reason };
    try {
      const original = originalPositionFor(record.map, { line: relativeLine + 1, column: relativeColumn });
      if (original.source !== null && original.line !== null && original.column !== null) {
        reference.original = { url: safeUrl(original.source), line: original.line, column: original.column + 1 };
        reference.mapping = "mapped";
      } else reference.reason = "No source-map segment covers this generated position.";
    } catch { reference.reason = "The source map could not resolve this position."; }
    return reference;
  }

  async locationByUrl(url: string, line: number, column: number, context: OperationContext): Promise<SourceReference | null> {
    const matches = [...this.scripts.values()].filter((script) => script.url === url);
    return matches.length === 1 ? this.location(matches[0]!.scriptId, line, column, context) : null;
  }

  async fromOffset(id: string, offset: number, endOffset: number, context: OperationContext): Promise<SourceReference | null> {
    const script = this.scripts.get(id);
    if (!script || !Number.isInteger(offset) || !Number.isInteger(endOffset) || offset < 0 || endOffset < offset) return null;
    let code = this.texts.get(id);
    if (code === undefined) {
      const result = await cdpCommand(this.cdp, "Debugger.getScriptSource", { scriptId: id }, context);
      if (typeof result.scriptSource !== "string" || result.scriptSource.length > MAX_SOURCE_CHARS || this.scripts.get(id) !== script) return null;
      code = result.scriptSource as string; this.cache(this.texts, id, code);
    }
    if (endOffset > code.length) return null;
    // String offsets and CDP columns both count UTF-16 code units. CRLF is one line ending.
    const prefix = code.slice(0, offset);
    const lines = prefix.split(/\r\n|\r|\n/);
    const relativeLine = lines.length - 1;
    return this.location(id, script.startLine + relativeLine, (lines.at(-1)?.length ?? 0) + (relativeLine === 0 ? script.startColumn : 0), context);
  }

  async breakpoint(input: BreakpointInput, context: OperationContext): Promise<{ scriptId: string; lineNumber: number; columnNumber: number; url: string }> {
    if (this.truncated && !input.scriptId) throw new WebDebugError("SOURCE_LOCATION_UNAVAILABLE", "The script inventory is incomplete; select one exact retained scriptId.");
    const matches: Array<{ scriptId: string; lineNumber: number; columnNumber: number; url: string }> = [];
    for (const script of this.scripts.values()) {
      if (input.scriptId && input.scriptId !== script.scriptId) continue;
      throwIfCancelled(context);
      const record = await this.mapFor(script, context);
      if (!record.map || this.scripts.get(script.scriptId) !== script) continue;
      // Exact identifiers only. Never select a file by basename or treat a source name as a disk path.
      if (!record.map.resolvedSources.includes(input.sourceUrl)) continue;
      const positions = allGeneratedPositionsFor(record.map, { source: input.sourceUrl, line: input.line, column: (input.column ?? 1) - 1 });
      for (const position of positions) {
        if (position.line === null || position.column === null) continue;
        matches.push({ scriptId: script.scriptId, lineNumber: position.line - 1 + script.startLine, columnNumber: position.column + (position.line === 1 ? script.startColumn : 0), url: script.url });
        if (matches.length > 1) throw new WebDebugError("SOURCE_LOCATION_AMBIGUOUS", "The original position maps to multiple generated locations; select an exact scriptId and column from source evidence.");
      }
    }
    if (matches.length !== 1) throw new WebDebugError("SOURCE_LOCATION_UNAVAILABLE", "No current, uniquely mapped generated location is available for this original source position.");
    return matches[0]!;
  }

  private async mapFor(script: Script, context: OperationContext): Promise<MapRecord> {
    const cached = this.maps.get(script.scriptId);
    if (cached) return cached;
    if (!script.sourceMapURL) return { map: null, reason: "The script declares no supported source map." };
    if (context.signal?.aborted || remaining(context) <= 0) return { map: null, reason: "Source-map lookup budget exhausted." };
    try {
      let text: string;
      let mapUrl = script.url;
      if (script.sourceMapURL.startsWith("data:")) {
        const match = /^data:application\/json(?:;charset=utf-8)?(;base64)?,(.*)$/is.exec(script.sourceMapURL);
        if (!match) throw new Error("Unsupported inline map");
        text = match[1] ? Buffer.from(match[2]!, "base64").toString("utf8") : decodeURIComponent(match[2]!);
      } else {
        if (script.hasSourceURL) throw new Error("Synthetic script names cannot authorize a fetch");
        mapUrl = new URL(script.sourceMapURL, script.url).href;
        if (!this.allowedUrl(mapUrl)) throw new Error("Map outside selected origin");
        const signal = AbortSignal.any([AbortSignal.timeout(Math.max(1, Math.min(1000, remaining(context)))), ...(context.signal ? [context.signal] : [])]);
        // An external map may have changed since this script was parsed (for example HMR).
        // Compare the current generated resource with exact CDP text before trusting that map.
        const captured = await cdpCommand(this.cdp, "Debugger.getScriptSource", { scriptId: script.scriptId }, context);
        if (typeof captured.scriptSource !== "string" || captured.scriptSource.length > MAX_SOURCE_CHARS) throw new Error("Source unavailable");
        const generatedResponse = await fetch(script.url, { redirect: "error", credentials: "omit", cache: "no-store", signal });
        if (!generatedResponse.ok) { await generatedResponse.body?.cancel(); throw new Error("Generated source unavailable"); }
        const generated = await readResponseTextBounded(generatedResponse, MAX_MAP_BYTES, "Generated script", signal);
        if (generated !== captured.scriptSource) throw new Error("Generated source changed since parsing");
        const response = await fetch(mapUrl, { redirect: "error", credentials: "omit", cache: "no-store", signal });
        if (!response.ok) { await response.body?.cancel(); throw new Error("Map unavailable"); }
        text = await readResponseTextBounded(response, MAX_MAP_BYTES, "Source map", signal);
      }
      if (Buffer.byteLength(text) > MAX_MAP_BYTES) throw new Error("Map too large");
      const raw = JSON.parse(text);
      if (raw?.version !== 3 || typeof raw.mappings !== "string" || !Array.isArray(raw.sources) || !Array.isArray(raw.names) || raw.sources.length > 1000 || raw.names.length > 10000 || raw.sections || raw.mappings.length > 120000 || !raw.sources.every((v: unknown) => typeof v === "string" && v.length <= 2048) || !raw.names.every((v: unknown) => typeof v === "string" && v.length <= 500) || (raw.sourceRoot !== undefined && (typeof raw.sourceRoot !== "string" || raw.sourceRoot.length > 2048))) throw new Error("Unsupported map shape");
      // Do not retain original source bodies; only positions and names are needed.
      delete raw.sourcesContent;
      const map = new TraceMap(raw, mapUrl);
      const decoded = decodedMappings(map);
      if (decoded.length > 50000 || decoded.reduce((count, line) => count + line.length, 0) > 100000 || map.resolvedSources.some((value) => value.length > 2048)) throw new Error("Map complexity limit");
      for (const line of decoded) {
        let previousColumn = -1;
        for (const segment of line) {
          if (![1, 4, 5].includes(segment.length) || segment.some((value) => !Number.isSafeInteger(value) || value < 0) || segment[0] < previousColumn || (segment.length > 1 && segment[1]! >= map.sources.length) || (segment.length > 4 && segment[4]! >= map.names.length)) throw new Error("Invalid source-map segment");
          previousColumn = segment[0];
        }
      }
      const record = { map };
      if (this.scripts.get(script.scriptId) !== script) return { map: null, reason: "Script identity changed during source-map lookup." };
      this.cache(this.maps, script.scriptId, record);
      return record;
    } catch {
      // No unsafe URL, source body, filesystem path, or arbitrary producer error escapes here.
      return { map: null, reason: "Source map unavailable, outside the selected origin, malformed, or over budget." };
    }
  }
  private cache<T>(map: Map<string, T>, key: string, value: T): void {
    map.set(key, value);
    while (map.size > MAX_CACHED) map.delete(map.keys().next().value!);
  }
}

export function sourcePriority(url: string): number {
  return /\/(?:node_modules|@vite|@react-refresh)(?:\/|\?|$)/.test(url) ? 1 : 0;
}

export async function cdpCommand(cdp: CDPSession, method: string, params: Record<string, unknown>, context: OperationContext = {}, timeoutMs = 1500): Promise<any> {
  throwIfCancelled(context);
  const duration = Math.max(1, Math.min(timeoutMs, remaining(context)));
  let timer: ReturnType<typeof setTimeout>;
  let onAbort: () => void = () => {};
  const promise = cdp.send(method as any, params as any);
  const tracked = promise.then(() => undefined, () => undefined);
  context.pending?.add(tracked); void tracked.then(() => context.pending?.delete(tracked));
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new WebDebugError("DIAGNOSTIC_TIMEOUT", "The diagnostic protocol command exceeded its bound.")), duration);
      onAbort = () => reject(new WebDebugError("REQUEST_CANCELLED", "The diagnostic operation was cancelled."));
      context.signal?.addEventListener("abort", onAbort, { once: true });
    })]);
  } finally { clearTimeout(timer!); context.signal?.removeEventListener("abort", onAbort); }
}
