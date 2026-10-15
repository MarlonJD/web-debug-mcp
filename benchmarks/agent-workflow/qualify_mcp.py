"""Qualify the actual public candidate transport on each pinned app."""
from pathlib import Path
import importlib.util
import json
import subprocess
import sys
import uuid

ROOT = Path(sys.argv[1]).resolve()
LIB = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("trial_runner", LIB / "run.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
database = json.loads((ROOT / "database-runtime.json").read_text())
qid = uuid.uuid4().hex[:8]
outputs = ROOT / "qualification" / ("mcp-" + qid)
outputs.mkdir(parents=True)
summary = []
for case in ("todo", "grid", "forms"):
    work = outputs / case
    runner.prepare_work(case, work)
    owned = {}
    server = None
    try:
        database_url = runner.database_for(database["container"], "mcp_" + qid + "_" + case, database["url"]) if case == "forms" else None
        port = runner.available_port()
        url = f"http://127.0.0.1:{port}"
        env = runner.environment(case, "candidate", port, database_url)
        with (work / "server.log").open("w") as server_log:
            server = subprocess.Popen(["node", "serve.mjs"], cwd=work, env=env, stdout=server_log, stderr=server_log, start_new_session=True)
            runner.ready(url, server, owned)
            output = outputs / (case + "-mcp.json")
            completed = runner.run_owned(["node", str(LIB / "mcp-qualify.mjs"), case, url, str(ROOT / "reference" / case), str(runner.REPO / "bin/web-debug-mcp.mjs"), str(output)], cwd=work, env=env, timeout=180)
            (outputs / (case + "-stdio.log")).write_bytes(completed.stdout + completed.stderr)
            if not output.exists() or not json.loads(output.read_text())["report"]["passed"]:
                raise RuntimeError("Pinned application public MCP qualification failed; inspect retained raw result.")
            row = {"case": case, "publicMcpQualified": True, "result": str(output.relative_to(ROOT))}
            summary.append(row)
            print(json.dumps(row), flush=True)
    finally:
        if server:
            runner.track([server.pid], owned)
        runner.stop(owned)
(ROOT / "mcp-qualification-summary.json").write_text(json.dumps({"passed": len(summary) == 3, "results": summary}, indent=2) + "\n")
