// Ordinary Playwright baseline. No Web Debug imports, hooks or internal APIs.
import { chromium } from "playwright-core";
import { readFile, writeFile, mkdir, open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { randomUUID, createHash } from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, all) => index % 2 ? pairs : [...pairs, [item.replace(/^--/, ""), all[index + 1]]], []));
if (!args.url || !args.flow || !args.out || !process.env.BENCH_CHROME) throw new Error("Use --url <local-url> --flow <json> --out <json>; set BENCH_CHROME.");
const origin = new URL(args.url).origin;
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(args.url).hostname)) throw new Error("Use a loopback target.");
const flowBytes = await readFile(args.flow);
if (flowBytes.length > 65_536) throw new Error("Flow exceeds 64KiB.");
const flow = JSON.parse(flowBytes);
if (!Array.isArray(flow.actions) || flow.actions.length > 100 || !Array.isArray(flow.checks) || flow.checks.length > 64 || !flow.checks.length) throw new Error("Supply at most100actions and1..64checks.");
const repetitions = flow.repetitions ?? 1;
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) throw new Error("Repetitions must be1..5.");
const secrets = new Set();
for (const action of flow.actions) {
  if (action.valueFile) {
    const path = await realpath(resolve(action.valueFile));
    const inside = relative(await realpath(process.cwd()), path);
    if (inside.startsWith("..")) throw new Error("Operator input must be inside this app.");
    action.value = (await readFile(path, "utf8")).trimEnd();
  }
  if (["fill", "select"].includes(action.kind) && action.value) secrets.add(String(action.value));
}
const variants = [...secrets].flatMap(value => [value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1), new URLSearchParams({ v: value }).toString().slice(2)]).sort((a, b) => b.length - a.length);
const mask = value => variants.reduce((text, secret) => text.split(secret).join("[MASKED]"), String(value)).replace(/(Bearer\s+)\S+/gi, "$1[MASKED]").replace(/(password|token|authorization)\s*[=:]\s*[^\r\n,}]+/gi, "$1=[MASKED]");
const locator = (page, item) => {
  if (!item || item.kind === "css") return page.locator(item?.value ?? "body");
  if (item.kind === "role") return page.getByRole(item.role, { name: item.name, exact: true });
  if (item.kind === "text") return page.getByText(item.text, { exact: true });
  if (item.kind === "label") return page.getByLabel(item.text, { exact: true });
  if (item.kind === "testId") return page.getByTestId(item.value);
  throw new Error("Unknown locator kind.");
};
const bounded = (value, length = 4_000) => mask(value).slice(0, length);
const browser = await chromium.launch({ executablePath: process.env.BENCH_CHROME, headless: true });
const attempts = [];
const started = Date.now();

