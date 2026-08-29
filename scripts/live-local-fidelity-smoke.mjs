import { createServer as createHttpsServer } from "node:https";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { SessionManager } from "../dist/core/session-manager.js";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const browserPath = process.env.WEB_DEBUG_CHROME_EXECUTABLE_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.WEB_DEBUG_FIDELITY_PORT ?? 4190);
const leakPort = port + 1;
const root = await mkdtemp(join(tmpdir(), "web-debug-mcp-fidelity-"));
const keyPath = join(root, "fixture-key.pem");
const certPath = join(root, "fixture-cert.pem");
const authPath = join(root, "storage-state.json");
const artifactDir = join(root, "artifacts");
let server;
let leakServer;
let manager;
let fixed = false;
let leakRequests = 0;
let leakUpgrades = 0;

try {
  if (!existsSync(browserPath)) throw new Error(`Chromium executable not found: ${browserPath}`);
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fidelity-fixture", private: true }));
  await execFile("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { maxBuffer: 2_000_000 });
  await writeFile(authPath, JSON.stringify({ cookies: [{ name: "fidelity", value: "disposable-secret", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: true, sameSite: "Lax" }], origins: [{ origin: `https://127.0.0.1:${port}`, localStorage: [{ name: "role", value: "role-session" }] }] }));
  const tlsFiles = { key: await import("node:fs/promises").then(({ readFile }) => readFile(keyPath)), cert: await import("node:fs/promises").then(({ readFile }) => readFile(certPath)) };
  leakServer = createHttpsServer(tlsFiles, (_request, response) => {
    leakRequests += 1;
    response.writeHead(204).end();
  });
  leakServer.on("upgrade", (socket) => { leakUpgrades += 1; socket.destroy(); });
  await new Promise((resolve, reject) => { leakServer.once("error", reject); leakServer.listen(leakPort, "127.0.0.1", resolve); });
  server = createHttpsServer(tlsFiles, (request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: `https://127.0.0.1:${leakPort}/redirected` }).end();
      return;
    }
    if (request.url === "/sw.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end("self.addEventListener('fetch', () => undefined);");
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "referrer-policy": "no-referrer" });
    response.end(`<!doctype html><main>
      <h1>DM</h1>
      <p id="role-label">DM</p>
      <p id="selected-count">2</p>
      <button id="review" aria-label="Review Inspector team">Review assignment (2)</button>
      <button id="popup">Open external popup</button>
      <button id="confirm" aria-label="Confirm Inspector team" disabled>Assign Inspectors</button>
      <output id="confirmation" aria-label="Inspector assignment state">Ready</output>
      <p id="guard">pending</p>
      <script>
        localStorage.setItem('visible-role','DM');
        const guarded = [];
        fetch('https://127.0.0.1:${leakPort}/leak').then(() => guarded.push('leaked'), () => guarded.push('blocked'));
        new Promise((resolve) => {
          let settled = false;
          const socket = new WebSocket('wss://127.0.0.1:${leakPort}/ws');
          const finish = (value) => { if (settled) return; settled = true; guarded.push(value); resolve(); };
          socket.onopen = () => { finish('leaked'); socket.close(); };
          socket.onerror = () => finish('blocked');
          setTimeout(() => { finish('blocked'); try { socket.close(); } catch {} }, 500);
        });
        navigator.serviceWorker.register('/sw.js').catch(() => undefined);
        const guardPoll = setInterval(() => {
          if (guarded.length >= 2) { document.querySelector('#guard').textContent = guarded.join(':'); clearInterval(guardPoll); }
        }, 10);
        document.querySelector('#review').addEventListener('click', () => {
          history.pushState({}, '', '/lead-inspector');
          document.querySelector('#role-label').textContent = 'Lead Inspector';
          document.querySelector('#confirm').disabled = false;
          document.querySelector('#confirmation').textContent = ${fixed ? "'Healthy'" : "innerWidth < 500 ? 'Mobile bug' : 'Healthy'"};
        });
        document.querySelector('#popup').addEventListener('click', () => window.open('https://127.0.0.1:${leakPort}/popup', '_blank', 'noopener'));
      </script>
    </main>`);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const url = `https://127.0.0.1:${port}/`;
  manager = new SessionManager();
  let strictRejected = false;
  try { await manager.start({ projectRoot: root, url, executablePath: browserPath, headless: true }); } catch { strictRejected = true; }
  let redirectRejected = false;
  try {
    await manager.start({ projectRoot: root, url: `${url}redirect`, executablePath: browserPath, headless: true, tls: "allow-insecure-loopback" });
  } catch (error) {
    redirectRejected = error?.code === "NAVIGATION_ORIGIN_BLOCKED" || error?.code === "APPROVED_ORIGIN_BLOCKED";
  }
  const popupSession = await manager.start({ projectRoot: root, url, executablePath: browserPath, headless: true, tls: "allow-insecure-loopback" });
  let popupRejected = false;
  try { await manager.act(popupSession.id, { kind: "click", locator: { kind: "css", value: "#popup" } }); }
  catch (error) { popupRejected = error?.code === "NAVIGATION_ORIGIN_BLOCKED"; }
  await manager.close(popupSession.id, "delete");
  const session = await manager.start({ projectRoot: root, url, executablePath: browserPath, headless: true, tls: "allow-insecure-loopback", authFixture: { kind: "playwrightStorageState", path: authPath } });
  await manager.act(session.id, { kind: "wait", locator: { kind: "css", value: "#guard" }, property: "text", expected: "blocked:blocked", timeoutMs: 5_000 });
  const serviceWorkerCount = await manager.evaluate(session.id, "navigator.serviceWorker.getRegistrations().then((items) => items.length)", true);
  const evidence = await manager.capture(session.id, true);
  const emittedLocator = evidence.browser.accessibility?.suggestions.find((suggestion) => suggestion.uniqueAtCapture && suggestion.locator.kind === "role" && suggestion.locator.name === "Review Inspector team")?.locator;
  if (!emittedLocator) throw new Error(`Expected one live-validated computed-name locator suggestion: ${JSON.stringify(evidence.browser.accessibility?.suggestions ?? [])}`);
  await manager.act(session.id, { kind: "click", locator: emittedLocator });
  const emittedLocatorRoundTrip = new URL(manager.status(session.id).url).pathname === "/lead-inspector";
  await manager.act(session.id, { kind: "navigate", url });
  const scenario = await manager.recordScenario({
    sessionId: session.id,
    name: "Role handoff",
    url,
    actions: [{ kind: "click", locator: { kind: "role", role: "button", name: "Review Inspector team" } }],
    failureSignature: [{ kind: "locatorText", locator: { kind: "role", role: "status" }, text: "Mobile bug", match: "exact", expected: "pass" }],
    acceptanceChecks: [
      { kind: "route", path: "/lead-inspector" },
      { kind: "locatorText", locator: { kind: "css", value: "#role-label" }, text: "Lead Inspector", match: "exact" },
      { kind: "locatorText", locator: { kind: "css", value: "#selected-count" }, text: "2", match: "exact" },
      { kind: "locatorEnabled", locator: { kind: "role", role: "button", name: "Confirm Inspector team" }, enabled: true },
      { kind: "locatorText", locator: { kind: "role", role: "status" }, text: "Healthy", match: "exact" },
    ],
    checkpoints: [{
      name: "lead-inspector",
      offset: 1,
      route: "/lead-inspector",
      probes: [
        { name: "role", locator: { kind: "css", value: "#role-label" }, property: "text", expected: "Lead Inspector", match: "exact" },
        { name: "selected", locator: { kind: "css", value: "#selected-count" }, property: "text", expected: "2", match: "exact" },
        { name: "cta", locator: { kind: "role", role: "button", name: "Confirm Inspector team" }, property: "enabled", expected: true },
      ],
    }],
    viewports: [{ name: "desktop", width: 1_440, height: 900 }, { name: "mobile", width: 390, height: 844 }],
    failureViewports: ["mobile"],
    requestedLevel: "quick",
  });
  fixed = true;
  const verification = await manager.verifyScenario({ sessionId: session.id, scenarioId: scenario.id, buildReference: { source: "caller", value: "local-fidelity-fixed" } });
  const axNodes = evidence.browser.accessibility?.nodes ?? [];
  const computedName = axNodes.some((node) => node.role === "button" && node.name === "Review Inspector team");
  const implicitStatus = axNodes.some((node) => node.role === "status" && node.role !== "region");
  const originGuard = leakRequests === 0 && leakUpgrades === 0 && serviceWorkerCount.value === 0;
  const output = {
    passed: strictRejected && redirectRejected && session.authFixture === "seeded-disposable" && session.tls === "allow-insecure-loopback"
      && evidence.browser.screenshotPath === null && evidence.browser.accessibility !== null && computedName && implicitStatus
      && emittedLocatorRoundTrip && popupRejected && originGuard && scenario.baseline.status === "reproduced" && Boolean(scenario.baseline.evidence)
      && verification.outcome === "verified" && Boolean(verification.evidence.postFix),
    assertions: {
      strictRejected,
      redirectRejected,
      seededMode: session.authFixture === "seeded-disposable",
      tlsMode: session.tls === "allow-insecure-loopback",
      screenshotSuppressed: evidence.browser.screenshotPath === null,
      accessibility: Boolean(evidence.browser.accessibility),
      computedName,
      implicitStatus,
      emittedLocatorRoundTrip,
      popupRejected,
      originGuard,
      checkpoints: scenario.checkpoints.length === 1,
      matrixBaseline: scenario.baseline.status === "reproduced",
      matrixBaselineEvidence: Boolean(scenario.baseline.evidence),
      matrixVerification: verification.outcome === "verified",
      matrixVerificationEvidence: Boolean(verification.evidence.postFix),
    },
    warnings: evidence.browser.warnings,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  await manager.closeAll();
  if (!output.passed) process.exitCode = 1;
} finally {
  await manager?.closeAll().catch(() => undefined);
  server?.close();
  leakServer?.close();
  await rm(root, { recursive: true, force: true });
}
