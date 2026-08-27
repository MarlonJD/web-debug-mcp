# Environment Contract

## Setup

Run `npm install --no-audit --no-fund` from the repository root. Node.js 20 or newer is required. The MCP server is a stdio process; do not write human diagnostics to stdout.

The optional Codex/ChatGPT plugin is installed from the repository marketplace. It points to the same local stdio MCP server through `plugins/web-debug/.mcp.json`; enabling the plugin does not create a hosted endpoint or a second browser controller. Until the package is published to npm, the first server start uses `npx` to resolve the GitHub package, so Node.js 20+, npm, and network access are required at first launch.

## Local runtime

The fixture servers bind only to `127.0.0.1`: vanilla uses `npm run serve:fixture`, React/Vite uses `npm run serve:react-vite` on port `4174`, and Next uses `npm run serve:next` on port `4175`. Live sessions require an explicit loopback URL plus either:

- `cdpEndpoint`, pointing at a browser the caller deliberately selected; or
- `WEB_DEBUG_CHROME_EXECUTABLE_PATH`, pointing at a Chromium executable used to create a fresh Playwright context.

Safari sessions use `browser: "safari"` with local `safaridriver` or an explicit loopback WebDriver endpoint. Safari runs visibly, can subscribe to WebDriver BiDi console/network events when the Node runtime exposes WebSocket support, and may disclose a bounded Performance Resource Timing fallback when the installed Safari does not emit network events. Safari JavaScript debugger parity is not part of this contract.

Launch mode is the preferred deterministic path. Attach mode is supported for interactive debugging but the session summary marks it `isolated: false` and evidence includes a warning.

## Lifecycle

1. Detect the project with `web_project_detect`.
2. Start one session with an explicit project root and URL.
3. Perform bounded actions and capture evidence.
4. Close the session when the workflow ends.

The manager caps active sessions at eight. Browser waits are capped at 30 seconds. Console and network history are bounded in memory. Replay retains up to 50 frames; `restore: true` can reissue only safe retained actions and fails closed for sanitised inputs. Screenshots are written under a temporary `web-debug-mcp-*` directory and the returned path is the evidence handle.

The comparison demo uses separate loopback ports `4183` through `4188`, launches a fresh headless Chromium context for each baseline and MCP run, copies repair fixtures under a temporary `web-debug-mcp-repair-*` directory, and writes its screenshots under a temporary `web-debug-mcp-demo-*` directory. It reports machine timings only; it does not claim a measured human diagnosis time. Explicit viewport requests are bounded to 320–3,840 pixels wide and 240–2,160 pixels high.

Next development output under `fixtures/next/.next/` is generated state and is ignored by Git. Next’s generated agent-rule files are disabled in the fixture with `agentRules: false` so the source tree remains deterministic.

## Reset and cleanup

Stop the fixture server with SIGINT or SIGTERM. Close MCP sessions with `web_session_close`; if the process is interrupted, its signal handler closes owned browser resources best effort. Do not delete broad temporary directories; remove only a session artifact directory after its evidence is no longer needed.

## Unsupported environments

Non-loopback targets and remote CDP/WebDriver endpoints require explicit opt-in and are marked non-isolated; no approved external remote target is currently available for live evidence. Production applications, credential-bearing browser profiles, and hosted MCP deployment are not part of this local contract.
