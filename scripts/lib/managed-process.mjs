const DEFAULT_READY_TIMEOUT_MS = 15_000;
const DEFAULT_STOP_TIMEOUT_MS = 2_000;
const MAX_DIAGNOSTIC_CHARS = 4_000;

export async function waitForHttpReady(targetUrl, child, options = {}) {
  const label = options.label ?? "fixture";
  const timeoutMs = options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const pollMs = options.pollMs ?? 150;
  const deadline = Date.now() + timeoutMs;
  let lastError = "not attempted";
  let spawnError = null;
  const onError = (error) => { spawnError = error; };
  child.once("error", onError);
  try {
    while (Date.now() < deadline) {
      if (spawnError) throw new Error(`${label} failed to start: ${boundedMessage(spawnError)}`);
      assertChildRunning(child, label);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(1_000, Math.max(1, deadline - Date.now())));
      try {
        const response = await fetch(targetUrl, { signal: controller.signal });
        if (response.ok) {
          await response.body?.cancel().catch(() => undefined);
          return;
        }
        lastError = `HTTP ${response.status}`;
        await response.body?.cancel().catch(() => undefined);
      } catch (error) {
        lastError = boundedMessage(error);
      } finally {
        clearTimeout(timer);
      }
      await delay(Math.min(pollMs, Math.max(1, deadline - Date.now())));
    }
  } finally {
    child.off("error", onError);
  }
  throw new Error(`${label} did not become ready within ${timeoutMs}ms: ${lastError}`);
}

export async function waitForOutputReady(child, pattern, options = {}) {
  const label = options.label ?? "fixture";
  const timeoutMs = options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  if (!child.stdout) throw new Error(`${label} has no piped stdout readiness channel.`);
  let output = "";
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.off("error", onError);
      child.off("exit", onExit);
      if (error) reject(error); else resolve();
    };
    const onData = (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-MAX_DIAGNOSTIC_CHARS);
      if (typeof pattern === "string" ? output.includes(pattern) : pattern.test(output)) finish();
    };
    const onError = (error) => finish(new Error(`${label} failed to start: ${boundedMessage(error)}`));
    const onExit = (code, signal) => finish(new Error(`${label} exited before readiness (${exitDescription(code, signal)}): ${output}`));
    const timer = setTimeout(() => finish(new Error(`${label} did not emit its readiness signal within ${timeoutMs}ms: ${output}`)), timeoutMs);
    child.stdout.on("data", onData);
    child.once("error", onError);
    child.once("exit", onExit);
    if (child.exitCode !== null || child.signalCode !== null) onExit(child.exitCode, child.signalCode);
  });
}

export async function stopOwnedProcess(child, options = {}) {
  const label = options.label ?? "fixture";
  const gracefulMs = options.gracefulMs ?? DEFAULT_STOP_TIMEOUT_MS;
  const forceMs = options.forceMs ?? DEFAULT_STOP_TIMEOUT_MS;
  const processGroup = options.processGroup === true && process.platform !== "win32" && Number.isInteger(child.pid) && child.pid > 0;
  if (processGroup) {
    if (!processGroupExists(child.pid)) return { forced: false, code: child.exitCode, signal: child.signalCode };
    signalProcessGroup(child.pid, "SIGTERM");
    if (await waitForProcessGroupExit(child.pid, gracefulMs)) return { forced: false, code: child.exitCode, signal: child.signalCode };
    signalProcessGroup(child.pid, "SIGKILL");
    if (!await waitForProcessGroupExit(child.pid, forceMs)) throw new Error(`${label} process group did not exit after bounded SIGKILL escalation.`);
    return { forced: true, code: child.exitCode, signal: child.signalCode ?? "SIGKILL" };
  }
  if (child.exitCode !== null || child.signalCode !== null) return { forced: false, code: child.exitCode, signal: child.signalCode };
  child.kill("SIGTERM");
  if (await waitForExit(child, gracefulMs)) return { forced: false, code: child.exitCode, signal: child.signalCode };
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  if (!await waitForExit(child, forceMs)) throw new Error(`${label} did not exit after bounded SIGKILL escalation.`);
  return { forced: true, code: child.exitCode, signal: child.signalCode };
}

function signalProcessGroup(processGroupId, signal) {
  try { process.kill(-processGroupId, signal); }
  catch (error) { if (error?.code !== "ESRCH") throw error; }
}

function processGroupExists(processGroupId) {
  try { process.kill(-processGroupId, 0); return true; }
  catch (error) { if (error?.code === "ESRCH") return false; throw error; }
}

async function waitForProcessGroupExit(processGroupId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processGroupExists(processGroupId)) return true;
    await delay(Math.min(25, Math.max(1, deadline - Date.now())));
  }
  return !processGroupExists(processGroupId);
}

function assertChildRunning(child, label) {
  if (child.exitCode !== null || child.signalCode !== null) throw new Error(`${label} exited before readiness (${exitDescription(child.exitCode, child.signalCode)}).`);
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(value);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedMessage(error) {
  return (error instanceof Error ? error.message : String(error)).slice(0, MAX_DIAGNOSTIC_CHARS);
}

function exitDescription(code, signal) {
  return signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
}
