import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

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
  "docs/agent-harness/certification.json",
  "docs/agent-harness/certification.md",
  "docs/agent-harness/coverage-matrix.md",
  "docs/exec-plans/index.md",
  "docs/exec-plans/completed/web-debug-mcp-mvp.md",
  "docs/exec-plans/plan-template.md",
  "docs/exec-plans/tech-debt-tracker.md",
  "docs/demos/comparison.md",
  "docs/demos/agent-evaluation.md",
  "docs/releases/0.4.0.md",
  "docs/COMPATIBILITY.md",
  "docs/compatibility-evidence.json",
  "docs/examples-evidence.md",
  "docs/design-docs/scenario-persistence-boundary.md",
  "docs/product-specs/web-debug-contract.md",
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
  "src/core/http.ts",
  "src/core/origin-policy.ts",
  "src/core/version.ts",
  "src/core/artifact-store.ts",
  "src/core/mcp-response.ts",
  "src/core/doctor.ts",
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
  "scripts/agent-eval.mjs",
  "scripts/lib/managed-process.mjs",
  "scripts/lib/managed-process.d.mts",
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
  "test/http.test.ts",
  "test/mcp-response.test.ts",
  "test/mcp-artifact.test.ts",
  "test/mcp-routing.test.ts",
  "test/redirect-policy.test.ts",
  "test/doctor.test.ts",
  "test/release-identity.test.ts",
  "test/managed-process.test.ts",
  "test/eval-contract.test.ts",
  "test/compatibility.test.ts",
  "tsconfig.test.json",
];
for (const relativePath of requiredFiles) read(relativePath);
const execPlanIndex = read("docs/exec-plans/index.md");
const registeredPlans = [...execPlanIndex.matchAll(/\]\(((?:active|completed)\/[^)]+\.md)\)/g)].map((match) => match[1]);
check(registeredPlans.length > 0, "ExecPlan registry must link at least one active or completed plan");
for (const registeredPlan of new Set(registeredPlans)) read(`docs/exec-plans/${registeredPlan}`);

