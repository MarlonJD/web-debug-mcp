# Environment Contract

## Setup

Run `npm install --no-audit --no-fund` from the repository root. Node.js 20 or newer is required. The MCP server is a stdio process; do not write human diagnostics to stdout.

## Local runtime

The fixture server binds only to `127.0.0.1` and is started with `npm run serve:fixture`. Live sessions require an explicit loopback URL plus either:

- `cdpEndpoint`, pointing at a browser the caller deliberately selected; or
- `WEB_DEBUG_CHROME_EXECUTABLE_PATH`, pointing at a Chromium executable used to create a fresh Playwright context.

Launch mode is the preferred deterministic path. Attach mode is supported for interactive debugging but the session summary marks it `isolated: false` and evidence includes a warning.

## Lifecycle

1. Detect the project with `web_project_detect`.
2. Start one session with an explicit project root and URL.
3. Perform bounded actions and capture evidence.
4. Close the session when the workflow ends.

The manager caps active sessions at eight. Browser waits are capped at 30 seconds. Console and network history are bounded in memory. Screenshots are written under a temporary `web-debug-mcp-*` directory and the returned path is the evidence handle.

## Reset and cleanup

Stop the fixture server with SIGINT or SIGTERM. Close MCP sessions with `web_session_close`; if the process is interrupted, its signal handler closes owned browser resources best effort. Do not delete broad temporary directories; remove only a session artifact directory after its evidence is no longer needed.

## Unsupported environments

Remote browsers, non-loopback targets, Safari/WebKit, production applications, credential-bearing browser profiles, and hosted MCP deployment are not part of this contract.
