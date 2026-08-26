# web-debug-mcp

`web-debug-mcp` is a local, agent-native web debugging server for Codex and other MCP clients. It exposes one small tool surface that coordinates a browser session, JavaScript debugger, bounded runtime evidence, and reproducible flow verification.

The first increment supports framework-neutral browser targets. React, Vite, and Next.js are detected as capabilities but their semantic adapters are intentionally not included yet. This keeps the first implementation useful for vanilla HTML/JS and prevents framework-specific tools from leaking into every session.

## What is included

- Project capability detection without starting a process.
- Local Chromium attach mode through an explicit CDP endpoint.
- Local Chromium launch mode through an explicit executable path.
- Same-origin browser actions: navigate, click, fill, wait, and reload.
- JavaScript breakpoints, pause control, bounded call frames, and read-only evaluation by default.
- Console, network metadata, DOM summary, screenshot, and debugger evidence in one redacted bundle.
- Reproducible action scenarios with simple post-fix checks.
- A deterministic vanilla fixture and a project-native harness check.

## Requirements

- Node.js 20 or newer.
- A Chromium-based browser when running a live session.
- Either an explicit `WEB_DEBUG_CHROME_EXECUTABLE_PATH` or an explicit `cdpEndpoint` supplied to `web_session_start`.

## Development commands

```text
npm install --no-audit --no-fund
npm test
npm run typecheck
npm run build
npm run harness:check
npm run smoke:live
```

Run the fixture with `npm run serve:fixture`. The server binds to `127.0.0.1` and defaults to port `4173`; set `WEB_DEBUG_FIXTURE_PORT` to use another port.

Run `npm run smoke:live` after setting `WEB_DEBUG_CHROME_EXECUTABLE_PATH` when the default macOS Chrome path is not available. It starts the fixture, sets a breakpoint in `app.js`, clicks the button, captures a pause-safe evidence path, and cleans up the owned browser and fixture processes.

Run the MCP server with `npm run dev` during development or `node dist/index.js` after `npm run build`. MCP protocol messages use stdout; diagnostics must stay on stderr.

## MCP workflow

1. Call `web_project_detect` with the project root.
2. Call `web_session_start` with a loopback URL and an explicit browser connection or executable.
3. Use `web_browser_action` and `web_breakpoint_set` to reproduce the issue.
4. Call `web_issue_capture` for one bounded evidence bundle.
5. Store a flow with `web_repro_record` and run it later with `web_fix_verify`.
6. Call `web_session_close` when the session is no longer needed.

The server does not write into the project during a normal session. Screenshots are stored in a temporary per-session artifact directory and returned as paths.

## Safety defaults

- Browser URLs are loopback-only unless `allowRemote` is explicitly enabled.
- Browser navigation stays on the session origin.
- External CDP attachment is marked as non-isolated.
- Console, network, debugger locals, and evaluated values are redacted and bounded.
- Raw response bodies, cookies, authorization values, and browser storage are not collected by the core adapter.
- Evaluation rejects side effects unless `allowSideEffects` is explicitly true.

## Current boundary

This repository is a local developer tool, not a hosted service. It has no production deployment, CI workflow, remote browser control, Safari adapter, React DevTools adapter, Vite source-map adapter, Next.js server adapter, or time-travel replay implementation yet. Those are tracked as future work only after the core evidence contract is stable.
