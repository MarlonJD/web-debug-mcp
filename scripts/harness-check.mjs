import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function read(relativePath) {
  const path = join(root, relativePath);
  check(existsSync(path) && statSync(path).isFile(), `required file is missing: ${relativePath}`);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const packageText = read("package.json");
const packageJson = packageText ? JSON.parse(packageText) : {};
const requiredFiles = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "README.md",
  "docs/PLANS.md",
  "docs/index.md",
  "docs/SECURITY.md",
  "docs/RELIABILITY.md",
  "docs/agent-harness/config.json",
  "docs/agent-harness/registry.md",
  "docs/agent-harness/environment-contract.md",
  "docs/agent-harness/output-contract.md",
  "docs/agent-harness/verification-matrix.md",
  "docs/agent-harness/operating-loop.md",
  "docs/agent-harness/entropy-cleanup-checklist.md",
  "docs/exec-plans/index.md",
  "docs/exec-plans/active/web-debug-mcp-mvp.md",
  "docs/exec-plans/plan-template.md",
  "docs/exec-plans/tech-debt-tracker.md",
  "src/index.ts",
  "src/core/session-manager.ts",
  "src/core/redaction.ts",
  "src/adapters/chromium.ts",
  "fixtures/vanilla/index.html",
  "fixtures/vanilla/app.js",
  "fixtures/react-vite/package.json",
  "fixtures/react-vite/vite.config.ts",
  "fixtures/react-vite/index.html",
  "fixtures/react-vite/src/main.jsx",
  "fixtures/react-vite/src/App.jsx",
  "fixtures/next/package.json",
  "fixtures/next/next.config.mjs",
  "fixtures/next/app/layout.jsx",
  "fixtures/next/app/page.jsx",
  "fixtures/next/app/client-status.jsx",
  "fixtures/next/app/actions.js",
  "fixtures/next/app/api/health/route.js",
  "scripts/live-smoke.mjs",
  "scripts/live-react-vite-smoke.mjs",
  "scripts/serve-react-vite.mjs",
  "scripts/live-next-smoke.mjs",
  "scripts/live-safari-smoke.mjs",
  "scripts/serve-next.mjs",
  "src/adapters/next.ts",
  "src/adapters/safari.ts",
  "src/adapters/react-bridge.ts",
  "src/adapters/vite.ts",
  "src/adapters/vite-plugin.ts",
  "test/next-fixture-contract.test.ts",
  "test/next-adapter.test.ts",
  "test/chromium-policy.test.ts",
  "test/vite-adapter.test.ts",
];
for (const relativePath of requiredFiles) read(relativePath);

for (const scriptName of ["test", "typecheck", "build", "harness:check", "smoke:live", "smoke:react-vite", "smoke:next", "smoke:safari"]) {
  check(typeof packageJson.scripts?.[scriptName] === "string", `package.json is missing script: ${scriptName}`);
}
check(packageJson.name === "web-debug-mcp", "package.json name must remain web-debug-mcp");
check(packageJson.type === "module", "package.json must use ESM for the NodeNext build");

const sourceRoot = join(root, "src");
function inspectSource(path) {
  const entries = readdirSync(path, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) inspectSource(entryPath);
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      const source = readFileSync(entryPath, "utf8");
      check(!source.includes("console.log("), `stdout diagnostic found in source: ${entryPath.slice(root.length + 1)}`);
    }
  }
}
inspectSource(sourceRoot);

const mcpSource = read("src/index.ts");
const reactBridgeSource = read("src/adapters/react-bridge.ts");
const safariSource = read("src/adapters/safari.ts");
const sessionSource = read("src/core/session-manager.ts");
const vitePluginSource = read("src/adapters/vite-plugin.ts");
const nextSource = read("src/adapters/next.ts");
for (const toolName of [
  "web_project_detect",
  "web_session_start",
  "web_session_status",
  "web_browser_action",
  "web_issue_capture",
  "web_next_inspect",
  "web_replay_seek",
  "web_breakpoint_set",
  "web_debug_control",
  "web_debug_evaluate",
  "web_repro_record",
  "web_fix_verify",
  "web_session_close",
]) {
  check(mcpSource.includes(`\"${toolName}\"`), `public MCP tool is not registered: ${toolName}`);
}
check(reactBridgeSource.includes("flamegraph"), "React bridge must expose the bounded flamegraph view");
check(safariSource.includes("session.subscribe"), "Safari adapter must subscribe to WebDriver BiDi events");
check(safariSource.includes("profile isolation"), "Safari adapter must disclose visible-profile isolation limits");
check(sessionSource.includes("REPLAY_RESTORE_UNAVAILABLE"), "Replay restore must fail closed for unsafe frames");
check(vitePluginSource.includes("summarizeSourceMap"), "Vite plugin must preserve source-map provenance summaries");
check(nextSource.includes("serverActionExecutions"), "Next adapter must preserve Server Action execution evidence");
check(nextSource.includes("extractRequestTraces"), "Next adapter must preserve normalized server request traces");

const config = JSON.parse(read("docs/agent-harness/config.json"));
check(config.schema_version === 1, "harness config schema_version must be 1");
for (const [authority, relativePath] of Object.entries(config.authorities ?? {})) {
  check(typeof relativePath === "string" && existsSync(join(root, relativePath)), `harness authority ${authority} does not resolve: ${relativePath}`);
}

const managedDocs = ["AGENTS.md", "ARCHITECTURE.md", "README.md", "docs/SECURITY.md", "docs/RELIABILITY.md"];
for (const relativePath of managedDocs) {
  const content = read(relativePath);
  check(!content.includes("TODO(harness)"), `unresolved harness placeholder in ${relativePath}`);
  check(!content.includes("<replace"), `unresolved replacement marker in ${relativePath}`);
}

if (failures.length > 0) {
  process.stderr.write(`harness-check: FAIL (${failures.length} failure(s) across ${checks} checks)\n`);
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`harness-check: PASS (${checks} checks)\n`);
}
