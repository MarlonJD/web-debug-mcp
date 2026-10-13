import { EventEmitter } from "node:events";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { CDPSession } from "playwright-core";
import { ChromiumSources } from "../src/adapters/chromium-sources.js";
import { observeExecution } from "../src/adapters/chromium-execution.js";
import { redactExecutionDiagnostics, scrubDiagnosticValue } from "../src/core/diagnostic-redaction.js";
import { executionDiagnosticsSchema, sourceInventorySchema } from "../src/domain/diagnostic-schemas.js";

const origin = "http://127.0.0.1:4173";
const inline = (map: unknown) => `data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString("base64")}`;
const map = (mappings = "AAAA") => ({ version: 3, sources: ["src/fixture.tsx"], names: [], mappings, sourcesContent: ["private source must not be exported"] });
function fixture() {
  const events = new EventEmitter();
  const commands: string[] = [];
  const send = vi.fn(async (method: string, _params?: any): Promise<any> => {
    commands.push(method);
    if (method === "Debugger.getScriptSource") return { scriptSource: "😀x\r\nrun()" };
    if (method === "Profiler.startPreciseCoverage") return { timestamp: 10 };
    if (method === "Profiler.takePreciseCoverage") return { timestamp: 11, result: [{ scriptId: "s1", functions: [{ functionName: "run", isBlockCoverage: true, ranges: [{ startOffset: 5, endOffset: 10, count: 1 }, { startOffset: 6, endOffset: 9, count: 0 }] }] }] };
    return {};
  });
  const cdp = Object.assign(events, { send }) as unknown as CDPSession;
  const sources = new ChromiumSources(cdp, origin, "main");
  const context = (id = 1, frameId = "main", isDefault = true) => events.emit("Runtime.executionContextCreated", { context: { id, auxData: { frameId, isDefault } } });
  const script = (overrides: Record<string, unknown> = {}) => events.emit("Debugger.scriptParsed", { scriptId: "s1", url: `${origin}/bundle.js`, hash: "hash-1", executionContextId: 1, startLine: 0, startColumn: 0, sourceMapURL: inline(map("AAAA;AACA")), ...overrides });
  context(); script();
  return { events, send, commands, cdp, sources, context, script };
}
afterEach(() => vi.restoreAllMocks());

