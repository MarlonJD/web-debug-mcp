<!-- harness-plan:v1
id: web-debug-mcp-mvp
status: active
created: 2026-08-26
updated: 2026-08-26
completed:
owner: Platform Engineering
-->

# Build the first web-debug-mcp vertical slice

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). This plan records the first implementation on the supplied empty GitHub repository.

## Purpose / Big Picture

Create a standalone TypeScript MCP server that gives Codex one bounded local web-debugging workflow: detect a project, attach to or launch an explicitly selected browser target, capture runtime/debugger evidence, inspect framework runtime state, record a reproducible flow, and verify that flow after a code change. The current increment works for framework-neutral HTML/JS, an automatically injected React bridge with bounded commit profiling, Vite module-graph/HMR metadata, and Next.js development-server metadata with bounded server-log, route-compilation, and Server Action inspection while keeping deeper transform, Safari, replay, and remote-target paths behind explicit adapters.

## Progress

- [x] (2026-08-26 15:30Z) Clone the supplied repository into `monorepos/web-debug-mcp` and confirm it is empty.
- [x] (2026-08-26 15:35Z) Run the adaptive Harness Engineering audit and review the standard scaffold preview.
- [x] (2026-08-26 15:45Z) Add the TypeScript/MCP project manifest and source boundary.
- [x] (2026-08-26 15:55Z) Implement capability detection, session ownership, Chromium/CDP adapter, redaction, evidence, and scenario verification.
- [x] (2026-08-26 15:58Z) Add the deterministic vanilla fixture and fake-adapter contract tests.
- [x] (2026-08-26 16:02Z) Run the native harness check and live Chromium breakpoint smoke after documentation and scripts are complete.
- [x] (2026-08-26 16:06Z) Run the final validation set and inspect the worktree for whitespace or process-cleanup failures.
- [x] (2026-08-26 16:07Z) Exercise the built `dist/index.js` through an MCP stdio client and confirm all 11 tools are discoverable.
- [x] (2026-08-26 16:09Z) Create the first Conventional Commit `5fbdf90` with message `feat: bootstrap web debug mcp`.
- [x] (2026-08-26 16:09Z) Push the first commit to `origin/main` and confirm the remote resolves to `5fbdf904a04eb8add0a18bb111adfa8653590822`.
- [x] (2026-08-26 18:50Z) Add a React runtime bridge and Vite fixture without expanding the public MCP catalog.
- [x] (2026-08-26 18:50Z) Verify component/state evidence and scenario verification against the live React/Vite fixture.
- [x] (2026-08-26 18:55Z) Re-run deterministic tests, type/build checks, harness checks, vanilla smoke, and React/Vite smoke after correcting commit-based render counts.
- [x] (2026-08-26 18:56Z) Complete the final validation set with both live smoke commands passing and no owned process remaining.
- [x] (2026-08-26 18:57Z) Commit and push the React/Vite milestone as `bdf83d0` on `origin/main`.
- [x] (2026-08-26 19:10Z) Add the Next.js `/_next/mcp` SSE adapter, App Router fixture, and bounded text-wait action.
- [x] (2026-08-26 19:10Z) Verify Next project metadata, routes, compilation issues, route-handler state, and console health against Next 16.3.3.
- [x] (2026-08-26 19:15Z) Run the full validation set with vanilla, React/Vite, and Next live smokes passing and no owned process remaining.
- [x] (2026-08-26 19:18Z) Commit and push the Next.js milestone as `8e97c48` on `origin/main`.
- [x] (2026-08-26 19:44Z) Move React bridge injection into the Chromium context and remove the fixture-specific bridge import.
- [x] (2026-08-26 19:44Z) Add the Vite module-graph/HMR middleware and internal adapter without expanding the public MCP catalog.
- [x] (2026-08-26 19:44Z) Verify automatic React evidence, Vite module evidence, and the existing breakpoint/verification flow on the live fixture.
- [x] (2026-08-26 19:46Z) Re-run deterministic tests, harness checks, and React/Vite smoke after moving bridge injection and adding the Vite endpoint.
- [x] (2026-08-26 19:55Z) Re-run the full three-stack live smoke set and adaptive plan checks after the framework-runtime changes.
- [x] (2026-08-26 19:55Z) Commit and push the framework-runtime milestone as `61d3617` on `origin/main`.
- [x] (2026-08-26 20:05Z) Add bounded, redacted Next development-log tail evidence with project-root path enforcement.
- [x] (2026-08-26 20:05Z) Verify safe and out-of-bound log paths with deterministic tests and the live Next smoke.
- [x] (2026-08-26 20:08Z) Commit and push the Next server-evidence milestone as `7fabde7` on `origin/main`.
- [x] (2026-08-26 20:38Z) Add `web_next_inspect` for allowlisted route compilation and Server Action resolution.
- [x] (2026-08-26 20:38Z) Verify the real Next action manifest, `/` compilation result, and browser flow on the live fixture.
- [x] (2026-08-26 20:38Z) Commit and push the Next inspection milestone as `89a9553` on `origin/main`.
- [x] (2026-08-26 20:42Z) Add bounded React commit summaries, durations, and inferred render causes across Fiber alternates.
- [x] (2026-08-26 20:42Z) Verify state-driven render cause and commit profiler evidence on the live React/Vite fixture.
- [x] (2026-08-26 20:42Z) Commit and push the React profiler milestone as `25612a5` on `origin/main`.

