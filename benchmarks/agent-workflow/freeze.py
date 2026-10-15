"""Freeze qualified inputs and their exact file hashes before model calls."""
from pathlib import Path
import datetime
import hashlib
import importlib.util
import json
import subprocess
import sys

ROOT = Path(sys.argv[1]).resolve()
LIB = Path(__file__).resolve().parent
REPO = LIB.parents[1]
destination = ROOT / "frozen-inputs.json"
if destination.exists():
    raise SystemExit("Frozen inputs already exist. Preserve them; do not overwrite an experiment.")
for summary in ("qualification-summary.json", "mcp-qualification-summary.json"):
    if not json.loads((ROOT / summary).read_text())["passed"]:
        raise SystemExit("Both independent and public MCP qualification must pass.")
spec = importlib.util.spec_from_file_location("trial_runner", LIB / "run.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
order = runner.jobs()
assert len(order) == 54
(ROOT / "job-order.json").write_text(json.dumps(order, indent=2) + "\n")

files = set()
for directory in (LIB, REPO / "src", REPO / "dist", REPO / "plugins/web-debug/skills", ROOT / "templates", ROOT / "reference", ROOT / "pristine"):
    files.update(path for path in directory.rglob("*") if path.is_file() and "__pycache__" not in path.parts)
baseline = ROOT.parent / "baseline-source"
for directory in (baseline / "dist", baseline / "plugins/web-debug/skills"):
    files.update(path for path in directory.rglob("*") if path.is_file())
for path in (ROOT / "upstream-manifest.json", ROOT / "adaptations.json", ROOT / "job-order.json", ROOT / "dependencies/package.json", ROOT / "dependencies/package-lock.json", REPO / "package.json", REPO / "package-lock.json", REPO / "bin/web-debug-mcp.mjs", baseline / "package.json", baseline / "bin/web-debug-mcp.mjs"):
    files.add(path)
records = [{"path": str(path), "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(files)]
manifest = {
    "schemaVersion": 1,
    "frozenAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "plannedConversations": 54,
    "models": ["gpt-6-astra", "gpt-6.1-sol"],
    "effort": "max",
    "repetitions": 3,
    "arms": ["native", "released", "candidate"],
    "nodeVersion": subprocess.check_output(["node", "--version"], text=True).strip(),
    "codexVersion": subprocess.check_output(["codex", "--version"], text=True).strip(),
    "candidateBaseCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip(),
    "candidateStatus": "unreleased working source; installed plugin and release pins unchanged",
    "sourceManifestSha256": hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest(),
    "files": records,
}
destination.write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({key: value for key, value in manifest.items() if key != "files"}, indent=2))