describe("bounded original source correlation", () => {
  it("maps stack coordinates and reverse breakpoints without exposing source bodies", async () => {
    const { sources } = fixture();
    expect(await sources.location("s1", 1, 0, {})).toMatchObject({ mapping: "mapped", generated: { line: 2, column: 1 }, original: { url: `${origin}/src/fixture.tsx`, line: 2, column: 1 } });
    expect(await sources.breakpoint({ sourceUrl: `${origin}/src/fixture.tsx`, line: 2 }, {})).toMatchObject({ scriptId: "s1", lineNumber: 1, columnNumber: 0 });
    expect(JSON.stringify(await sources.inventory({}))).not.toContain("private source");
  });
  it("counts UTF-16 offsets and CRLF correctly for inline resource starts", async () => {
    const { sources, script } = fixture();
    script({ startLine: 2, startColumn: 7 });
    expect(await sources.fromOffset("s1", 5, 10, {})).toMatchObject({ generated: { line: 4, column: 1 }, original: { line: 2, column: 1 } });
    expect(await sources.fromOffset("s1", 0, 2, {})).toMatchObject({ generated: { line: 3, column: 8 } });
    expect(await sources.fromOffset("s1", 0, 100, {})).toBeNull();
  });
  it("rejects unknown worlds, child frames, and cross-origin scripts", async () => {
    const { sources, context, script } = fixture();
    context(2, "child"); script({ scriptId: "child", executionContextId: 2 });
    context(3, "main", false); script({ scriptId: "isolated", executionContextId: 3 });
    script({ scriptId: "remote", url: "https://example.com/a.js" });
    for (const id of ["child", "isolated", "remote", "unknown"]) expect(sources.identity(id)).toBeNull();
  });
  it("invalidates maps on context destruction and disambiguates hot-update script identities", async () => {
    const { sources, events, context, script } = fixture();
    await sources.location("s1", 0, 0, {});
    script({ scriptId: "s2", hash: "hash-2" });
    await expect(sources.breakpoint({ sourceUrl: `${origin}/src/fixture.tsx`, line: 1 }, {})).rejects.toMatchObject({ code: "SOURCE_LOCATION_AMBIGUOUS" });
    expect(await sources.breakpoint({ sourceUrl: `${origin}/src/fixture.tsx`, line: 1, scriptId: "s2" }, {})).toMatchObject({ scriptId: "s2" });
    events.emit("Runtime.executionContextDestroyed", { executionContextId: 1 });
    expect(await sources.location("s1", 0, 0, {})).toBeNull();
    context(4); script({ executionContextId: 4, sourceMapURL: inline(map("AACA")) });
    expect(await sources.location("s1", 0, 0, {})).toMatchObject({ original: { line: 2 } });
  });
  it("reports missing, malformed, unsafe and oversized maps as unavailable without fetching other origins", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const { sources, script } = fixture();
    for (const sourceMapURL of ["", "file:///etc/passwd", "https://example.com/x.map", "data:text/plain,abc", inline({}), inline({ ...map(), mappings: "A".repeat(600000) })]) {
      script({ sourceMapURL });
      expect(await sources.location("s1", 0, 0, {})).toMatchObject({ mapping: "unavailable", original: null });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds same-origin map HTTP reads and forbids redirect authority", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => new Response(String(url).endsWith("bundle.js") ? "😀x\r\nrun()" : JSON.stringify(map())));
    const { sources, script } = fixture();
    script({ sourceMapURL: "/bundle.js.map" });
    expect(await sources.location("s1", 0, 0, {})).toMatchObject({ mapping: "mapped" });
    expect(fetch).toHaveBeenCalledWith(`${origin}/bundle.js.map`, expect.objectContaining({ redirect: "error", credentials: "omit" }));
    script({ sourceMapURL: "/oversized.map" });
    fetch.mockResolvedValue(new Response("{}", { headers: { "content-length": "9999999" } }));
    expect(await sources.location("s1", 0, 0, {})).toMatchObject({ mapping: "unavailable" });
  });
  it("rejects a stale external map when the generated resource differs from loaded CDP text", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("new generated body"));
    const { sources, script } = fixture();
    script({ sourceMapURL: "/bundle.js.map" });
    expect(await sources.location("s1", 0, 0, {})).toMatchObject({ mapping: "unavailable" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retain a map resolved after its script context was replaced", async () => {
    const { sources, events, script } = fixture();
    script({ sourceMapURL: "/slow.map" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => { events.emit("Runtime.executionContextsCleared"); return new Response(JSON.stringify(map())); });
    expect(await sources.location("s1", 0, 0, {})).toBeNull();
  });
});

describe("execution observation lifecycle", () => {
  it("keeps diagnostic schemas valid after short private inputs expand redaction markers", async () => {
    const inventory = scrubDiagnosticValue({ schemaVersion: 1 as const, scope: "main-frame-default-world" as const, scripts: [{ scriptId: "10", url: `${origin}/0.js`, hash: "0".repeat(64), sources: [`${origin}/${"0".repeat(500)}.ts`], mapping: "available" as const }], truncated: false }, ["0"]);
    expect(sourceInventorySchema.safeParse(inventory).success).toBe(true);
    expect(inventory.scripts[0]?.hash).toBeNull();
    expect(inventory.scripts[0]?.scriptId).toBe("10");
    const { cdp, sources } = fixture();
    const result = await observeExecution(cdp, sources, "main", origin, async () => ({ schemaVersion: 1, kind: "click", url: origin, title: "fixture" }), { coverage: true, settleMs: 0 }, {});
    const safe = redactExecutionDiagnostics(result.diagnostics!, ["0", "collected", "complete"]);
    expect(executionDiagnosticsSchema.safeParse(safe).success).toBe(true);
    expect(safe.actionId).toBe(result.diagnostics!.actionId);
    expect(safe.coverage.state).toBe("collected");
    expect(safe.cleanup).toBe("complete");
  });

  it("joins executed/zero-count ranges and request initiators, then stops every enabled domain", async () => {
    const { cdp, sources, events, commands } = fixture();
    const result = await observeExecution(cdp, sources, "main", origin, async () => {
      events.emit("Network.requestWillBeSent", { requestId: "r1", frameId: "main", request: { method: "GET", url: `${origin}/api` }, initiator: { type: "script", stack: { callFrames: [{ scriptId: "s1", lineNumber: 1, columnNumber: 0 }] } } });
      events.emit("Network.responseReceived", { requestId: "r1", response: { status: 200 } });
      events.emit("Network.loadingFinished", { requestId: "r1" });
      return { schemaVersion: 1 as const, kind: "click", url: origin, title: "fixture" };
    }, { coverage: true, settleMs: 0 }, {});
    expect(executionDiagnosticsSchema.safeParse(result.diagnostics).success).toBe(true);
    expect(executionDiagnosticsSchema.safeParse(redactExecutionDiagnostics(result.diagnostics!)).success).toBe(true);
    expect(result.diagnostics?.coverage.scripts[0]?.functions[0]?.ranges.map((item) => item.count)).toEqual([1, 0]);
    expect(result.diagnostics?.requests[0]).toMatchObject({ association: "cdp-initiator", status: 200, initiator: { original: { line: 2 } } });
    expect(commands).toContain("Profiler.stopPreciseCoverage");
    expect(commands.indexOf("Profiler.stopPreciseCoverage")).toBeGreaterThan(commands.indexOf("Profiler.takePreciseCoverage"));
    expect(commands).toContain("Profiler.disable");
    expect(commands).toContain("Network.disable");
    expect(events.listenerCount("Network.requestWillBeSent")).toBe(0);
  });
  it("keeps coverage off unless requested", async () => {
    const { cdp, sources, commands } = fixture();
    const result = await observeExecution(cdp, sources, "main", origin, async () => ({ schemaVersion: 1 as const, kind: "click", url: origin, title: "fixture" }), { settleMs: 0 }, {});
    expect(result.diagnostics?.coverage.state).toBe("not-requested");
    expect(commands.some((command) => command.startsWith("Profiler."))).toBe(false);
  });
  it.each(["throw", "cancel"])("cleans instrumentation when action terminates through %s", async (mode) => {
    const { cdp, sources, commands } = fixture();
    const controller = new AbortController();
    await expect(observeExecution(cdp, sources, "main", origin, async () => {
      if (mode === "throw") throw new Error("action failure");
      controller.abort(); return { schemaVersion: 1 as const, kind: "click", url: origin, title: "fixture" };
    }, { coverage: true, settleMs: 0 }, { signal: controller.signal })).rejects.toThrow();
    expect(commands).toEqual(expect.arrayContaining(["Profiler.stopPreciseCoverage", "Profiler.disable", "Network.disable"]));
  });
  it("does not claim cleanup success when a stop command fails", async () => {
    const { cdp, sources, send } = fixture();
    send.mockImplementation(async (method) => { if (method === "Profiler.stopPreciseCoverage") throw new Error("gone"); return {}; });
    await expect(observeExecution(cdp, sources, "main", origin, async () => ({ schemaVersion: 1 as const, kind: "click", url: origin, title: "fixture" }), { coverage: true, settleMs: 0 }, {})).rejects.toMatchObject({ code: "DIAGNOSTIC_CLEANUP_FAILED" });
  });
  it("marks coverage unavailable after document replacement", async () => {
    const { cdp, sources, events } = fixture();
    const result = await observeExecution(cdp, sources, "main", origin, async () => { events.emit("Runtime.executionContextsCleared"); return { schemaVersion: 1 as const, kind: "reload", url: origin, title: "fixture" }; }, { coverage: true, settleMs: 0 }, {});
    expect(result.diagnostics?.coverage).toMatchObject({ state: "unavailable", scripts: [] });
  });
});