## Surprises & Discoveries

The supplied GitHub repository was empty and had no repository-local instructions. The current AviaWorkspace checkout has unrelated modifications, so the new project was kept in a sibling directory. The first live browser path cannot assume a browser binary; launch mode therefore requires an explicit executable path and attach mode requires an explicit CDP endpoint.

Evidence: clone reported an empty repository; `git status --short --branch` reported `No commits yet on main`; `npm view` resolved the selected dependency versions; the first type check exposed and then resolved two CDP typing issues; the live smoke initially exposed pause-safe action/snapshot races and then passed with source, line, locals, screenshot, and console assertions; the built stdio server passed a client handshake with 11 discoverable tools; the React/Vite smoke passed component discovery, submitted state, source breakpoint, screenshot, and scenario verification while treating Vite/React informational console entries as non-errors; dependency selection initially exposed a Vite 8/Vitest peer conflict and was corrected to the compatible Vite 7/plugin-react 5 pair; the Next endpoint probe confirmed SSE JSON-RPC responses and a larger tool inventory than the thin adapter needs; the Next smoke exposed and then fixed an async client-state wait and a fixture favicon noise source; automatic bridge injection preserved React evidence after removing fixture setup, and the Vite endpoint exposed the live `App.jsx` module with its importer and active HMR channel; the Next log-tail tests confirmed project-root enforcement, bounded reads, and redaction; the Next inspection smoke resolved a real manifest action ID and compiled `/` with no issues; the React profiler smoke initially exposed Fiber alternate identity churn and then verified the corrected state render cause and commit timeline.

## Decision Log

