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
  "LICENSE",
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
  "docs/exec-plans/completed/web-debug-mcp-mvp.md",
  "docs/exec-plans/plan-template.md",
  "docs/exec-plans/tech-debt-tracker.md",
  "docs/demos/comparison.md",
  "docs/examples-evidence.md",
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  "plugins/web-debug/.codex-plugin/plugin.json",
  "plugins/web-debug/.claude-plugin/plugin.json",
  "plugins/web-debug/.mcp.json",
  "plugins/web-debug/skills/web-debug-workflow/SKILL.md",
  "src/index.ts",
  "bin/web-debug-mcp.mjs",
  "src/core/session-manager.ts",
  "src/core/auth-state.ts",
  "src/core/aggregation.ts",
  "src/core/process-registry.ts",
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
  "fixtures/complex-vite/package.json",
  "fixtures/complex-vite/vite.config.ts",
  "fixtures/complex-vite/index.html",
  "fixtures/complex-vite/src/main.jsx",
  "fixtures/complex-vite/src/App.jsx",
  "fixtures/complex-vite/src/quote-api.js",
  "fixtures/complex-vite/src/styles.css",
  "scripts/live-smoke.mjs",
  "scripts/live-react-vite-smoke.mjs",
  "scripts/serve-react-vite.mjs",
  "scripts/live-next-smoke.mjs",
  "scripts/live-safari-smoke.mjs",
  "scripts/live-local-fidelity-smoke.mjs",
  "scripts/demo-compare.mjs",
  "scripts/serve-complex-vite.mjs",
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
  "test/complex-fixture-contract.test.ts",
];
for (const relativePath of requiredFiles) read(relativePath);

for (const scriptName of ["test", "typecheck", "build", "harness:check", "smoke:live", "smoke:react-vite", "smoke:next", "smoke:safari", "smoke:local-fidelity", "demo:compare"]) {
  check(typeof packageJson.scripts?.[scriptName] === "string", `package.json is missing script: ${scriptName}`);
}
check(packageJson.name === "web-debug-mcp", "package.json name must remain web-debug-mcp");
check(packageJson.version === "0.3.3", "package.json must expose the 0.3.3 release version");
check(packageJson.type === "module", "package.json must use ESM for the NodeNext build");
check(packageJson.private !== true, "package.json must be installable as a published or GitHub package");
check(packageJson.license === "GPL-3.0-or-later", "package.json must declare GPL-3.0-or-later");
check(packageJson.bin?.["web-debug-mcp"] === "bin/web-debug-mcp.mjs", "package.json must expose an npm-compatible web-debug-mcp executable");
check(Array.isArray(packageJson.files) && packageJson.files.includes("dist") && packageJson.files.includes("LICENSE"), "package.json must include the built dist directory and license");
check(packageJson.scripts?.prepare === undefined, "published package must not require install-time scripts");
check(packageJson.scripts?.prepack === "npm run build", "package.json must build npm packages before packing");

