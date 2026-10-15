"""Materialize pinned upstream examples outside the implementation checkout.

No model receives pristine sources or seed patches. Infrastructure adaptations
and the hidden oracle are separate from each solver's disposable application.
"""
from pathlib import Path
import hashlib
import json
import sys
import urllib.request

ROOT = Path(sys.argv[1]).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
SOURCES = [
    {"id": "todo", "repo": "tastejs/todomvc", "commit": "ff43b02e59dfa604386bb382034b2cd07c2bcd8a", "base": "examples/javascript-es5", "license": "license.md", "files": ["index.html", "package.json", "README.md", "scripts/build.js"] + [f"src/{name}.js" for name in ["app", "controller", "helpers", "model", "store", "template", "view"]]},
    {"id": "grid", "repo": "vuejs/core", "commit": "bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c", "base": "packages/vue/examples/composition", "license": "LICENSE", "files": ["grid.html"]},
    {"id": "forms", "repo": "vercel/next.js", "commit": "93cec91d580b94ab54306a1d28120a47a030eec7", "base": "examples/next-forms", "license": "license.md", "files": ["README.md", "package.json", "tsconfig.json", "app/actions.ts", "app/add-form.tsx", "app/delete-form.tsx", "app/global.css", "app/layout.tsx", "app/page.tsx"]},
]

manifest = []
for source in SOURCES:
    target = ROOT / "pristine" / source["id"]
    records = []
    for local, upstream in [(file, f"{source['base']}/{file}") for file in source["files"]] + [("UPSTREAM_LICENSE", source["license"])]:
        url = f"https://raw.githubusercontent.com/{source['repo']}/{source['commit']}/{upstream}"
        path = target / local
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            with urllib.request.urlopen(url, timeout=30) as response:
                path.write_bytes(response.read(2_000_000))
        records.append({"path": local, "upstream": upstream, "url": url, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    manifest.append({**source, "files": records})
(ROOT / "upstream-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"prepared": [source["id"] for source in SOURCES], "manifest": str(ROOT / "upstream-manifest.json")}))
