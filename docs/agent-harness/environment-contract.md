# Environment Contract

## Setup

Run `npm install --no-audit --no-fund` from the repository root. Node.js 20 or newer is required. The MCP server is a stdio process; do not write human diagnostics to stdout.

After building, run `node bin/web-debug-mcp.mjs doctor` with the exact project/browser options to check readiness without launching a browser. Doctor stdout is one bounded JSON report.

The optional Codex/ChatGPT/Claude Code plugin is installed from the repository marketplace. Codex uses `.agents/plugins/marketplace.json`; Claude Code uses `.claude-plugin/marketplace.json`. Both point to the same local stdio MCP server through `plugins/web-debug/.mcp.json`, pinned to immutable public npm release `web-debug-mcp@0.7.0`; enabling the plugin does not create a hosted endpoint or a second browser controller. The first server start uses `npx` to resolve the npm package, so Node.js 20+, npm, and network access are required at first launch.

## Local runtime

The fixture servers bind only to `127.0.0.1`: vanilla uses `npm run serve:fixture`, React/Vite uses `npm run serve:react-vite` on port `4174`, Next uses `npm run serve:next` on port `4175`, Vue/Vite uses `npm run serve:vue-vite` on port `4176`, and Angular CLI uses `npm run serve:angular` on port `4177`. Live sessions require an explicit loopback URL plus either:

- `cdpEndpoint`, pointing at a browser the caller deliberately selected; or
- `WEB_DEBUG_CHROME_EXECUTABLE_PATH`, pointing at a Chromium executable used to create a fresh Playwright context.

Safari sessions use `browser: "safari"` with local `safaridriver` or an explicit loopback WebDriver endpoint. Safari runs visibly, can subscribe to WebDriver BiDi console/network events when the Node runtime exposes WebSocket support, and may disclose a bounded Performance Resource Timing fallback when the installed Safari does not emit network events. Safari JavaScript debugger parity is not part of this contract. Safari MCP is not retained here because local Safari 26.6.2 returns `unrecognized option '--mcp'`; the referenced compatible-host task is unreachable.

Launch mode is the preferred deterministic path. Attach mode is supported for interactive debugging but the session summary marks it `isolated: false` and evidence includes a warning.

Chromium actions, waits, and scenario checks use exact locators and fresh `probe` observations. The deterministic interaction set includes press, select, checked state, hover, and scroll-into-view. Every session fixes the top-level origin before navigation; ordinary cross-origin subresources remain available, while top-level redirects/actions and secondary pages are rejected. An explicit `tls: "allow-insecure-loopback"` or project-contained `authFixture` retains the stronger exact-origin request/WebSocket/service-worker guard. Auth-seeded sessions suppress screenshots. Opt-in Chrome WebMCP uses the page-provided `document.modelContext` only as untrusted `webmcp-page-api` provenance; capture can discover metadata but direct actions execute once, are non-replayable, and suppress later screenshots. Safari accepts CSS locators only, post-navigation quarantines origin/window escapes, and reports semantic locators, computed accessibility, TLS bypass, auth seeding, matrices, and WebMCP as unavailable.

## Lifecycle

1. Detect the project with `web_project_detect`.
2. Start one session with an explicit project root and URL.
3. Perform bounded actions and capture evidence.
4. Close the session when the workflow ends; choose `artifactPolicy: "delete"` only when the exact session artifacts are no longer needed.

The manager caps active sessions at eight, closed tombstones at 32, and scenarios at ten per session. Browser waits are capped at 30 seconds. Checks-only attempts retain only URL/DOM/console observations in their returned snapshot and do not return network, screenshot, React, Angular, Vue, or other framework bundles; verification can retain the adapter-owned network buffer only until the same attempt's authoritative capture, and the next attempt resets it. Replay retains up to eight frames, resets between verification attempts while keeping monotonic indices, tags attempt frames with `attemptId`, and fails closed for capture-only or sanitised-input restore. Verification uses quick (15s/1 attempt), standard (60s/3 attempts), or strict (120s/5 attempts) total-from-phase-start budgets, with a separate five-second cleanup ceiling and fixed-scale progress when requested. Screenshots are written under a temporary `web-debug-mcp-*` directory and capped at 4 MiB each plus four files/16 MiB per session; timed-out, oversized, and oldest files are deleted. If redaction collides with a generated path, the serialized handle is null and no copy is created.

`web_repro_record` runs the bounded pre-fix phase before committing a session-owned in-memory scenario. Its private executable URL may retain query values, but the returned scenario strips the query and never hashes it. `web_fix_verify` reuses only a matching live session, contract hash, stable environment projection, and attached target identity. Launch-owned Chromium is replaced for repeated attempts; attached Chromium and Safari reset only owned observers and disclose retained profile/storage/cache/service-worker state. Each result is limited to 256 KiB and keeps one representative full evidence bundle per phase plus lightweight attempt summaries. A full representative recapture is authoritative for a decisive pass; state drift or unavailable capture is inconclusive.

The comparison demo uses separate loopback ports `4183` through `4188`, launches a fresh headless Chromium context for each baseline and MCP run, copies repair fixtures under a temporary `web-debug-mcp-repair-*` directory, and writes its screenshots under a temporary `web-debug-mcp-demo-*` directory. It reports machine timings only; it does not claim a measured human diagnosis time. Explicit viewport requests are bounded to 320–3,840 pixels wide and 240–2,160 pixels high.

Next development output under `fixtures/next/.next/` is generated state and is ignored by Git. Next’s generated agent-rule files are disabled in the fixture with `agentRules: false` so the source tree remains deterministic.

## Reset and cleanup

Live smokes use a shared bounded readiness/teardown helper: every early exit is a failure, SIGTERM is awaited, and only the command-owned child may receive bounded SIGKILL escalation. Close MCP sessions with `web_session_close`; close destroys private memory before retaining one sanitized tombstone. `web-debug-mcp cleanup [--all-idle]` signals only locked, identity-verified registry records; unregistered processes are never cleanup targets. Default close retains non-empty screenshots for inspection and removes empty directories, while `artifactPolicy: "delete"` removes only that exact owned directory.

## Unsupported environments

Non-loopback targets and remote CDP/WebDriver endpoints require explicit opt-in and are marked non-isolated; no approved external remote target is currently available for live evidence. Production applications, credential-bearing browser profiles, and hosted MCP deployment are not part of this local contract.