for (const scriptName of ["test", "typecheck", "build", "harness:check", "smoke:live", "smoke:react-vite", "smoke:next", "smoke:safari", "smoke:local-fidelity", "demo:compare", "eval:catalog", "eval:grade"]) {
  check(typeof packageJson.scripts?.[scriptName] === "string", `package.json is missing script: ${scriptName}`);
}
check(packageJson.name === "web-debug-mcp", "package.json name must remain web-debug-mcp");
const sourceVersion = packageJson.version;
const releasedPluginVersion = packageJson.webDebug?.releasedPluginRuntimeVersion;
check(typeof sourceVersion === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(sourceVersion), "package.json must expose a semantic source version");
check(packageJson.webDebug?.releaseStatus === "released" && /^\d+\.\d+\.\d+$/.test(releasedPluginVersion ?? "") && releasedPluginVersion === sourceVersion, "released metadata must align source and plugin runtime versions");
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
check(Array.isArray(bundledMcp?.args) && bundledMcp.args.includes(`web-debug-mcp@${releasedPluginVersion}`), "Codex plugin must resolve the immutable released runtime named by package metadata");
check(bundledMcp?.startup_timeout_sec === 20 && bundledMcp?.tool_timeout_sec === 150, "Codex plugin MCP timeouts must remain bounded for strict verification");
check(pluginManifest.version?.startsWith(`${releasedPluginVersion}+codex.`), "Codex plugin manifest must expose a timestamped build for the released runtime");
check(marketplaceEntry?.version === releasedPluginVersion, "Codex marketplace metadata must match the released plugin runtime");
check(marketplaceEntry?.source?.path === "./plugins/web-debug", "Plugin marketplace must point to the web-debug package");
check(marketplaceEntry?.policy?.installation === "AVAILABLE" && marketplaceEntry?.policy?.authentication === "ON_INSTALL", "Plugin marketplace policy must allow explicit installation");
check(marketplaceEntry?.category === "Developer Tools", "Plugin marketplace category must match the plugin metadata");
check(claudeManifest.name === "web-debug" && claudeManifest.version === releasedPluginVersion, "Claude Code plugin manifest must expose the web-debug identity and released runtime version");
check(claudeManifest.displayName === "Web Debug", "Claude Code plugin manifest must expose the Web Debug display name");
check(claudeMarketplace.name === "web-debug", "Claude Code marketplace must use the web-debug identity");
check(claudeMarketplaceEntry?.source === "./plugins/web-debug", "Claude Code marketplace must point to the web-debug package");
check(claudeMarketplaceEntry?.version === releasedPluginVersion && claudeMarketplaceEntry?.category === "Developer Tools", "Claude Code marketplace metadata must match the released plugin runtime");
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
check(mcpSource.includes("PACKAGE_NAME") && mcpSource.includes("PACKAGE_VERSION"), "MCP server metadata must derive from package metadata");
check(read("src/core/process-registry.ts").includes("PACKAGE_VERSION") && !read("src/core/process-registry.ts").includes('version: "0.3.1"'), "Process records and cleanup reports must derive from package metadata");
check(mcpSource.includes("WEB_DEBUG_TOOL_ANNOTATIONS") && mcpSource.includes("web_issue_capture: { readOnlyHint: false"), "MCP tool effects must use the canonical annotation table");
check(mcpSource.includes("outputSchema: toolOutputSchema") && mcpSource.includes("runWithProgress") && mcpSource.includes("ResourceTemplate"), "MCP tools must expose structured output, progress, and screenshot resources");
check(read("bin/web-debug-mcp.mjs").includes('args[0] === "doctor"'), "Package binary must expose the bounded doctor command");
check(read("scripts/live-smoke.mjs").includes("stopOwnedProcess") && read("scripts/live-next-smoke.mjs").includes("waitForHttpReady"), "Live smokes must use bounded readiness and awaited teardown helpers");
check(read("docs/COMPATIBILITY.md").includes("Verified locally") && read("docs/demos/agent-evaluation.md").includes("npm run eval:catalog") && read("docs/demos/agent-evaluation.md").includes("npm run eval:grade"), "Compatibility and agent task-evaluation contracts must remain discoverable");
check(chromiumSource.includes("async probe") && chromiumSource.includes("ignoreHTTPSErrors") && chromiumSource.includes("routeWebSocket"), "Chromium adapter must expose live probes and guarded elevated context controls");
check(safariSource.includes("LOCATOR_STRATEGY_UNAVAILABLE") && safariSource.includes("acceptInsecureCerts: false"), "Safari adapter must retain CSS-only semantic limits and strict TLS")
check(sessionSource.includes("MAX_DECISIVE_OBSERVATIONS") && sessionSource.includes("runMatrixAttempt"), "Session manager must enforce aggregate observations and ephemeral matrix candidates");
check(read("src/core/auth-state.ts").includes("fstat") || read("src/core/auth-state.ts").includes("handle.stat"), "Auth fixture validation must re-stat one open descriptor");
check(read("src/core/process-registry.ts").includes("REGISTRY_RECORD_CAP") && read("src/core/process-registry.ts").includes("identityMatches"), "Process cleanup must be registry and identity backed");
check(!sessionSource.includes("Object.defineProperty"), "Verification output must not use a compatibility alias hack");
check(!sessionSource.includes("terminationReason") && !mcpSource.includes("size: viewportSchema") && !mcpSource.includes("name: z.string().min(1).max(40), viewport: viewportSchema"), "Public contracts must not retain legacy aliases or alternate viewport shapes");
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
check(read("README.md").includes(`web-debug-mcp@${releasedPluginVersion}`) && read("README.md").includes(sourceVersion) && !read("README.md").includes("0.4.0-next.0") && !read("README.md").includes("#main"), "README must document the immutable final release runtime");
check(read("README.md").includes("no separate MCP setup is required"), "README must explain that separate MCP setup is unnecessary");
check(read("README.md").includes("Install in Claude Code"), "README must document Claude Code plugin installation");
check(read("README.md").includes("/plugin marketplace add MarlonJD/web-debug-mcp"), "README must document the Claude Code marketplace command");
check(read("README.md").includes("/plugin install web-debug@web-debug"), "README must document the Claude Code plugin install command");
check(read("README.md").includes("claude --plugin-dir ./plugins/web-debug"), "README must document local Claude Code plugin testing");
check(read("README.md").includes("GPL-3.0-or-later"), "README must declare the project license");
check(read("README.md").includes("does not export or import YAML/JSON scenario files"), "README must keep portable YAML/JSON scenarios out of scope");
const scenarioPersistenceBoundary = read("docs/design-docs/scenario-persistence-boundary.md");
check(scenarioPersistenceBoundary.includes('persistence: "in-memory"') && scenarioPersistenceBoundary.includes("repository's native test suite"), "Scenario persistence boundary must keep scenarios session-only and durable tests repository-native");
const demoDocs = read("docs/demos/comparison.md");
check(demoDocs.includes("complex-logic-fix"), "comparison demo docs must describe the complex logic repair");
check(demoDocs.includes("complex-async-fix"), "comparison demo docs must describe the async repair");
check(demoDocs.includes("visual-layout-fix"), "comparison demo docs must describe the visual repair");