- Decision: Use `web-debug-mcp` as the project name and keep it separate from AviaWorkspace product code. Rationale: the tool is a reusable developer capability and must not add frontend runtime dependencies to the platform composition repository. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Expose one MCP facade with high-level tools and keep browser/framework details behind adapters. Rationale: this avoids a global catalog of overlapping Vite, Next, React, and browser servers. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Start with Chromium/CDP and framework-neutral evidence. Rationale: CDP provides browser and JavaScript debugger primitives without requiring VS Code, while a vanilla fixture gives a deterministic baseline for future adapters. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Use fake-adapter tests for core orchestration and leave live Chromium smoke as a named candidate. Rationale: core lifecycle and redaction must be testable in any environment; live browser evidence depends on an explicitly available executable or CDP target. Date/Author: 2026-08-26 / Platform Engineering.
- Decision (superseded): Use an explicit `window.__WEB_DEBUG_REACT__` bridge for the first React adapter. Rationale: it gave the suite a deterministic semantic contract without adding a second React DevTools MCP or depending on unstable private Fiber APIs. The current bridge remains bounded, but injection is now owned by the browser adapter. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Speak directly to Next’s local `/_next/mcp` endpoint instead of nesting `next-devtools-mcp`. Rationale: the endpoint is the framework-owned source of runtime metadata, and one internal adapter preserves the suite’s single MCP catalog. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Add `wait(selector,text,timeout)` as an explicit browser action. Rationale: async client state can commit after a click and after a network response; a bounded text condition is more reliable than an arbitrary sleep and remains visible in a recorded scenario. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Inject the React bridge from `ChromiumAdapter` before page scripts run. Rationale: React evidence should work for a selected development app without requiring an app-specific bridge import or a second MCP server. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Expose Vite module graph/HMR state through an internal Vite plugin and `ViteAdapter`. Rationale: Vite does not provide this graph as a generic public HTTP endpoint; a local read-only plugin keeps the public MCP surface stable and makes the dependency graph inspectable. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Expose Next route compilation and Server Action lookup through one `web_next_inspect` tool. Rationale: route compilation has an explicit development-server effect and action lookup needs caller-provided input, so neither belongs implicitly in read-only capture; one high-level tool preserves the single MCP facade. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Derive React render causes from bounded DevTools-hook commit snapshots and Fiber alternate pairs. Rationale: the suite can expose useful state/prop/parent signals without shipping raw Fiber objects or adding a second profiler server; durations and commit history remain nullable and capped. Date/Author: 2026-08-26 / Platform Engineering.

## Outcomes & Retrospective

The source implementation, deterministic tests, adaptive harness, live Chromium smoke, built stdio handshake, automatically injected React bridge with bounded commit profiler/render-cause evidence, Vite module-graph/HMR adapter, React/Vite live smoke, Next runtime metadata adapter with bounded server-log tail, allowlisted route compilation and Server Action inspection, Next live smoke, and remote push are complete for the current milestone. The plan remains active for deep Next server execution tracing, Vite transform diffing, Safari, replay, remote targets, hosted deployment, and production evidence.

## Context and Orientation

The MCP boundary is `src/index.ts`. `SessionManager` in `src/core/session-manager.ts` owns session IDs, temporary artifact directories, action replay, and verification. `ChromiumAdapter` in `src/adapters/chromium.ts` owns Playwright/CDP calls, injects the React bridge, and caches pause-safe browser state. `ReactAdapter` in `src/adapters/react.ts` reads the bridge’s bounded component and commit profiler snapshots. `ViteAdapter` in `src/adapters/vite.ts` reads the local Vite plugin endpoint. `NextAdapter` in `src/adapters/next.ts` reads the Next development MCP endpoint and handles bounded inspection operations. `src/core/redaction.ts` is applied both while collecting browser events and while composing the final `EvidenceBundle`.

The `fixtures/vanilla/` page is served by `scripts/serve-fixture.mjs`; `fixtures/react-vite/` is served by `scripts/serve-react-vite.mjs`; `fixtures/next/` is served by `scripts/serve-next.mjs`. Unit and contract tests live under `test/` and use a fake browser adapter for lifecycle behavior. The project-native harness gate is `scripts/harness-check.mjs`.

## Plan of Work

The first milestone establishes the public contract and deterministic core. The second wires the live Chromium/CDP adapter without arbitrary process or target discovery. The third adds evidence and scenario verification so the project proves behavior rather than only compiling. The React/Vite milestone proves component/state evidence and executable source location. The Next milestone adds a direct SSE JSON-RPC adapter for App Router routes, project metadata, compilation issues, and runtime warnings. The framework-runtime milestone injects the React bridge automatically and adds a Vite module-graph/HMR endpoint without adding public MCP servers. The Next evidence milestone adds a bounded server-log tail, and the Next inspection milestone adds explicit route compilation and Server Action lookup. Remaining work is split into Vite transform diffing, Safari transport, replay timeline, and remote target milestones.

