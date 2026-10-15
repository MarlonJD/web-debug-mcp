"""Create equal infrastructure and withheld seeds; run before protocol freeze."""
from pathlib import Path
import json
import shutil
import sys

ROOT = Path(sys.argv[1]).resolve()

for name in ("todo", "grid", "forms"):
    target = ROOT / "templates" / name
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(ROOT / "pristine" / name, target)
    if name == "grid":
        original = (target / "grid.html").read_text()
        # Published development Vue replaces the repository's absent local build.
        (target / "index.html").write_text(original.replace('../../dist/vue.global.js', '/node_modules/vue/dist/vue.global.js'))
        (target / "grid.html").unlink()
        (target / "package.json").write_text(json.dumps({"private": True, "dependencies": {"vue": "3.5.42", "vite": "7.3.6"}}, indent=2))
        (target / "vite.config.mjs").write_text("import {defineConfig} from 'vite';\nexport default defineConfig({server:{host:'127.0.0.1',strictPort:true,fs:{allow:[process.cwd(),process.env.BENCH_DEPENDENCIES]}}});\n")
    if name == "forms":
        package = json.loads((target / "package.json").read_text())
        package["dependencies"].update({"next": "16.3.3", "react": "19.2.8", "react-dom": "19.2.8", "postgres": "3.4.7", "zod": "4.4.3", "typescript": "5.9.2", "@types/node": "24.3.0", "@types/react": "19.2.18", "@types/react-dom": "19.2.5"})
        (target / "package.json").write_text(json.dumps(package, indent=2))
        for sql_file in (target / "app/actions.ts", target / "app/page.tsx"):
            sql_file.write_text(sql_file.read_text().replace('ssl: "allow"', 'ssl: false'))
        (target / "next.config.mjs").write_text("export default {experimental:{requestInsights:true},turbopack:{root:process.env.BENCH_MODULE_ROOT}};\n")
        reset = target / "app" / "api" / "bench-reset" / "route.ts"
        reset.parent.mkdir(parents=True, exist_ok=True)
        reset.write_text('''import postgres from "postgres";
export const dynamic = "force-dynamic";
export async function GET() {
  if (process.env.BENCH_LOCAL_RESET !== "1") return new Response("disabled", {status:404});
  const sql = postgres(process.env.DATABASE_URL!, {ssl:false});
  try {
    await sql`TRUNCATE todos RESTART IDENTITY`;
    await sql`INSERT INTO todos(text) VALUES ('Existing task')`;
    return Response.json({ready:true});
  } finally {await sql.end();}
}
''')
    reference = ROOT / "reference" / name
    if reference.exists():
        shutil.rmtree(reference)
    shutil.copytree(target, reference)
    # No seed comments, solution files or alternate revisions enter solver trees.
    if name == "todo":
        path = target / "src" / "controller.js"
        text = path.read_text()
        old = 'Controller.prototype.removeCompletedItems = function () {\n        var self = this;\n        self.model.read({ completed: true }'
        assert text.count(old) == 1
        path.write_text(text.replace(old, old.replace('completed: true', 'completed: false')))
    elif name == "grid":
        path = target / "index.html"
        text = path.read_text()
        assert text.count('const { sortKey } = state') == 1
        path.write_text(text.replace('const { sortKey } = state', 'const { sortKey } = props'))
    else:
        path = target / "app" / "actions.ts"
        text = path.read_text()
        split = text.index('export async function deleteTodo')
        assert text[split:].count('    revalidatePath("/");') == 1
        path.write_text(text[:split] + text[split:].replace('    revalidatePath("/");\n', ''))

(ROOT / "adaptations.json").write_text(json.dumps({
    "todo": ["Serve the upstream source tree directly; install the two upstream CSS/common packages in the shared pinned dependency pool."],
    "grid": ["Rename grid.html to index.html and serve its development Vue global build from the pinned local dependency pool.", "Add a local Vite development config; Web Debug's Vite plugin is selected by arm outside application source."],
    "forms": ["Pin Next/React/Postgres/Zod/types rather than upstream canary/rc/ranges.", "Run actual Postgres in one disposable loopback-only container with a separate database per trial; set ssl=false only for this non-TLS disposable local service.", "Enable Next requestInsights and provide a test-only observable reset route for repeated isolated flows."],
    "scope": "These are small maintained upstream example applications, not large production repositories. Seeds are controlled, not independently discovered upstream defects.",
}, indent=2) + "\n")
print(json.dumps({"templates": ["todo", "grid", "forms"], "referenceOnlyOutsideSolverTrees": True}))
