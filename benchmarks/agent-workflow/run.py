"""Fresh model trials with explicit tool arms; all outputs survive failures."""
from pathlib import Path
import concurrent.futures
import datetime
import hashlib
import json
import os
import random
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request

ROOT = Path(sys.argv[1]).resolve()
REPO = Path(__file__).resolve().parents[2]
LIB = Path(__file__).resolve().parent
DEPS = ROOT / "dependencies"
CHROME = str(Path.home() / "Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
LIMIT = 600
PRINT_LOCK = threading.Lock()
NEXT_SLOTS = threading.Semaphore(2)
CASES = {
    "todo": {"title": "TodoMVC JavaScript ES5", "symptom": "Clear completed removes the wrong tasks. Starting with three tasks, complete the first and third, then clear completed: only the second active task should remain. Adding, toggle-all and Active/Completed filtering must keep working.", "mutable": ["src/"]},
    "grid": {"title": "Vue composition grid", "symptom": "Sorting changes the selected header/arrow but leaves rows in the wrong order. Search for e, click Name once: three matching rows should be descending (Jet Li first); click again for ascending (Bruce Lee first). Clearing the filter, numeric Power sorting and mixed-case search must keep working.", "mutable": ["index.html"]},
    "forms": {"title": "Next forms with actual PostgreSQL", "symptom": "Add succeeds, but deleting the newly added task does not immediately update the list. After add there should be two list items; delete the new item and one existing item should remain without reloading. Reload should preserve the deletion, and further adds should work. Diagnose with the actual Server Action request and source linkage, not just a success label.", "mutable": ["app/"]},
}

def log(message):
    with PRINT_LOCK:
        print(datetime.datetime.now().isoformat(timespec="seconds"), message, flush=True)

def available_port():
    with socket.socket() as connection:
        connection.bind(("127.0.0.1", 0))
        return connection.getsockname()[1]

def process_table():
    result = {}
    for line in subprocess.check_output(["ps", "-axo", "pid=,ppid=,lstart="], text=True).splitlines():
        pieces = line.split()
        if len(pieces) >= 7:
            result[int(pieces[0])] = (int(pieces[1]), " ".join(pieces[2:7]))
    return result

def track(roots, identities):
    rows = process_table()
    wanted = set(roots)
    while True:
        descendants = {pid for pid, (parent, _) in rows.items() if parent in wanted} - wanted
        if not descendants:
            break
        wanted |= descendants
    for pid in wanted:
        if pid in rows:
            identities[pid] = rows[pid][1]

def stop(identities):
    for sig in (signal.SIGTERM, signal.SIGKILL):
        rows = process_table()
        for pid, started in reversed(list(identities.items())):
            if pid in rows and rows[pid][1] == started:
                try:
                    os.kill(pid, sig)
                except ProcessLookupError:
                    pass
        if sig == signal.SIGTERM:
            time.sleep(.4)

def run_owned(argv, cwd, env, timeout):
    identities = {}
    child = subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    deadline = time.monotonic() + timeout
    timed_out = False
    try:
        while True:
            track([child.pid], identities)
            try:
                stdout, stderr = child.communicate(timeout=.2)
                break
            except subprocess.TimeoutExpired:
                if time.monotonic() >= deadline:
                    timed_out = True
                    stop(identities)
                    stdout, stderr = child.communicate(timeout=5)
                    break
        return subprocess.CompletedProcess(argv, 124 if timed_out else child.returncode, stdout, stderr)
    finally:
        stop(identities)

def snapshot(work):
    result = {}
    for path in work.rglob("*"):
        if path.is_symlink() or not path.is_file() or any(part in {"node_modules", ".next", ".git", ".vite"} for part in path.relative_to(work).parts):
            continue
        if path.name == "server.log" or path.stat().st_size > 2_000_000:
            continue
        try:
            result[str(path.relative_to(work))] = path.read_text()
        except UnicodeDecodeError:
            pass
    return result

def prepare_work(case, work, reference=False):
    shutil.copytree(ROOT / ("reference" if reference else "templates") / case, work)
    (work / "node_modules").symlink_to(DEPS / "node_modules", target_is_directory=True)
    for filename in ("serve.mjs", "browser-evidence.mjs"):
        shutil.copyfile(LIB / filename, work / filename)
    (work / "AGENTS.md").write_text("# Bounded repair trial\nUse only this app, its explicitly supplied ordinary collector/dependencies, and the selected MCP binding/skill when present. Fix application source and add useful evidence/tests. No Git/branch operations, installs, delegation, external services, infrastructure changes, or parent/sibling/reference/oracle reads. The running server and database are owned by the harness. Close your browser sessions. Keep reports in English.\n")
    if case == "forms":
        (work / "private-input.txt").write_text("private-todo-" + hashlib.sha256(work.name.encode()).hexdigest()[:32] + "\n")

def environment(case, arm, port, database=None):
    env = {**os.environ, "PORT": str(port), "BENCH_CASE": case, "BENCH_CHROME": CHROME, "BENCH_DEPENDENCIES": str(DEPS), "BENCH_MODULE_ROOT": str(ROOT), "NEXT_TELEMETRY_DISABLED": "1", "BENCH_LOCAL_RESET": "1"}
    env.pop("BENCH_VITE_PLUGIN", None)
    if arm != "native":
        source = REPO if arm == "candidate" else ROOT.parent / "baseline-source"
        env["BENCH_VITE_PLUGIN"] = (source / "dist/adapters/vite-plugin.js").as_uri()
    if database:
        env["DATABASE_URL"] = database
    return env

def ready(url, server, owned, timeout=60):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        track([server.pid], owned)
        if server.poll() is not None:
            raise RuntimeError("Application exited before readiness.")
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(.2)
    raise RuntimeError("Application readiness timed out.")

def database_for(container, database, base_url):
    assert database.replace("_", "").isalnum()
    commands = [f"CREATE DATABASE {database}", "CREATE TABLE todos(id SERIAL PRIMARY KEY,text TEXT NOT NULL); INSERT INTO todos(text) VALUES ('Existing task');"]
    subprocess.run(["docker", "exec", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "bench", "-d", "bench", "-c", commands[0]], capture_output=True, check=True)
    subprocess.run(["docker", "exec", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "bench", "-d", database, "-c", commands[1]], capture_output=True, check=True)
    return base_url + "/" + database

def prompt(case, arm, work, url):
    details = CASES[case]
    body = f"""Repair this local browser symptom in {details['title']}. Work only inside {work}.
Symptom and acceptance: {details['symptom']}
The running local application is {url}. Chromium: {CHROME}. Dependencies are installed. Do not restart the server or edit its infrastructure/config/dependencies. You may fix application source ({', '.join(details['mutable'])}), add a useful regression check and retain bounded evidence. No Git/branch actions, installs, external services, delegation or everyday browser profiles. Parent/sibling paths, pristine sources, reference solutions, hidden seed data and graders are not authorized. The dependency link is authorized only for ordinary dependencies.

Reproduce the bug in a real isolated browser before editing. Diagnose using both runtime and source facts. Retain a reusable same-flow definition, baseline evidence and at least THREE complete post-fix attempts under the same acceptance checks. Native evidence files and actual MCP attempt/scenario identities count equally. Verify relevant regressions; a success label alone cannot prove the mutation/list ordering. Missing/unavailable observations are inconclusive, not passes. Keep pixels suppressed after private input. Do not echo filled input values in shareable evidence. For ordinary tooling, browser-evidence.mjs is a prebuilt reusable Playwright collector: node browser-evidence.mjs --url {url} --flow flow.json --out evidence/result.json. It accepts exact-locator actions/checks, repetitions1..5, optional completion checks, resetActions, framework=next and a relative logFile; it uses no Web Debug code. You may inspect or adapt your own evidence scripts, but don't weaken product acceptance. It does not contain a solution or case-specific checks.

Finish within10minutes. Close your sessions. Write report.json and return JSON with keys outcome (fixed|failed|inconclusive), rootCause (file and explanation), baseline (evidenceRefs and observations), verification (actualAttempts, evidenceRefs, observedChecks), regression (commands and outcomes), missingEvidence, supplementaryTools. Preserve truthful partial results if blocked. Use English. No report is proof unless observations actually occurred.
"""
    if case == "forms":
        body += f"\nThis uses a disposable real PostgreSQL database and Next16.3.3. GET {url}/api/bench-reset resets only this trial's todos to one Existing task; it is authorized test infrastructure. Reset before each complete attempt. For MCP recording, declare serverStateLeakage and a reset navigate action; readiness route is /. The browser flow is add one task then delete that new task. Keep the existing task. Use the selected development framework endpoint/manifest to link the observed Server Action to its source.\n"
        body += "Use private-input.txt as the new task text. It is synthetic private operator input: reading it for a fill is authorized, but mask it in tool outputs, terminal log reads, reports and saved shareable artifacts. Do not save screenshots containing it. With the ordinary collector, use fill.valueFile=private-input.txt rather than embedding the value in a shared flow definition. The operator file and raw tool input are outside the shareable-evidence audit; application/MCP/terminal output and newly saved evidence are inside it.\n"
    if arm == "native":
        body += "\nTool arm: ordinary Playwright/browser/framework evidence. Do not use Web Debug MCP, its skill, package, hook, adapters or internal APIs. Next's own local development endpoint is available as an ordinary framework surface through the supplied collector.\n"
    else:
        source = REPO if arm == "candidate" else ROOT.parent / "baseline-source"
        skill = source / "plugins/web-debug/skills/web-debug-workflow/SKILL.md"
        body += f"\nTool arm: {'unreleased candidate source' if arm == 'candidate' else 'released0.12.0'} Web Debug MCP. Use its callable tools for browser reproduction, recording and same-flow fix verification; establish web_project_detect first. Use the bundled workflow below, with its relative references authorized at {skill.parent}. Native checks remain available for a specific evidence gap; report supplementation. Do not bypass a missing binding through internal SDK/direct transports. A verified default may contain fewer than3attempts: inspect actual counts and satisfy the shared minimum.\n\n{skill.read_text()}"
    return body

def invocation(model, arm, work, run):
    argv = [shutil.which("codex"), "exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check", "-C", str(work), "-m", model, "--json", "-o", str(run / "final.txt")]
    config = ['model_reasoning_effort="max"', 'approval_policy="never"', 'sandbox_mode="danger-full-access"', 'features.plugins=false', 'features.apps=false', 'features.multi_agent=false', 'features.memories=false', 'features.skip_host_skill_discovery=true', 'web_search="disabled"']
    if arm != "native":
        source = REPO if arm == "candidate" else ROOT.parent / "baseline-source"
        config += ['mcp_servers.web_debug_mcp.command="node"', 'mcp_servers.web_debug_mcp.args=' + json.dumps([str(source / "bin/web-debug-mcp.mjs")]), 'mcp_servers.web_debug_mcp.startup_timeout_sec=30', 'mcp_servers.web_debug_mcp.tool_timeout_sec=150']
    for entry in config:
        argv += ["-c", entry]
    return argv + ["-"]

def collect_events(run):
    events = []
    for line in (run / "events.jsonl").read_text().splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    items = [event["item"] for event in events if event.get("type") == "item.completed"]
    mcp = [item for item in items if item.get("type") == "mcp_tool_call"]
    completed = [event for event in events if event.get("type") == "turn.completed"]
    rejected = [item for item in mcp if item.get("status") == "failed" or item.get("error") or ((item.get("result") or {}).get("structured_content") or {}).get("ok") is False or (item.get("result") or {}).get("isError") is True or (item.get("result") or {}).get("is_error") is True]
    return {"turnCompleted": bool(completed), "usage": completed[-1].get("usage") if completed else None, "shellCalls": sum(item.get("type") == "command_execution" for item in items), "mcpCalls": len(mcp), "allRejectedMcpCalls": len(rejected), "mcpResultBytes": sum(len(json.dumps(item.get("result"), ensure_ascii=False).encode()) for item in mcp), "terminalOutputBytes": sum(len(item.get("aggregated_output", "").encode()) for item in items if item.get("type") == "command_execution"), "errors": [event for event in events if event.get("type") in {"error", "turn.failed"}]}

def execute(job, container, db_base):
    case, repetition, model, arm = job
    model_label = "astra" if "astra" in model else "sol"
    name = f"{case}__r{repetition}__{model_label}__{arm}"
    run = ROOT / "runs" / name
    if (run / "result.json").exists():
        return json.loads((run / "result.json").read_text())
    if case == "forms":
        NEXT_SLOTS.acquire()
    run.mkdir(parents=True, exist_ok=True)
    work = ROOT / "work" / name
    work.parent.mkdir(exist_ok=True)
    prepare_work(case, work)
    server_owned, solver_owned = {}, {}
    handles = []
    result = {"runId": name, "case": case, "repetition": repetition, "model": model, "effort": "max", "arm": arm, "timeLimitSeconds": LIMIT, "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    server = solver = None
    try:
        database = database_for(container, "trial_" + hashlib.sha256(name.encode()).hexdigest()[:16], db_base) if case == "forms" else None
        port = available_port()
        url = f"http://127.0.0.1:{port}"
        env = environment(case, arm, port, database)
        output = (work / "server.log").open("w")
        handles.append(output)
        server = subprocess.Popen(["node", "serve.mjs"], cwd=work, env=env, stdout=output, stderr=output, start_new_session=True)
        ready(url, server, server_owned)
        before = snapshot(work)
        text = prompt(case, arm, work, url)
        (run / "prompt.txt").write_text(text)
        argv = invocation(model, arm, work, run)
        (run / "invocation.json").write_text(json.dumps({"argv": argv, "environment": {key: env[key] for key in ["PORT", "BENCH_CASE", "BENCH_CHROME", "BENCH_MODULE_ROOT"]}, "sourceSha256": hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()}, indent=2))
        events = (run / "events.jsonl").open("w")
        errors = (run / "stderr.log").open("w")
        handles += [events, errors]
        log("START " + name)
        started = time.monotonic()
        solver = subprocess.Popen(argv, cwd=work, env=env, stdin=subprocess.PIPE, stdout=events, stderr=errors, text=True, start_new_session=True)
        solver.stdin.write(text)
        solver.stdin.close()
        while solver.poll() is None and time.monotonic() - started < LIMIT:
            track([solver.pid], solver_owned)
            track([server.pid], server_owned)
            time.sleep(.5)
        result["solverSeconds"] = round(time.monotonic() - started, 3)
        result["timedOut"] = solver.poll() is None
        track([solver.pid], solver_owned)
        stop(solver_owned)
        solver.wait(timeout=10)
        for handle in handles:
            handle.flush()
        result["exitCode"] = solver.returncode
        result.update(collect_events(run))
        after = snapshot(work)
        changed = [path for path in before if before[path] != after.get(path)]
        result["changedFiles"] = changed
        result["protectedChanges"] = [path for path in changed if not any(path.startswith(prefix) for prefix in CASES[case]["mutable"]) or path == "app/api/bench-reset/route.ts"]
        if server.poll() is None:
            grader = run_owned(["node", str(LIB / "oracle.mjs"), case, url, str(run / "oracle.json")], cwd=work, env=env, timeout=100)
            (run / "oracle-stdout.log").write_text(grader.stdout.decode())
            (run / "oracle-stderr.log").write_text(grader.stderr.decode())
            result["oracleAvailable"] = (run / "oracle.json").exists()
            result["oraclePassed"] = json.loads((run / "oracle.json").read_text()).get("passed", False) if result["oracleAvailable"] else False
        for path, content in after.items():
            if path == "private-input.txt":
                continue
            target = run / "submitted" / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
        shutil.copyfile(work / "server.log", run / "server.log")
    except Exception as error:
        result["harnessError"] = repr(error)
        log("ERROR " + name + " " + repr(error))
    finally:
        if solver:
            track([solver.pid], solver_owned)
        if server:
            track([server.pid], server_owned)
        stop(solver_owned)
        stop(server_owned)
        for handle in handles:
            handle.close()
        result["finishedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        (run / "result.json").write_text(json.dumps(result, indent=2) + "\n")
        shutil.rmtree(work, ignore_errors=True)
        if case == "forms":
            NEXT_SLOTS.release()
        log("DONE " + name + " normal=" + str(result.get("turnCompleted")) + " oracle=" + str(result.get("oraclePassed")))
    return result

def jobs():
    # Each repetition rotates the arm order. Cases/models are deterministically
    # shuffled within a block; no result can influence selection or ordering.
    all_jobs = []
    randomizer = random.Random(20261014)
    arms = ["native", "released", "candidate"]
    for repetition in range(1, 4):
        groups = [(case, model) for case in CASES for model in ("gpt-6-astra", "gpt-6.1-sol")]
        randomizer.shuffle(groups)
        for case, model in groups:
            order = arms[repetition - 1:] + arms[:repetition - 1]
            all_jobs += [(case, repetition, model, arm) for arm in order]
    return all_jobs

if __name__ == "__main__":
    database = json.loads((ROOT / "database-runtime.json").read_text())
    planned = jobs()
    if not (ROOT / "frozen-inputs.json").exists():
        raise SystemExit("Freeze and qualify inputs before dispatching models.")
    frozen = json.loads((ROOT / "frozen-inputs.json").read_text())
    for record in frozen["files"]:
        if hashlib.sha256(Path(record["path"]).read_bytes()).hexdigest() != record["sha256"]:
            raise SystemExit("Frozen input changed; do not dispatch a mixed experiment: " + record["path"])
    if json.loads((ROOT / "job-order.json").read_text()) != [list(job) for job in planned]:
        raise SystemExit("Frozen ordering changed.")
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda job: execute(job, database["container"], database["url"]), planned))
    (ROOT / "all-results.json").write_text(json.dumps(results, indent=2) + "\n")
