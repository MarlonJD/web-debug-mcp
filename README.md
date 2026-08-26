# web-debug-mcp

`web-debug-mcp` is a local, agent-native web debugging server for Codex and other MCP clients. It exposes one small tool surface that coordinates a browser session, JavaScript debugger, bounded runtime evidence, and reproducible flow verification.

The current increment supports framework-neutral browser targets, Chromium/CDP, Safari WebDriver with WebDriver BiDi evidence, an automatically injected React development bridge, a Vite module-graph/HMR endpoint, and Next.js development-server metadata with bounded server-log, route-compilation, Server Action lookup, and observed request execution evidence. Browser-specific limits remain explicit. This keeps framework-specific context behind the same MCP facade instead of adding separate tool catalogs.

## What is included

- Project capability detection without starting a process.
- Local Chromium attach mode through an explicit CDP endpoint.
- Explicit remote CDP attach is supported only with `allowRemote: true`; targets are marked non-isolated and never auto-discovered.
- Local Chromium launch mode through an explicit executable path.
- Safari WebDriver mode through local `safaridriver` or an explicit WebDriver endpoint, with BiDi console events and network events when the installed Safari exposes them.
- Same-origin browser actions: navigate, click, fill, wait, and reload.
- JavaScript breakpoints, pause control, bounded call frames, and read-only evaluation by default.
- Console, network metadata, DOM summary, screenshot, and debugger evidence in one redacted bundle.
- React component tree, hook values, source locations, render counts, bounded commit summaries, profiler durations, a flat flamegraph view, and inferred render causes when the development build exposes React commits.
- Vite module/importer graph, HMR status, transformed-code diffs, and source-map summaries through the `webDebugVitePlugin()` development plugin.
- Bounded, redacted Next.js development log tails when the log stays inside the detected project root.
- Explicit Next.js route compilation and Server Action lookup through `web_next_inspect`, plus request-linked execution evidence when the browser sends a `Next-Action` request.
- Bounded replay timeline in captures and frame lookup through `web_replay_seek`; `restore: true` replays only safe retained actions and rejects sanitised form inputs.
- Reproducible action scenarios with simple post-fix checks.
- A deterministic vanilla fixture and a project-native harness check.
- A live React/Vite fixture, automatic React bridge, and module-graph/HMR smoke.
- A live Next.js App Router fixture and `/_next/mcp` runtime smoke.

## Requirements

- Node.js 20 or newer. Safari BiDi requires Node 20.10+ with `--experimental-websocket` or Node 21+; older runtimes keep Safari WebDriver actions and the documented network fallback but report BiDi console limitations.
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
npm run smoke:safari
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

Run `npm run smoke:safari` to exercise the vanilla fixture through Safari WebDriver. Enable Safari Settings → Developer → Allow remote automation first; Safari runs visibly, captures BiDi console evidence, and reports whether network evidence came from BiDi or the bounded Performance Resource Timing fallback. Safari’s JavaScript debugger remains unavailable through this adapter.

Safari 27 and Safari Technology Preview 247 include Apple’s official Safari MCP server. Use that official server when its browser-native DOM, network, console, and screenshot tools are the desired surface; this repository does not add a duplicate public Safari MCP catalog. The WebDriver adapter remains useful as the suite’s single-facade compatibility path for older Safari versions and for shared session/evidence orchestration.

Run the MCP server with `npm run dev` during development or `node dist/index.js` after `npm run build`. MCP protocol messages use stdout; diagnostics must stay on stderr.

## MCP workflow

1. Call `web_project_detect` with the project root.
2. Call `web_session_start` with a loopback URL and an explicit browser connection or executable.
3. Use `web_browser_action` and `web_breakpoint_set` to reproduce the issue.
4. Call `web_issue_capture` for one bounded evidence bundle.
5. For Next.js, call `web_next_inspect` to compile a route or resolve a Server Action ID.
6. Store a flow with `web_repro_record` and run it later with `web_fix_verify`.
7. Use `web_replay_seek` to inspect one retained captured frame; pass `restore: true` only when the frame contains safe, non-sensitive actions.
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

This repository is a local developer tool, not a hosted service. It has no production deployment, CI workflow, unauthenticated/auto-discovered remote browser control, or full React DevTools profiler/flamegraph parity. React durations and render-cause details are bounded and inferred from the DevTools hook; Vite provenance and source maps are summaries rather than a full source-map debugger; Next execution evidence is limited to request-linked Server Action metadata, request insights, and bounded logs; Safari debugger parity is unavailable and Safari 26 may require the Performance Resource Timing network fallback; replay restoration is limited to safe retained actions and is not application-state time travel. Explicit remote CDP attachment, Safari WebDriver actions/DOM/screenshots, explicit capability warnings, and bounded replay restore are available. An approved external remote host and caller-supplied harness certification evidence are still required for those respective claims.