const config = JSON.parse(read("docs/agent-harness/config.json"));
check(config.schema_version === 1, "harness config schema_version must be 1");
for (const [authority, relativePath] of Object.entries(config.authorities ?? {})) {
  check(typeof relativePath === "string" && existsSync(join(root, relativePath)), `harness authority ${authority} does not resolve: ${relativePath}`);
}

const certificationText = read("docs/agent-harness/certification.json");
const coverageText = read("docs/agent-harness/coverage-matrix.md");
let certification = {};
try { certification = JSON.parse(certificationText); } catch { check(false, "certification manifest must be valid JSON"); }
const coverageSha256 = createHash("sha256").update(coverageText).digest("hex");
check(certification.schema_version === 2 && certification.claim === "harness-ready", "historical certification manifest must retain the v2 harness-ready shape");
check(typeof certification.repository_commit === "string" && /^[0-9a-f]{40}$/.test(certification.repository_commit), "certification source commit must be a full Git SHA");
check(typeof certification.coverage_sha256 === "string" && /^[0-9a-f]{64}$/.test(certification.coverage_sha256), "certification coverage hash must be a SHA-256 value");
let sourceExists = false;
let directChild = false;
let workingTreeClean = false;
try {
  execFileSync("git", ["cat-file", "-e", `${certification.repository_commit}^{commit}`], { cwd: root, stdio: "ignore" });
  sourceExists = true;
  const headParent = execFileSync("git", ["rev-parse", "HEAD^"], { cwd: root, encoding: "utf8" }).trim();
  directChild = headParent === certification.repository_commit;
  workingTreeClean = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root, encoding: "utf8" }).trim().length === 0;
} catch { /* structural checks below report the stale state */ }
check(sourceExists, "certification source commit must exist in local Git history");
const evidenceLinks = [...coverageText.matchAll(/\(evidence\/([^)]+\.json)\)/g)].map((match) => match[1]);
check(evidenceLinks.length >= 31 && new Set(evidenceLinks).size === evidenceLinks.length, "coverage matrix must link each canonical evidence row exactly once");
for (const evidenceName of evidenceLinks) {
  const evidenceText = read(`docs/agent-harness/evidence/${evidenceName}`);
  let evidence = {};
  try { evidence = JSON.parse(evidenceText); } catch { check(false, `evidence must be valid JSON: ${evidenceName}`); }
  check(evidence.schema_version === 2, `evidence must use schema v2: ${evidenceName}`);
  check(evidence.repository_commit === certification.repository_commit, `evidence source commit must match certification: ${evidenceName}`);
  check(Array.isArray(evidence.capabilities) && evidence.capabilities.length > 0, `evidence must name at least one capability: ${evidenceName}`);
  check(evidence.result === "passed" || evidence.result === "not-applicable", `evidence result must be passed or not-applicable: ${evidenceName}`);
  check(typeof evidence.signature === "string" && /^[0-9a-f]{64}$/.test(evidence.signature), `evidence signature must be structurally valid: ${evidenceName}`);
}
const expiresAt = Date.parse(certification.expires_at ?? "");
const certificationStructurallyFresh = sourceExists
  && directChild
  && workingTreeClean
  && certification.coverage_sha256 === coverageSha256
  && Number.isFinite(expiresAt)
  && expiresAt > Date.now();
const certificationStatus = certificationStructurallyFresh ? "fresh-structure-candidate" : "stale-candidate";
if (!certificationStructurallyFresh) {
  check(read("README.md").includes("historical certification window") && read("README.md").includes("does not claim a current `CERT000`"), "README must disclose a stale historical certification window");
  check(read("docs/agent-harness/certification.md").includes("historical certification window is stale"), "Certification procedure must disclose current staleness");
  check(read("docs/exec-plans/tech-debt-tracker.md").includes("DEBT-003") && read("docs/exec-plans/tech-debt-tracker.md").includes("fresh attestation"), "Stale certification must remain explicit technical debt until refreshed");
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
  process.stdout.write(`harness-check: PASS (${checks} checks; certification: ${certificationStatus})\n`);
}
