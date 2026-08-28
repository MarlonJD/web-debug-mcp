# Environment Contract

## Setup

Run `npm install --no-audit --no-fund` from the repository root. Node.js 20 or newer is required. The MCP server is a stdio process; do not write human diagnostics to stdout.

The optional Codex/ChatGPT/Claude Code plugin is installed from the repository marketplace. Codex uses `.agents/plugins/marketplace.json`; Claude Code uses `.claude-plugin/marketplace.json`. Both point to the same local stdio MCP server through `plugins/web-debug/.mcp.json`, pinned to immutable public npm release `web-debug-mcp@0.3.1`; enabling the plugin does not create a hosted endpoint or a second browser controller. The first server start uses `npx` to resolve the npm package, so Node.js 20+, npm, and network access are required at first launch.

## Local runtime

The fixture servers bind only to `127.0.0.1`: vanilla uses `npm run serve:fixture`, React/Vite uses `npm run serve:react-vite` on port `4174`, and Next uses `npm run serve:next` on port `4175`. Live sessions require an explicit loopback URL plus either:

- `cdpEndpoint`, pointing at a browser the caller deliberately selected; or
- `WEB_DEBUG_CHROME_EXECUTABLE_PATH`, pointing at a Chromium executable used to create a fresh Playwright context.

Safari sessions use `browser: "safari"` with local `safaridriver` or an explicit loopback WebDriver endpoint. Safari runs visibly, can subscribe to WebDriver BiDi console/network events when the Node runtime exposes WebSocket support, and may disclose a bounded Performance Resource Timing fallback when the installed Safari does not emit network events. Safari JavaScript debugger parity is not part of this contract.

Launch mode is the preferred deterministic path. Attach mode is supported for interactive debugging but the session summary marks it `isolated: false` and evidence includes a warning.

Chromium actions, waits, and scenario checks use exact locators and fresh `probe` observations. An explicit `tls: "allow-insecure-loopback"` or project-contained `authFixture` derives one approved loopback origin before context/page creation and blocks other HTTP(S), redirects, popups, WebSockets, and service workers. Auth-seeded sessions suppress screenshots. Named checkpoints use completed-action offsets, and declared viewport matrices run sequential ephemeral candidates without changing canonical session state. Safari accepts CSS locators only and reports semantic locators, computed accessibility, TLS bypass, auth seeding, and matrices as unavailable.

## Lifecycle

1. Detect the project with `web_project_detect`.
2. Start one session with an explicit project root and URL.
3. Perform bounded actions and capture evidence.
4. Close the session when the workflow ends.

The manager caps active sessions at eight and scenarios at ten per session. Browser waits are capped at 30 seconds. Checks-only attempts retain only URL/DOM/console observations in their returned snapshot and do not return network, screenshot, React, or other framework bundles; verification can retain the adapter-owned network buffer only until the same attempt's authoritative capture, and the next attempt resets it. Replay retains up to eight frames, resets between verification attempts while keeping monotonic indices, tags attempt frames with `attemptId`, and fails closed for capture-only or sanitised-input restore. Verification uses quick (15s/1 attempt), standard (60s/3 attempts), or strict (120s/5 attempts) total-from-phase-start budgets, with a separate five-second cleanup ceiling. Screenshots are written under a temporary `web-debug-mcp-*` directory; if redaction collides with a generated path, the serialized handle is null and no copy is created.

`web_repro_record` runs the bounded pre-fix phase before committing a session-owned in-memory scenario. Its private executable URL may retain query values, but the returned scenario strips the query and never hashes it. `web_fix_verify` reuses only a matching live session, contract hash, stable environment projection, and attached target identity. Launch-owned Chromium is replaced for repeated attempts; attached Chromium and Safari reset only owned observers and disclose retained profile/storage/cache/service-worker state. Each result is limited to 256 KiB and keeps one representative full evidence bundle per phase plus lightweight attempt summaries. A full representative recapture is authoritative for a decisive pass; state drift or unavailable capture is inconclusive.

The comparison demo uses separate loopback ports `4183` through `4188`, launches a fresh headless Chromium context for each baseline and MCP run, copies repair fixtures under a temporary `web-debug-mcp-repair-*` directory, and writes its screenshots under a temporary `web-debug-mcp-demo-*` directory. It reports machine timings only; it does not claim a measured human diagnosis time. Explicit viewport requests are bounded to 320–3,840 pixels wide and 240–2,160 pixels high.

Next development output under `fixtures/next/.next/` is generated state and is ignored by Git. Next’s generated agent-rule files are disabled in the fixture with `agentRules: false` so the source tree remains deterministic.

## Reset and cleanup

Stop the fixture server with SIGINT or SIGTERM. Close MCP sessions with `web_session_close`; if the process receives SIGINT/SIGTERM, stdin EOF/close, transport close, or an idle TTL, one idempotent shutdown path closes owned browser resources best effort, purges in-memory scenarios/evidence, and removes its exact owner-only registry record. `web-debug-mcp cleanup [--all-idle]` signals only locked, identity-verified registry records; unregistered legacy processes are never cleanup targets. Temporary screenshot handles may remain for inspection under the operating system's `web-debug-mcp-*` paths. Do not delete broad temporary directories; remove only a session artifact directory after its evidence is no longer needed.

## Unsupported environments

Non-loopback targets and remote CDP/WebDriver endpoints require explicit opt-in and are marked non-isolated; no approved external remote target is currently available for live evidence. Production applications, credential-bearing browser profiles, and hosted MCP deployment are not part of this local contract.