## Concrete Steps

Run commands from `/Users/marlonjd/Developer/monorepos/web-debug-mcp`.

1. Install dependencies with `npm install --no-audit --no-fund`. Expected signal: install exits 0 and the lockfile is present. If it fails, retain the error and inspect Node/npm compatibility before changing versions.
2. Run `npm test`, `npm run typecheck`, and `npm run build`. Expected signal: Vitest passes, TypeScript reports no diagnostics, and `dist/` is emitted.
3. Run `npm run harness:check`. Expected signal: `harness-check: PASS`. If it fails, repair the named path or contract rather than weakening the check.
4. Run `npm run smoke:live`. Expected signal: JSON reports `passed: true`, breakpoint source/line assertions pass, and no owned process remains. If Chromium is unavailable, retain the named blocker and run the deterministic suite.
5. Inspect `git diff --check` and `git status --short --branch`. Expected signal: no whitespace errors and only intended project files are present.
6. Create a Conventional Commit with the completed local implementation. Push only to the supplied `origin` after confirming the remote and authenticated write are in scope.

For the React/Vite milestone, run `npm run smoke:react-vite` after the normal checks. Expected signal: JSON reports `passed: true` with a React component, submitted state, source breakpoint, screenshot, and zero console errors. If Vite or Chromium is unavailable, keep the live milestone candidate-only and do not claim framework coverage.

For the Next milestone, run `npm run smoke:next` after the normal checks. Expected signal: JSON reports `passed: true` with Next runtime tool discovery, route metadata, compilation issues, server-rendered text, client route-handler state, and zero browser errors. A disabled optional Next tool may remain an explicit warning.

For the framework-runtime milestone, run `npm run smoke:react-vite` after the normal checks. Expected signal: JSON reports `passed: true` with automatic React bridge detection, component state, Vite module graph/HMR status, source breakpoint, screenshot, and zero browser errors.

For the Next server-evidence milestone, run `npm run smoke:next` after the normal checks. Expected signal: JSON reports `passed: true` with a relative, bounded `logTail` and no browser errors. A missing or out-of-bound log path must remain a warning, not a session failure.

For the Next inspection milestone, run `npm run smoke:next` after the normal checks. Expected signal: JSON reports `passed: true` with a clean `/` route compilation result and a resolved Server Action filename/function from the real development manifest.

For the React profiler milestone, run `npm run smoke:react-vite` after the normal checks. Expected signal: JSON reports `passed: true` with at least two commits, a changed component count, a state-derived `renderCause`, and no browser errors.

## Validation and Acceptance

Acceptance requires all of the following:

- `npm test` passes all deterministic tests.
- `npm run typecheck` and `npm run build` exit 0.
- `npm run harness:check` prints `harness-check: PASS`.
- `npm run smoke:live` reports `passed: true` when an explicit Chromium executable is available.
- `web_project_detect` reports `vanilla` and browser capabilities for `fixtures/vanilla`.
- A fake-adapter session can start, capture an evidence bundle with redaction metadata, verify a recorded scenario, and close.
- `ChromiumAdapter` rejects non-loopback URLs unless explicitly allowed and same-origin navigation is enforced.
- The MCP server registers the documented high-level tools and keeps diagnostics off stdout.
- `npm run smoke:react-vite` reports the React component tree and submitted state from a loopback Vite dev server.
- `npm run smoke:react-vite` reports the Vite module graph/HMR summary from the local development plugin.
- `npm run smoke:next` reports Next `/_next/mcp` metadata and the route-handler state from a loopback Next dev server.
- `npm run smoke:next` reports a bounded, redacted Next development-log tail whose file remains inside the detected project root.
- `npm run smoke:next` reports allowlisted route compilation and Server Action resolution through `web_next_inspect`.
- `npm run smoke:react-vite` reports bounded React commit summaries, durations where available, and an inferred state render cause.