async function nextRuntime(network) {
  let id = 0;
  const request = async (method, params) => {
    const response = await fetch(`${origin}/_next/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }), signal: AbortSignal.timeout(3_000) });
    const body = await response.text();
    if (body.length > 131_072) throw new Error("Framework response exceeded its bound.");
    const json = body.trim().startsWith("{") ? JSON.parse(body) : JSON.parse(body.split("\n").filter(line => line.startsWith("data:")).at(-1).slice(5).trim());
    if (json.error) throw new Error("Framework tool unavailable.");
    return json.result;
  };
  const call = async (name, arguments_ = {}) => {
    const result = await request("tools/call", { name, arguments: arguments_ });
    const text = result?.content?.find(item => item.type === "text")?.text;
    if (!text) return result;
    try { return JSON.parse(text); } catch { return text; }
  };
  try {
    const listed = await request("tools/list", {});
    const tools = listed.tools.map(item => item.name);
    const executions = [];
    for (const actionId of [...new Set(network.map(item => item.actionId).filter(Boolean))].slice(-5)) executions.push({ actionId, resolution: tools.includes("get_server_action_by_id") ? await call("get_server_action_by_id", { actionId }) : null });
    const metadata = tools.includes("get_project_metadata") ? await call("get_project_metadata") : null;
    const requests = tools.includes("get_request_insights") ? await call("get_request_insights") : null;
    // Opaque framework data is already bounded; mask only this payload, not host verdicts.
    return { state: "fresh", payload: JSON.parse(mask(JSON.stringify({ tools, executions, metadata, requests }))) };
  } catch (error) { return { state: "unavailable", warning: bounded(error.message, 500) }; }
}

async function logTail(file) {
  let handle;
  try {
    const root = await realpath(process.cwd());
    const path = await realpath(resolve(file));
    if (relative(root, path).startsWith("..")) throw new Error("Outside project log.");
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("Non-regular log.");
    const size = Math.min(stat.size, 131_072);
    const buffer = Buffer.alloc(size);
    const read = await handle.read(buffer, 0, size, stat.size - size);
    let text = buffer.subarray(0, read.bytesRead).toString("utf8");
    if (stat.size > size) text = text.slice(text.indexOf("\n") + 1);
    text = text.slice(0, text.lastIndexOf("\n") + 1);
    return { state: "fresh", text: bounded(text, 16_000), truncated: stat.size > size || text.length > 16_000 };
  } catch { return { state: "unavailable", text: null }; }
  finally { await handle?.close(); }
}

async function observe(page, check, network, consoleEntries) {
  const found = "locator" in check ? locator(page, check.locator) : null;
  let observed, pass;
  if (check.kind === "locatorCount") { observed = await found.count(); pass = observed === check.count; }
  else if (check.kind === "locatorText") { observed = await found.innerText(); pass = check.match === "exact" ? observed === check.text : observed.includes(check.text); }
  else if (check.kind === "locatorNumber") { const text = (await found.innerText()).trim(); observed = /^-?(?:\d+\.?\d*|\d*\.\d+)$/.test(text) ? Number(text) : null; pass = observed !== null && Math.abs(observed - check.value) <= (check.tolerance ?? 0); }
  else if (check.kind === "locatorVisible") { observed = await found.isVisible(); pass = observed === check.visible; }
  else if (check.kind === "locatorEnabled" || check.kind === "locatorDisabled") { observed = await found.isEnabled(); pass = observed === (check.kind === "locatorDisabled" ? !check.disabled : check.enabled); }
  else if (check.kind === "locatorChecked") { observed = await found.isChecked(); pass = observed === check.checked; }
  else if (check.kind === "locatorInViewport" || check.kind === "locatorUnobstructed") {
    observed = await found.evaluate(element => {
      const box = element.getBoundingClientRect(); const style = getComputedStyle(element);
      const inViewport = box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight && style.visibility !== "hidden" && style.display !== "none";
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { inViewport, unobstructed: inViewport && Boolean(hit && (hit === element || element.contains(hit))) };
    });
    pass = check.kind === "locatorInViewport" ? observed.inViewport === check.inViewport : observed.unobstructed === check.unobstructed;
  } else if (check.kind === "route") { observed = new URL(page.url()).pathname; pass = observed === check.path; }
  else if (check.kind === "noConsoleErrors") { observed = consoleEntries.filter(item => ["error", "pageerror"].includes(item.level)).length; pass = observed === 0; }
  else if (check.kind === "networkComplete" || check.kind === "networkResponse") {
    observed = network.filter(item => new URL(item.url).origin === origin && new URL(item.url).pathname === check.path && item.method === check.method);
    pass = observed.length >= (check.minimumCount ?? 1) && observed.every(item => item.completed && (check.kind === "networkComplete" || item.status === check.status));
  } else throw new Error("Unknown check kind.");
  return { kind: check.kind, state: pass ? "pass" : "fail", observed: bounded(typeof observed === "object" ? JSON.stringify(observed) : observed, 500), provenance: "ordinary-playwright", freshness: "fresh" };
}

try {
  for (let ordinal = 1; ordinal <= repetitions; ordinal++) {
    const context = await browser.newContext({ viewport: flow.viewport ?? { width: 1_440, height: 900 } });
    const page = await context.newPage();
    const consoleEntries = [], network = [], requests = new Map();
    page.on("console", message => { consoleEntries.push({ level: message.type(), text: message.text() }); if (consoleEntries.length > 100) consoleEntries.shift(); });
    page.on("pageerror", error => { consoleEntries.push({ level: "pageerror", text: error.message }); });
    page.on("request", request => {
      const record = { method: request.method(), url: request.url(), status: null, completed: false };
      network.push(record); requests.set(request, record);
      request.allHeaders().then(headers => { record.actionId = headers["next-action"] ?? null; }).catch(() => undefined);
    });
    page.on("response", response => { const record = requests.get(response.request()); if (record) record.status = response.status(); });
    page.on("requestfinished", request => { const record = requests.get(request); if (record) record.completed = true; });
    page.on("requestfailed", request => { const record = requests.get(request); if (record) { record.completed = true; record.failure = request.failure()?.errorText; } });
    const action = async item => {
      const found = item.locator ? locator(page, item.locator) : null;
      if (item.kind === "navigate") { if (new URL(item.url).origin !== origin) throw new Error("Navigation outside selected origin."); await page.goto(item.url); }
      else if (item.kind === "reload") await page.reload();
      else if (item.kind === "click") await found.click();
      else if (item.kind === "fill") await found.fill(item.value);
      else if (item.kind === "press") await found.press(item.key === "Space" ? " " : item.key);
      else if (item.kind === "check") await found.setChecked(item.checked);
      else if (item.kind === "select") await found.selectOption(item.value);
      else if (item.kind === "hover") await found.hover();
      else if (item.kind === "scroll") await found.scrollIntoViewIfNeeded();
      else if (item.kind === "wait") {
        const deadline = Date.now() + (item.timeoutMs ?? 5_000);
        while (true) {
          const value = item.property === "count" ? await found.count() : item.property === "text" ? await found.innerText().catch(() => "") : item.property === "visible" ? await found.isVisible() : item.property === "enabled" ? await found.isEnabled() : await found.isChecked();
          if (value === item.expected) break;
          if (Date.now() > deadline) throw new Error("Observable wait timed out.");
          await page.waitForTimeout(25);
        }
      } else throw new Error("Unknown action kind.");
    };
    const attempt = { attemptId: randomUUID(), ordinal, capturedAt: new Date().toISOString(), checks: [], warnings: [] };
    attempts.push(attempt);
    try {
      for (const reset of flow.resetActions ?? []) await action(reset);
      await page.goto(args.url);
      for (const item of flow.actions) await action(item);
      if (flow.completion) {
        const deadline = Date.now() + flow.completion.timeoutMs;
        let stable = null;
        while (true) {
          const checks = await Promise.all(flow.completion.checks.map(check => observe(page, check, network, consoleEntries)));
          if (checks.every(check => check.state === "pass")) { stable ??= Date.now(); if (Date.now() - stable >= (flow.completion.stableForMs ?? 50)) break; } else stable = null;
          if (Date.now() > deadline) throw new Error("Observable completion timed out.");
          await page.waitForTimeout(25);
        }
      }
      for (const check of flow.checks) attempt.checks.push(await observe(page, check, network, consoleEntries));
      attempt.dom = { url: page.url(), bodyText: bounded(await page.locator("body").innerText()) };
      attempt.console = consoleEntries.slice(-20).map(item => ({ level: item.level, text: bounded(item.text, 500) }));
      attempt.network = network.slice(-40).map(item => ({ ...item, url: bounded(item.url, 2_560) }));
      if (flow.framework === "next") attempt.next = await nextRuntime(network);
      if (flow.logFile) attempt.logs = await logTail(flow.logFile);
      if (flow.screenshot && secrets.size === 0) { const imagePath = `${args.out}.attempt-${ordinal}.png`; await page.screenshot({ path: imagePath }); attempt.screenshot = imagePath; }
      attempt.state = attempt.checks.every(check => check.state === "pass") ? "pass" : "fail";
    } catch (error) { attempt.state = "unavailable"; attempt.warnings.push(bounded(error.message, 500)); }
    finally { await context.close(); }
  }
} finally { await browser.close(); }
const result = { collector: "ordinary-playwright-v1", flowSha256: createHash("sha256").update(flowBytes).digest("hex"), actualAttempts: attempts.length, elapsedMs: Date.now() - started, outcome: attempts.some(item => item.state === "unavailable") ? "inconclusive" : attempts.every(item => item.state === "pass") ? "verified" : "failed", attempts };
await mkdir(dirname(resolve(args.out)), { recursive: true });
await writeFile(args.out, JSON.stringify(result, null, 2));
process.stdout.write(JSON.stringify({ outcome: result.outcome, actualAttempts: result.actualAttempts, elapsedMs: result.elapsedMs, evidence: args.out, checks: attempts.map(item => item.checks) }) + "\n");