const pluginManifestText = read("plugins/web-debug/.codex-plugin/plugin.json");
const pluginManifest = pluginManifestText ? JSON.parse(pluginManifestText) : {};
const pluginMcpText = read("plugins/web-debug/.mcp.json");
const pluginMcp = pluginMcpText ? JSON.parse(pluginMcpText) : {};
const pluginMarketplaceText = read(".agents/plugins/marketplace.json");
const pluginMarketplace = pluginMarketplaceText ? JSON.parse(pluginMarketplaceText) : {};
const claudeManifestText = read("plugins/web-debug/.claude-plugin/plugin.json");
const claudeManifest = claudeManifestText ? JSON.parse(claudeManifestText) : {};
const claudeMarketplaceText = read(".claude-plugin/marketplace.json");
const claudeMarketplace = claudeMarketplaceText ? JSON.parse(claudeMarketplaceText) : {};
const pluginSkill = read("plugins/web-debug/skills/web-debug-workflow/SKILL.md");
const bundledMcp = pluginMcp.mcpServers?.["web-debug-mcp"];
const marketplaceEntry = pluginMarketplace.plugins?.find((entry) => entry?.name === "web-debug");
const claudeMarketplaceEntry = claudeMarketplace.plugins?.find((entry) => entry?.name === "web-debug");
check(pluginManifest.name === "web-debug", "Codex plugin manifest name must remain web-debug");
check(pluginManifest.mcpServers === "./.mcp.json", "Codex plugin must point to its bundled MCP configuration");
check(pluginManifest.skills === "./skills/", "Codex plugin must expose its bundled skills directory");
check(Array.isArray(pluginManifest.interface?.defaultPrompt), "Codex plugin must expose starter prompts as an array");
check(bundledMcp?.command === "npx", "Codex plugin must launch the MCP package with npx");
check(Array.isArray(bundledMcp?.args) && bundledMcp.args.includes("web-debug-mcp@0.3.3"), "Codex plugin must resolve the immutable 0.3.3 npm package");
check(bundledMcp?.startup_timeout_sec === 20 && bundledMcp?.tool_timeout_sec === 150, "Codex plugin MCP timeouts must remain bounded for strict verification");
check(pluginManifest.version?.startsWith("0.3.3+codex."), "Codex plugin manifest must expose a timestamped 0.3.3 build");
check(marketplaceEntry?.version === "0.3.3", "Codex marketplace metadata must match the 0.3.3 plugin release");
check(marketplaceEntry?.source?.path === "./plugins/web-debug", "Plugin marketplace must point to the web-debug package");
check(marketplaceEntry?.policy?.installation === "AVAILABLE" && marketplaceEntry?.policy?.authentication === "ON_INSTALL", "Plugin marketplace policy must allow explicit installation");
check(marketplaceEntry?.category === "Developer Tools", "Plugin marketplace category must match the plugin metadata");
check(claudeManifest.name === "web-debug" && claudeManifest.version === "0.3.3", "Claude Code plugin manifest must expose the web-debug identity and version");
check(claudeManifest.displayName === "Web Debug", "Claude Code plugin manifest must expose the Web Debug display name");
check(claudeMarketplace.name === "web-debug", "Claude Code marketplace must use the web-debug identity");
check(claudeMarketplaceEntry?.source === "./plugins/web-debug", "Claude Code marketplace must point to the web-debug package");
check(claudeMarketplaceEntry?.version === "0.3.3" && claudeMarketplaceEntry?.category === "Developer Tools", "Claude Code marketplace metadata must match the plugin release");
check(pluginSkill.includes("web_project_detect") && pluginSkill.includes("web_issue_capture") && pluginSkill.includes("web_session_close"), "Plugin skill must document the core web-debug workflow");
check(pluginSkill.includes("@Web Debug") && pluginSkill.includes("build-web-apps") && pluginSkill.includes("Vitest") && pluginSkill.includes("Go") && pluginSkill.includes("Do not claim Web Debug evidence"), "Plugin skill must define Web Debug/native-runner routing boundaries");

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
const chromiumSource = read("src/adapters/chromium.ts");
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
check(sessionSource.includes("failureChecks.length > 0 && failureChecks.every"), "Post-fix verification must require the complete polarity-aware failure signature to be absent");
check(sessionSource.includes("owned adapter was made unusable before lease release"), "Cancelled adapter work must poison the session before releasing its lease");
check(sessionSource.includes("resetReplayForAttempt") && sessionSource.includes("attemptId: context.attemptId ?? null"), "Verification replay must reset per attempt and retain attempt provenance");
check(mcpSource.includes("locatorSchema") && mcpSource.includes("checkpoints") && mcpSource.includes("failureViewports"), "MCP schemas must expose the exact locator/checkpoint/matrix contract");
check(mcpSource.includes('{ name: "web-debug-mcp", version: "0.3.3" }'), "MCP server metadata must expose the 0.3.3 release version");
check(chromiumSource.includes("async probe") && chromiumSource.includes("ignoreHTTPSErrors") && chromiumSource.includes("routeWebSocket"), "Chromium adapter must expose live probes and guarded elevated context controls");
check(safariSource.includes("LOCATOR_STRATEGY_UNAVAILABLE") && safariSource.includes("acceptInsecureCerts: false"), "Safari adapter must retain CSS-only semantic limits and strict TLS")
check(sessionSource.includes("MAX_DECISIVE_OBSERVATIONS") && sessionSource.includes("runMatrixAttempt"), "Session manager must enforce aggregate observations and ephemeral matrix candidates");
check(read("src/core/auth-state.ts").includes("fstat") || read("src/core/auth-state.ts").includes("handle.stat"), "Auth fixture validation must re-stat one open descriptor");
check(read("src/core/process-registry.ts").includes("REGISTRY_RECORD_CAP") && read("src/core/process-registry.ts").includes("identityMatches"), "Process cleanup must be registry and identity backed");
check(!sessionSource.includes("Object.defineProperty"), "Verification output must not use a compatibility alias hack");
check(!sessionSource.includes("copyToSafeArtifactPath") && !sessionSource.includes("copyFileSync"), "Redaction must not copy screenshots outside the owning session artifact directory");
check(mcpSource.includes("deadline: now + MCP_OPERATION_BUDGET_MS"), "MCP handlers must propagate an absolute bounded deadline");
check(chromiumSource.includes("options.checksOnly") && chromiumSource.includes("optional enrichment timed out"), "Chromium checks-only and optional-enrichment budgets must be explicit");
check(vitePluginSource.includes("summarizeSourceMap"), "Vite plugin must preserve source-map provenance summaries");
check(nextSource.includes("serverActionExecutions"), "Next adapter must preserve Server Action execution evidence");
check(nextSource.includes("extractRequestTraces"), "Next adapter must preserve normalized server request traces");
check(read("README.md").includes("codex mcp add"), "README must document Codex MCP installation");
check(read("README.md").includes("claude mcp add"), "README must document Claude Code MCP installation");
check(read("README.md").includes("optional Web Debug plugin"), "README must document the optional Web Debug plugin");
check(read("README.md").includes("Installing Web Debug installs both"), "README must explain that plugin installation includes the MCP connection");
check(read("README.md").includes("web-debug-mcp@0.3.3") && !read("README.md").includes("#main"), "README MCP runtime must use the immutable 0.3.3 npm version");
check(read("README.md").includes("no separate MCP setup is required"), "README must explain that separate MCP setup is unnecessary");
check(read("README.md").includes("Install in Claude Code"), "README must document Claude Code plugin installation");
check(read("README.md").includes("/plugin marketplace add MarlonJD/web-debug-mcp"), "README must document the Claude Code marketplace command");
check(read("README.md").includes("/plugin install web-debug@web-debug"), "README must document the Claude Code plugin install command");
check(read("README.md").includes("claude --plugin-dir ./plugins/web-debug"), "README must document local Claude Code plugin testing");
check(read("README.md").includes("GPL-3.0-or-later"), "README must declare the project license");
const demoDocs = read("docs/demos/comparison.md");
check(demoDocs.includes("complex-logic-fix"), "comparison demo docs must describe the complex logic repair");
check(demoDocs.includes("complex-async-fix"), "comparison demo docs must describe the async repair");
check(demoDocs.includes("visual-layout-fix"), "comparison demo docs must describe the visual repair");

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
