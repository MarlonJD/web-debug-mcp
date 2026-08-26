# web-debug-mcp

`web-debug-mcp` is a local, agent-native web debugging server for Codex and other MCP clients. It exposes one small tool surface that coordinates a browser session, JavaScript debugger, bounded runtime evidence, and reproducible flow verification.

The first increment supports framework-neutral browser targets, Chromium/CDP, Safari WebDriver actions, an automatically injected React development bridge, a Vite module-graph/HMR endpoint, and Next.js development-server metadata with bounded server-log, route-compilation, and Server Action inspection. CDP-only debugger/console depth remains explicit per browser. This keeps framework-specific context behind the same MCP facade instead of adding separate tool catalogs.

## What is included

- Project capability detection without starting a process.
- Local Chromium attach mode through an explicit CDP endpoint.
- Local Chromium launch mode through an explicit executable path.
- Safari WebDriver mode through local `safaridriver` or an explicit WebDriver endpoint.
- Same-origin browser actions: navigate, click, fill, wait, and reload.
- JavaScript breakpoints, pause control, bounded call frames, and read-only evaluation by default.
- Console, network metadata, DOM summary, screenshot, and debugger evidence in one redacted bundle.
- React component tree, hook values, source locations, render counts, bounded commit summaries, and inferred render causes when the development build exposes React commits.
- Vite module/importer graph, HMR status, and bounded transform diffs through the `webDebugVitePlugin()` development plugin.
- Bounded, redacted Next.js development log tails when the log stays inside the detected project root.
- Explicit Next.js route compilation and Server Action lookup through `web_next_inspect`.
- Bounded replay timeline in captures and frame lookup through `web_replay_seek`; seek returns captured state without rewinding the live browser.
- Reproducible action scenarios with simple post-fix checks.
- A deterministic vanilla fixture and a project-native harness check.
- A live React/Vite fixture, automatic React bridge, and module-graph/HMR smoke.
- A live Next.js App Router fixture and `/_next/mcp` runtime smoke.

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
npm run smoke:react-vite
npm run smoke:next
```

Run the fixture with `npm run serve:fixture`. The server binds to `127.0.0.1` and defaults to port `4173`; set `WEB_DEBUG_FIXTURE_PORT` to use another port.

Run `npm run smoke:live` after setting `WEB_DEBUG_CHROME_EXECUTABLE_PATH` when the default macOS Chrome path is not available. It starts the vanilla fixture, sets a breakpoint in `app.js`, clicks the button, captures a pause-safe evidence path, and cleans up the owned browser and fixture processes.

Run `npm run smoke:react-vite` to start the Vite fixture, verify React component/state evidence, pause at `fixtures/react-vite/src/App.jsx`, and replay the submitted-payment flow.

For a Vite application, add the development-only plugin to `vite.config.ts`:

```ts
import { webDebugVitePlugin } from "web-debug-mcp/vite";

export default {
  plugins: [webDebugVitePlugin()],
};
```

The plugin serves the local read-only module graph endpoint used during a debug session. It should not be enabled in a production server.

Run `npm run smoke:next` to start the Next.js App Router fixture, query its built-in `/_next/mcp` endpoint, verify routes/project/compilation metadata and a bounded server-log tail, and exercise the client route handler flow.

Run `npm run smoke:safari` to exercise the vanilla fixture through Safari WebDriver. Enable Safari Settings → Developer → Allow remote automation first; Safari runs visibly and reports CDP-only debugger/console/network gaps as warnings.

Run the MCP server with `npm run dev` during development or `node dist/index.js` after `npm run build`. MCP protocol messages use stdout; diagnostics must stay on stderr.

## MCP workflow

1. Call `web_project_detect` with the project root.
2. Call `web_session_start` with a loopback URL and an explicit browser connection or executable.
3. Use `web_browser_action` and `web_breakpoint_set` to reproduce the issue.
4. Call `web_issue_capture` for one bounded evidence bundle.
5. For Next.js, call `web_next_inspect` to compile a route or resolve a Server Action ID.
6. Store a flow with `web_repro_record` and run it later with `web_fix_verify`.
7. Use `web_replay_seek` to inspect one retained captured frame.
8. Call `web_session_close` when the session is no longer needed.

The server does not write into the project during a normal session. Screenshots are stored in a temporary per-session artifact directory and returned as paths.

## Safety defaults

- Browser URLs are loopback-only unless `allowRemote` is explicitly enabled.
- Browser navigation stays on the session origin.
- External CDP attachment is marked as non-isolated.
- Console, network, debugger locals, and evaluated values are redacted and bounded.
- Raw response bodies, cookies, authorization values, and browser storage are not collected by the core adapter.
- Evaluation rejects side effects unless `allowSideEffects` is explicitly true.

## Current boundary

This repository is a local developer tool, not a hosted service. It has no production deployment, CI workflow, remote browser control, full React DevTools profiler/flamegraph or precise render-cause attribution, complete Vite transform provenance/source maps, Next.js server execution/trace adapter, Safari CDP-equivalent debugger/console/network support, or state-restoring time-travel replay. Safari WebDriver actions, DOM, screenshots, explicit unsupported-capability warnings, and captured-frame replay seek are available.
