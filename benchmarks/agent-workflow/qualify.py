"""Qualify seeded failures, reference repairs and the ordinary collector first."""
from pathlib import Path
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time
import uuid

ROOT = Path(sys.argv[1]).resolve()
LIB = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("trial_runner", LIB / "run.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

runtime_file = ROOT / "database-runtime.json"
if not runtime_file.exists():
    container = "web-debug-bench-" + uuid.uuid4().hex[:10]
    port = runner.available_port()
    image = "postgres@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777"
    subprocess.run(["docker", "run", "-d", "--rm", "--name", container, "--label", "web-debug-benchmark=agent-workflow", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", "POSTGRES_USER=bench", "-e", "POSTGRES_DB=bench", "-p", f"127.0.0.1:{port}:5432", image], capture_output=True, check=True)
    runtime_file.write_text(json.dumps({"container": container, "image": image, "url": f"postgres://bench@127.0.0.1:{port}"}, indent=2) + "\n")
database = json.loads(runtime_file.read_text())
for _ in range(60):
    if subprocess.run(["docker", "exec", database["container"], "pg_isready", "-U", "bench"], capture_output=True).returncode == 0:
        break
    time.sleep(.2)
else:
    raise SystemExit("Disposable PostgreSQL did not become ready.")

qualification_id = uuid.uuid4().hex[:8]
outputs = ROOT / "qualification" / qualification_id
outputs.mkdir(parents=True)
summary = []
for case in ("todo", "grid", "forms"):
    for reference in (False, True):
        label = f"{case}-{'reference' if reference else 'seed'}"
        work = outputs / label
        runner.prepare_work(case, work, reference)
        owned = {}
        server = None
        try:
            database_url = runner.database_for(database["container"], "qual_" + qualification_id + "_" + label.replace("-", "_"), database["url"]) if case == "forms" else None
            port = runner.available_port()
            url = f"http://127.0.0.1:{port}"
            env = runner.environment(case, "native", port, database_url)
            with (work / "server.log").open("w") as server_log:
                server = subprocess.Popen(["node", "serve.mjs"], cwd=work, env=env, stdout=server_log, stderr=server_log, start_new_session=True)
                runner.ready(url, server, owned)
                output = outputs / f"{label}-oracle.json"
                grader = runner.run_owned(["node", str(LIB / "oracle.mjs"), case, url, str(output)], cwd=work, env=env, timeout=100)
                (outputs / f"{label}-grader.log").write_bytes(grader.stdout + grader.stderr)
                if not output.exists():
                    raise RuntimeError("Independent oracle did not complete.")
                result = json.loads(output.read_text())
                if result["passed"] != reference:
                    raise RuntimeError("Seed/reference qualification did not match the controlled expectation.")
                primary = {"todo": "clearRemovesCompleted", "grid": "filteredDescending", "forms": "deleteImmediate"}[case]
                if not reference and not all(trial["checks"].get(primary) is False for trial in result["trials"]):
                    raise RuntimeError("The seeded defect must fail the primary product assertion in every trial.")
                row = {"case": case, "reference": reference, "oracle": str(output.relative_to(ROOT)), "passed": result["passed"], "actualAttempts": result["actualAttempts"]}
                if reference:
                    css = lambda value: {"kind": "css", "value": value}
                    if case == "todo":
                        actions = []
                        for value in ("Native Alpha", "Native Beta", "Native Gamma"):
                            actions += [{"kind": "fill", "locator": css(".new-todo"), "value": value}, {"kind": "press", "locator": css(".new-todo"), "key": "Enter"}]
                        actions += [{"kind": "check", "locator": css(".todo-list li:nth-child(1) .toggle"), "checked": True}, {"kind": "check", "locator": css(".todo-list li:nth-child(3) .toggle"), "checked": True}, {"kind": "click", "locator": css(".clear-completed")}]
                        checks = [{"kind": "locatorCount", "locator": css(".todo-list li"), "count": 1}, {"kind": "locatorCount", "locator": css(".todo-list li.completed"), "count": 0}]
                    elif case == "grid":
                        actions = [{"kind": "fill", "locator": css("input[name=query]"), "value": "e"}, {"kind": "click", "locator": css("th:first-child")}]
                        checks = [{"kind": "locatorCount", "locator": css("tbody tr"), "count": 3}, {"kind": "locatorText", "locator": css("tbody tr:first-child td:first-child"), "text": "Jet Li", "match": "exact"}]
                    else:
                        actions = [{"kind": "fill", "locator": css("#todo"), "valueFile": "private-input.txt"}, {"kind": "click", "locator": {"kind": "role", "role": "button", "name": "Add"}}, {"kind": "wait", "locator": css("main > ul > li"), "property": "count", "expected": 2}, {"kind": "click", "locator": css("main > ul > li:nth-child(2) button")}]
                        checks = [{"kind": "locatorCount", "locator": css("main > ul > li"), "count": 1}]
                    flow = {"actions": actions, "checks": checks, "repetitions": 3}
                    if case == "forms":
                        flow.update({"resetActions": [{"kind": "navigate", "url": url + "/api/bench-reset"}], "framework": "next", "logFile": "server.log", "completion": {"checks": [{"kind": "networkComplete", "path": "/", "method": "POST", "minimumCount": 2}], "timeoutMs": 5_000}})
                    flow_path = work / "native-flow.json"
                    flow_path.write_text(json.dumps(flow, indent=2))
                    collected = runner.run_owned(["node", "browser-evidence.mjs", "--url", url, "--flow", str(flow_path), "--out", str(work / "native-evidence.json")], cwd=work, env=env, timeout=100)
                    (outputs / f"{label}-collector.log").write_bytes(collected.stdout + collected.stderr)
                    evidence = json.loads((work / "native-evidence.json").read_text())
                    if evidence["outcome"] != "verified" or evidence["actualAttempts"] != 3:
                        raise RuntimeError("Reusable ordinary collector failed its positive control.")
                    row["ordinaryCollectorQualified"] = True
                summary.append(row)
                print(json.dumps(row), flush=True)
        finally:
            if server:
                runner.track([server.pid], owned)
            runner.stop(owned)

(outputs / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
(ROOT / "qualification-summary.json").write_text(json.dumps({"qualificationId": qualification_id, "passed": len(summary) == 6, "results": summary}, indent=2) + "\n")
