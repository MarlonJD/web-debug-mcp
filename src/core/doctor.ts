import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import type { ProjectDescriptor } from "../domain/types.js";
import { NextAdapter } from "../adapters/next.js";
import { ViteAdapter } from "../adapters/vite.js";
import { detectProject } from "./capabilities.js";
import { WebDebugError } from "./errors.js";
import { readResponseTextBounded } from "./http.js";
import { boundText, safeUrl } from "./redaction.js";
import { PACKAGE_VERSION } from "./version.js";

const DOCTOR_REQUEST_MS = 2_000;
const DOCTOR_RESPONSE_BYTES = 64 * 1024;

export interface DoctorOptions {
  projectRoot: string;
  url?: string;
  browser: "chromium" | "safari";
  executablePath?: string;
  cdpEndpoint?: string;
  webdriverEndpoint?: string;
}

export interface DoctorCheck {
  id: "arguments" | "node" | "project" | "browser" | "target-url" | "vite" | "next";
  status: "pass" | "warn" | "fail" | "skipped";
  message: string;
  recovery?: string;
}

export interface DoctorReport {
  schemaVersion: 1;
  version: string;
  ok: boolean;
  checkedAt: string;
  checks: DoctorCheck[];
  project: ProjectDescriptor | null;
  targetUrl: string | null;
}