The live Chromium smoke is verified locally in this environment using the explicit Google Chrome executable; other hosts remain candidate until they provide an executable or CDP endpoint.

## Idempotence and Recovery

Re-running install, tests, type checking, build, and the harness check is safe. The server removes a failed session after adapter startup failure. Close an active session with `web_session_close`; if the process exits unexpectedly, restart it and use only the retained temporary artifact path needed for review. Do not remove broad directories or alter AviaWorkspace files to recover this project.

## Artifacts and Notes

- `README.md` is the user-facing workflow and safety boundary.
- `ARCHITECTURE.md` is the current component and data-flow map.
- `docs/agent-harness/registry.md` is the command/evidence map.
- `docs/exec-plans/tech-debt-tracker.md` records deferred framework and live-browser work.
- Temporary screenshots are created only by a live session under the operating system temporary directory.
- `npm run smoke:live` produced `passed: true` with breakpoint source `app.js:12`, local value, screenshot, and zero console errors; the owned fixture and Chromium processes exited afterward.
- The framework-runtime milestone uses `fixtures/react-vite/`, `src/adapters/react-bridge.ts`, `src/adapters/react.ts`, `src/adapters/vite-plugin.ts`, and `src/adapters/vite.ts`; its live smoke retains the same cleanup and redaction boundaries.
- `npm run smoke:react-vite` produced `passed: true` with `CheckoutForm`, submitted hook state, `App.jsx:17`, screenshot, scenario verification, and no error/pageerror entries; the Vite and Chromium processes exited afterward.
- The final validation sequence passed `npm test` (8 tests), typecheck, build, native harness (88 checks), adaptive harness check (0 errors/0 warnings), vanilla smoke, and React/Vite smoke; process inspection found no leftover fixture, Vite, or headless Chromium process.
- `npm run smoke:next` produced `passed: true` with Next tools, `/` and `/api/health` routes, project metadata, clean compilation issues, server/client rendered text, and no browser errors; the Next and Chromium processes exited afterward.
- The framework-runtime validation passed `npm test` (12 tests), typecheck, build, native harness (107 checks), and React/Vite smoke with automatic bridge detection, `App.jsx` module/importer evidence, active HMR, breakpoint, screenshot, scenario verification, and no browser errors; the Vite and Chromium processes exited afterward.
- The Next server-evidence validation passed `npm test` (14 tests), typecheck, build, and `npm run smoke:next` with relative log-tail evidence; the safe-path and out-of-bound-path tests passed and the Next/Chromium processes exited afterward.
- The Next inspection validation passed `npm test` (15 tests), typecheck, build, and `npm run smoke:next` with `/` compilation `issues: []` and a real `submitPayment` Server Action manifest resolution; the Next/Chromium processes exited afterward.
- The React profiler validation passed `npm test` (15 tests), typecheck, build, and `npm run smoke:react-vite` with two commits, `CheckoutForm` render cause `state`, changed-component evidence, breakpoint, screenshot, and no browser errors; the Vite and Chromium processes exited afterward.

## Interfaces and Dependencies

The public MCP server is built with `@modelcontextprotocol/sdk` 1.30.0 and uses `McpServer.registerTool` with Zod 4 schemas. `playwright-core` 1.62.1 is used only through `BrowserAdapter`; it does not download a browser. `SessionManager` accepts a `BrowserAdapterFactory` so deterministic fake adapters can test lifecycle behavior without a browser. `EvidenceBundle` is version 1 and always carries a redaction marker.

The core public tools are `web_project_detect`, `web_session_start`, `web_session_status`, `web_browser_action`, `web_issue_capture`, `web_next_inspect`, `web_breakpoint_set`, `web_debug_control`, `web_debug_evaluate`, `web_repro_record`, `web_fix_verify`, and `web_session_close`.

