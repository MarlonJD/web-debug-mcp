import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import { parseDoctorArgs, runDoctor } from "../src/core/doctor.js";

const execFileAsync = promisify(execFile);

describe("doctor CLI contract", () => {
  it("parses only explicit bounded option pairs", () => {
    expect(parseDoctorArgs(["--project-root", "fixtures/vanilla", "--browser", "chromium", "--executable-path", process.execPath], process.cwd())).toMatchObject({
      browser: "chromium",
      executablePath: process.execPath,
    });
    expect(() => parseDoctorArgs(["--unknown", "value"])).toThrowError(/Unknown doctor argument/);
    expect(() => parseDoctorArgs(["--browser", "firefox"])).toThrowError(/chromium or safari/);
    expect(() => parseDoctorArgs(["--browser", "safari", "--executable-path", process.execPath])).toThrowError(/Safari doctor checks/);
  });

  it("reports local project and explicit browser readiness without launching a browser", async () => {
    const report = await runDoctor({
      projectRoot: "fixtures/vanilla",
      browser: "chromium",
      executablePath: process.execPath,
    });
    expect(report.schemaVersion).toBe(2);
    expect(report.ok).toBe(true);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "node", status: "pass" }),
      expect.objectContaining({ id: "project", status: "pass" }),
      expect.objectContaining({ id: "browser", status: "warn" }),
      expect.objectContaining({ id: "target-url", status: "skipped" }),
    ]));
  });

  it("warns instead of promoting fixture-only root dependencies to application readiness", async () => {
    const report = await runDoctor({ projectRoot: ".", browser: "chromium", executablePath: process.execPath });
    expect(report.ok).toBe(true);
    expect(report.project).toMatchObject({ kind: "library", confidence: "low", frameworks: [], projectCapabilities: { browserTarget: false } });
    expect(report.checks).toContainEqual(expect.objectContaining({ id: "project", status: "warn", message: expect.stringContaining("no framework adapter") }));
  });

  it("documents the CLI and warns when Safari BiDi lacks a WebSocket runtime", async () => {
    const { stdout } = await execFileAsync(process.execPath, ["bin/web-debug-mcp.mjs", "doctor", "--help"], { cwd: process.cwd() });
    expect(stdout).toContain("web-debug-mcp doctor [options]");
    expect(stdout).toContain("--webdriver-endpoint");

    vi.stubGlobal("WebSocket", undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ value: { ready: true } }), { status: 200 })));
    try {
      const report = await runDoctor({ projectRoot: "fixtures/vanilla", browser: "safari", webdriverEndpoint: "http://127.0.0.1:4444" });
      expect(report.ok).toBe(true);
      expect(report.checks).toContainEqual(expect.objectContaining({ id: "node", status: "warn", message: expect.stringContaining("WebSocket is unavailable") }));
      expect(report.checks).toContainEqual(expect.objectContaining({ id: "browser", status: "pass" }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not contact a remote browser endpoint", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("WEB_DEBUG_CHROME_EXECUTABLE_PATH", process.execPath);
    try {
      const report = await runDoctor({ projectRoot: "fixtures/react-vite", browser: "chromium", cdpEndpoint: "http://192.0.2.1:9222", url: "http://192.0.2.1:4174/" });
      expect(report.ok).toBe(false);
      expect(report.checks).toContainEqual(expect.objectContaining({ id: "browser", status: "fail", message: expect.stringContaining("remote CDP") }));
      expect(report.checks).toContainEqual(expect.objectContaining({ id: "vite", status: "skipped" }));
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("requires protocol evidence instead of accepting a generic HTTP 200", async () => {
    const genericFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", genericFetch);
    try {
      const cdp = await runDoctor({ projectRoot: "fixtures/vanilla", browser: "chromium", cdpEndpoint: "http://127.0.0.1:9222" });
      expect(cdp.checks).toContainEqual(expect.objectContaining({ id: "browser", status: "fail", message: expect.stringContaining("valid JSON") }));

      const webdriver = await runDoctor({ projectRoot: "fixtures/vanilla", browser: "safari", webdriverEndpoint: "http://127.0.0.1:4444" });
      expect(webdriver.checks).toContainEqual(expect.objectContaining({ id: "browser", status: "fail", message: expect.stringContaining("valid JSON") }));
    } finally {
      vi.unstubAllGlobals();
    }

    const protocolFetch = vi.fn(async (input: string | URL | Request) => String(input).endsWith("/json/version")
      ? new Response(JSON.stringify({ Browser: "Chrome/test", "Protocol-Version": "1.3", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/test" }), { status: 200 })
      : new Response(JSON.stringify({ value: { ready: true, message: "ready" } }), { status: 200 }));
    vi.stubGlobal("fetch", protocolFetch);
    try {
      const cdp = await runDoctor({ projectRoot: "fixtures/vanilla", browser: "chromium", cdpEndpoint: "http://127.0.0.1:9222" });
      expect(cdp.checks).toContainEqual(expect.objectContaining({ id: "browser", status: "pass" }));
      const webdriver = await runDoctor({ projectRoot: "fixtures/vanilla", browser: "safari", webdriverEndpoint: "http://127.0.0.1:4444" });
      expect(webdriver.checks).toContainEqual(expect.objectContaining({ id: "browser", status: "pass" }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects a directory as an executable and aborts a stalled target body", async () => {
    const directoryReport = await runDoctor({ projectRoot: "fixtures/vanilla", browser: "chromium", executablePath: "fixtures/vanilla" });
    expect(directoryReport.checks).toContainEqual(expect.objectContaining({ id: "browser", status: "fail" }));

    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull() { return new Promise<void>(() => undefined); },
    }), { status: 200 })));
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: (...args: unknown[]) => void) => {
      queueMicrotask(callback);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    try {
      const report = await runDoctor({ projectRoot: "fixtures/vanilla", browser: "chromium", executablePath: process.execPath, url: "http://127.0.0.1:4173/" });
      expect(report.ok).toBe(false);
      expect(report.checks).toContainEqual(expect.objectContaining({ id: "target-url", status: "fail", message: expect.stringContaining("aborted") }));
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("checks a loopback target and Vite endpoint with bounded fetches", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/__web_debug/vite")) return new Response(JSON.stringify({ detected: true, modules: [], hmr: { active: true, lastUpdate: null }, moduleCount: 0, warnings: [] }), { status: 200 });
      return new Response("ready", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const report = await runDoctor({
        projectRoot: "fixtures/react-vite",
        browser: "chromium",
        executablePath: process.execPath,
        url: "http://127.0.0.1:4174/",
      });
      expect(report.ok).toBe(true);
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "target-url", status: "pass" }),
        expect.objectContaining({ id: "vite", status: "pass" }),
      ]));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("checks only the Next tool catalog without invoking optional runtime tools", async () => {
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        const request = JSON.parse(String(init.body)) as { id: number; method: string };
        methods.push(request.method);
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { tools: [{ name: "get_project_metadata" }] } }), { status: 200 });
      }
      return new Response("ready", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const report = await runDoctor({
        projectRoot: "fixtures/next",
        browser: "chromium",
        executablePath: process.execPath,
        url: "http://127.0.0.1:4175/",
      });
      expect(report.checks).toContainEqual(expect.objectContaining({ id: "next", status: "pass" }));
      expect(methods).toEqual(["tools/list"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