export function parseDoctorArgs(args: string[], cwd = process.cwd()): DoctorOptions {
  const options: DoctorOptions = { projectRoot: cwd, browser: "chromium" };
  const valueOptions = new Set(["--project-root", "--url", "--browser", "--executable-path", "--cdp-endpoint", "--webdriver-endpoint"]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!;
    if (!valueOptions.has(flag)) throw new WebDebugError("DOCTOR_ARGUMENT_INVALID", `Unknown doctor argument: ${boundText(flag, 100)}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new WebDebugError("DOCTOR_ARGUMENT_INVALID", `Doctor argument requires a value: ${flag}`);
    if (value.length > 2_048) throw new WebDebugError("DOCTOR_ARGUMENT_INVALID", `Doctor argument is too long: ${flag}`);
    index += 1;
    if (flag === "--project-root") options.projectRoot = resolve(cwd, value);
    if (flag === "--url") options.url = value;
    if (flag === "--browser") {
      if (value !== "chromium" && value !== "safari") throw new WebDebugError("DOCTOR_ARGUMENT_INVALID", "--browser must be chromium or safari.");
      options.browser = value;
    }
    if (flag === "--executable-path") options.executablePath = value;
    if (flag === "--cdp-endpoint") options.cdpEndpoint = value;
    if (flag === "--webdriver-endpoint") options.webdriverEndpoint = value;
  }
  if (options.executablePath && options.cdpEndpoint) throw new WebDebugError("DOCTOR_ARGUMENT_INVALID", "Provide executable-path or cdp-endpoint, not both.");
  if (options.browser === "safari" && (options.executablePath || options.cdpEndpoint)) throw new WebDebugError("DOCTOR_ARGUMENT_INVALID", "Safari doctor checks use webdriver-endpoint, not Chromium launch options.");
  if (options.browser === "chromium" && options.webdriverEndpoint) throw new WebDebugError("DOCTOR_ARGUMENT_INVALID", "Chromium doctor checks do not use webdriver-endpoint.");
  return options;
}

export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push(nodeMajor < 20
    ? { id: "node", status: "fail", message: `Node ${process.versions.node} is unsupported.`, recovery: "Install Node.js 20 or newer." }
    : options.browser === "safari" && typeof globalThis.WebSocket !== "function"
      ? { id: "node", status: "warn", message: `Node ${process.versions.node} satisfies the base runtime contract, but WebSocket is unavailable for Safari BiDi.`, recovery: "Use Node 21+ or enable the Node 20 WebSocket runtime flag; WebDriver can continue with explicit BiDi limitations." }
      : { id: "node", status: "pass", message: `Node ${process.versions.node} satisfies the Node 20+ runtime contract.` });

  let project: ProjectDescriptor | null = null;
  try {
    project = detectProject(options.projectRoot);
    checks.push({ id: "project", status: "pass", message: `Detected ${project.frameworks.join(", ") || "generic"} project markers.` });
  } catch (error) {
    checks.push({ id: "project", status: "fail", message: boundedError(error), recovery: "Pass --project-root for the exact local web application directory." });
  }

  if (options.browser === "chromium") checks.push(await checkChromium(options));
  else checks.push(await checkSafari(options));

  let targetOrigin: string | null = null;
  let targetReady = false;
  if (options.url) {
    try {
      const parsed = new URL(options.url);
      if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !isLoopback(parsed.hostname)) {
        throw new WebDebugError("DOCTOR_TARGET_INVALID", "Doctor target URLs must use HTTP(S) on loopback.");
      }
      targetOrigin = parsed.origin;
      const { response } = await boundedFetchAndRead(options.url, { redirect: "manual" }, "Doctor target response");
      const location = response.headers.get("location");
      if (location && new URL(location, options.url).origin !== targetOrigin) throw new WebDebugError("NAVIGATION_ORIGIN_BLOCKED", "The local target redirects to another origin.");
      checks.push(response.status < 500
        ? { id: "target-url", status: response.ok ? "pass" : "warn", message: `Target responded with HTTP ${response.status}.` }
        : { id: "target-url", status: "fail", message: `Target responded with HTTP ${response.status}.`, recovery: "Start or repair the local development server." });
      targetReady = response.status < 500;
    } catch (error) {
      checks.push({ id: "target-url", status: "fail", message: boundedError(error), recovery: "Start the loopback development URL and retry doctor." });
    }
  } else {
    checks.push({ id: "target-url", status: "skipped", message: "No --url was supplied; runtime target readiness was not checked." });
  }

  if (project?.capabilities.vite) {
    if (!options.url || !targetReady) checks.push({ id: "vite", status: "skipped", message: "Vite readiness needs a validated reachable loopback --url." });
    else {
      try {
        const snapshot = await new ViteAdapter().snapshot(options.url, doctorContext());
        checks.push(snapshot?.detected
          ? { id: "vite", status: "pass", message: "Vite Web Debug endpoint is ready." }
          : { id: "vite", status: "warn", message: "Vite is detected but the Web Debug endpoint is unavailable.", recovery: "Install webDebugVitePlugin() in the development Vite config." });
      } catch (error) {
        checks.push({ id: "vite", status: "warn", message: boundedError(error), recovery: "Start Vite with webDebugVitePlugin() enabled for development." });
      }
    }
  }

  if (project?.capabilities.next) {
    if (!options.url || !targetReady) checks.push({ id: "next", status: "skipped", message: "Next runtime readiness needs a validated reachable loopback --url." });
    else {
      try {
        const tools = await new NextAdapter().listTools(options.url, doctorContext());
        checks.push(tools.length > 0
          ? { id: "next", status: "pass", message: `Next MCP endpoint advertises ${tools.length} bounded tools.` }
          : { id: "next", status: "warn", message: "Next MCP endpoint advertised no tools.", recovery: "Start a compatible Next development server." });
      } catch (error) {
        checks.push({ id: "next", status: "warn", message: boundedError(error), recovery: "Start a compatible Next development server and retry." });
      }
    }
  }

  return {
    schemaVersion: 1,
    version: PACKAGE_VERSION,
    ok: checks.every((check) => check.status !== "fail"),
    checkedAt: new Date().toISOString(),
    checks: checks.slice(0, 10),
    project,
    targetUrl: options.url ? boundText(safeUrl(options.url), 2_048) : null,
  };
}

export function doctorArgumentFailure(error: unknown): DoctorReport {
  return {
    schemaVersion: 1,
    version: PACKAGE_VERSION,
    ok: false,
    checkedAt: new Date().toISOString(),
    checks: [{ id: "arguments", status: "fail", message: boundedError(error), recovery: "Use doctor with value pairs such as --project-root <path> and --url <loopback-url>." }],
    project: null,
    targetUrl: null,
  };
}

async function checkChromium(options: DoctorOptions): Promise<DoctorCheck> {
  if (options.cdpEndpoint) {
    try {
      const configured = new URL(options.cdpEndpoint);
      if (!isLoopback(configured.hostname)) throw new WebDebugError("DOCTOR_REMOTE_BLOCKED", "Doctor does not contact remote CDP endpoints.");
      const endpoint = new URL("/json/version", configured);
      const { response, text } = await boundedFetchAndRead(endpoint, {}, "CDP version response");
      if (!response.ok) throw new Error(`CDP endpoint returned HTTP ${response.status}.`);
      const payload = parseJsonObject(text, "CDP version response");
      const browser = payload.Browser;
      const protocolVersion = payload["Protocol-Version"];
      const websocketUrl = payload.webSocketDebuggerUrl;
      if (typeof browser !== "string" || typeof protocolVersion !== "string" || typeof websocketUrl !== "string") {
        throw new Error("CDP version response did not contain Browser, Protocol-Version, and webSocketDebuggerUrl fields.");
      }
      const websocket = new URL(websocketUrl);
      if (!['ws:', 'wss:'].includes(websocket.protocol) || !isLoopback(websocket.hostname)) {
        throw new Error("CDP version response advertised a non-loopback or invalid WebSocket endpoint.");
      }
      return { id: "browser", status: "pass", message: `The explicit CDP endpoint is ready (${boundText(browser, 120)}, protocol ${boundText(protocolVersion, 40)}).` };
    } catch (error) {
      return { id: "browser", status: "fail", message: boundedError(error), recovery: "Start the explicit CDP endpoint or configure a Chromium executable." };
    }
  }
  const executable = options.executablePath ?? process.env.WEB_DEBUG_CHROME_EXECUTABLE_PATH;
  if (executable) {
    try {
      const info = await stat(executable);
      await access(executable, fsConstants.X_OK);
      if (!info.isFile()) throw new Error("not a regular file");
      return { id: "browser", status: "warn", message: "The explicitly configured browser path is an executable file; this validates configuration only and doctor did not execute it.", recovery: "Start a Web Debug session to verify Chromium launch compatibility and exact browser behavior." };
    } catch {
      return { id: "browser", status: "fail", message: "The configured Chromium executable is unavailable or not a regular file.", recovery: "Pass --executable-path or set WEB_DEBUG_CHROME_EXECUTABLE_PATH to an executable browser file." };
    }
  }
  return { id: "browser", status: "fail", message: "No Chromium executable or CDP endpoint was configured.", recovery: "Pass --executable-path, --cdp-endpoint, or set WEB_DEBUG_CHROME_EXECUTABLE_PATH." };
}

async function checkSafari(options: DoctorOptions): Promise<DoctorCheck> {
  const endpoint = options.webdriverEndpoint ?? process.env.WEB_DEBUG_SAFARI_WEBDRIVER_ENDPOINT;
  if (endpoint) {
    try {
      const configured = new URL(endpoint);
      if (!isLoopback(configured.hostname)) throw new WebDebugError("DOCTOR_REMOTE_BLOCKED", "Doctor does not contact remote WebDriver endpoints.");
      const { response, text } = await boundedFetchAndRead(new URL("/status", configured), {}, "Safari WebDriver status response");
      if (!response.ok) throw new Error(`Safari WebDriver returned HTTP ${response.status}.`);
      const payload = parseJsonObject(text, "Safari WebDriver status response");
      const value = payload.value;
      if (!value || typeof value !== "object" || Array.isArray(value) || (value as Record<string, unknown>).ready !== true) {
        throw new Error("Safari WebDriver status did not report value.ready=true.");
      }
      return { id: "browser", status: "pass", message: "The explicit Safari WebDriver endpoint is reachable." };
    } catch (error) {
      return { id: "browser", status: "fail", message: boundedError(error), recovery: "Start the configured Safari WebDriver endpoint and enable Safari remote automation." };
    }
  }
  const safaridriver = await findExecutable("safaridriver");
  return safaridriver
    ? { id: "browser", status: "warn", message: "safaridriver is installed; live readiness was not checked.", recovery: "Enable Safari Settings → Developer → Allow remote automation before starting a session." }
    : { id: "browser", status: "fail", message: "safaridriver was not found on PATH.", recovery: "Use macOS Safari with safaridriver or pass --webdriver-endpoint." };
}

async function boundedFetchAndRead(input: string | URL, init: RequestInit, label: string): Promise<{ response: Response; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOCTOR_REQUEST_MS);
  try {
    const response = await fetch(input, { redirect: "manual", ...init, signal: controller.signal });
    const text = await readResponseTextBounded(response, DOCTOR_RESPONSE_BYTES, label, controller.signal);
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function findExecutable(name: string): Promise<string | null> {
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = resolve(directory, name);
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch { /* continue */ }
  }
  return null;
}

function doctorContext() {
  const now = performance.now();
  return { deadline: now + DOCTOR_REQUEST_MS, clock: () => performance.now() };
}

function boundedError(error: unknown): string {
  return boundText(error instanceof Error ? error.message : String(error), 500);
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new WebDebugError("DOCTOR_PROTOCOL_INVALID", `${label} was not valid JSON.`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WebDebugError("DOCTOR_PROTOCOL_INVALID", `${label} was not a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