The React adapter consumes the automatically injected, bounded `window.__WEB_DEBUG_REACT__` bridge. It returns component nodes with name, source location when available, props, hook state, render count, inferred render cause, and optional actual duration; it also returns a capped commit summary timeline. Render causes are inferred from serialized prop/hook signatures across Fiber alternates and are not a substitute for the full React DevTools profiler. The Vite adapter reads the bounded graph/HMR summary served by `webDebugVitePlugin()` at `/__web_debug/vite`. The fixture uses React 19.2.8, Vite 7.3.6, and `@vitejs/plugin-react` 5.1.1 because that combination satisfies the current Vitest peer range without forced dependency resolution. The Next adapter uses Next 16.3.3’s `/_next/mcp` endpoint, calls only the allowlisted metadata tools documented in `src/adapters/next.ts`, reads a bounded log tail only after the returned path resolves inside the detected project root, and handles route compilation or Server Action lookup only through `web_next_inspect`.

## Revision History

- (2026-08-26 15:35Z) Change: Created the active implementation plan and selected the first local vertical slice. Reason: Make the empty supplied repository restartable and evidence-driven.
- (2026-08-26 16:09Z) Change: Recorded source commit `5fbdf90` and remote branch verification. Reason: Preserve the first bootstrap checkpoint and leave the active plan ready for the adapter milestone.
- (2026-08-26 18:41Z) Change: Started the React/Vite adapter milestone. Reason: Add framework semantic evidence behind the existing one-MCP core while preserving the first milestone as a stable checkpoint.
- (2026-08-26 18:50Z) Change: Added the React bridge, Vite fixture, and live semantic smoke. Reason: Prove that the single MCP core can expose framework state and verify a React interaction without adding a second MCP server.
- (2026-08-26 18:56Z) Change: Recorded the final React/Vite validation evidence before the milestone checkpoint. Reason: Keep the active plan aligned with the tested working tree and explicit remaining commit/push step.
- (2026-08-26 18:57Z) Change: Recorded milestone commit `bdf83d0` and remote verification. Reason: Preserve the React/Vite checkpoint and leave future Next.js work as a separate active milestone.
- (2026-08-26 19:10Z) Change: Added and exercised the Next runtime metadata adapter and fixture. Reason: Extend the single MCP evidence contract to Next App Router runtime signals without adding a second MCP server.
- (2026-08-26 19:15Z) Change: Recorded the final three-stack validation evidence before the Next milestone checkpoint. Reason: Keep the active plan aligned with the tested tree and explicit commit/push step.
- (2026-08-26 19:18Z) Change: Recorded Next milestone commit `8e97c48` and remote verification. Reason: Preserve the Next metadata checkpoint and keep the active plan ready for deep server debugging.
- (2026-08-26 19:46Z) Change: Added automatic React bridge injection and Vite module-graph/HMR evidence. Reason: Make framework evidence available from the existing browser session without adding another MCP catalog.
- (2026-08-26 19:55Z) Change: Recorded framework-runtime commit `61d3617`, full live smoke evidence, and remote verification. Reason: Preserve the automatic bridge and Vite graph/HMR checkpoint before the next deep-debugging milestone.
- (2026-08-26 20:05Z) Change: Added bounded Next development-log tail evidence and project-root enforcement. Reason: Expose server-side runtime context through the existing capture bundle while keeping file access bounded and local.
- (2026-08-26 20:08Z) Change: Recorded server-evidence commit `7fabde7` and remote verification. Reason: Preserve the bounded Next log-tail checkpoint before deeper server and Server Action work.
- (2026-08-26 20:38Z) Change: Recorded Next inspection commit `89a9553` and remote verification. Reason: Preserve the explicit route compilation and Server Action lookup checkpoint before React/Vite/browser transport work.
- (2026-08-26 20:42Z) Change: Recorded React profiler commit `25612a5` and live verification. Reason: Preserve bounded commit and inferred render-cause evidence before Vite transform work.
