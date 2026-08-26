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

Create a standalone TypeScript MCP server that gives Codex one bounded local web-debugging workflow: detect a project, attach to or launch an explicitly selected Chromium target, capture runtime/debugger evidence, record a reproducible flow, and verify that flow after a code change. The current increment works for framework-neutral HTML/JS and an opt-in React/Vite bridge while leaving Next.js server semantics behind an optional adapter boundary.

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

## Surprises & Discoveries

The supplied GitHub repository was empty and had no repository-local instructions. The current AviaWorkspace checkout has unrelated modifications, so the new project was kept in a sibling directory. The first live browser path cannot assume a browser binary; launch mode therefore requires an explicit executable path and attach mode requires an explicit CDP endpoint.

Evidence: clone reported an empty repository; `git status --short --branch` reported `No commits yet on main`; `npm view` resolved the selected dependency versions; the first type check exposed and then resolved two CDP typing issues; the live smoke initially exposed pause-safe action/snapshot races and then passed with source, line, locals, screenshot, and console assertions; the built stdio server passed a client handshake with 11 discoverable tools; the React/Vite smoke passed component discovery, submitted state, source breakpoint, screenshot, and scenario verification while treating Vite/React informational console entries as non-errors; dependency selection initially exposed a Vite 8/Vitest peer conflict and was corrected to the compatible Vite 7/plugin-react 5 pair.

## Decision Log

- Decision: Use `web-debug-mcp` as the project name and keep it separate from AviaWorkspace product code. Rationale: the tool is a reusable developer capability and must not add frontend runtime dependencies to the platform composition repository. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Expose one MCP facade with high-level tools and keep browser/framework details behind adapters. Rationale: this avoids a global catalog of overlapping Vite, Next, React, and browser servers. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Start with Chromium/CDP and framework-neutral evidence. Rationale: CDP provides browser and JavaScript debugger primitives without requiring VS Code, while a vanilla fixture gives a deterministic baseline for future adapters. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Use fake-adapter tests for core orchestration and leave live Chromium smoke as a named candidate. Rationale: core lifecycle and redaction must be testable in any environment; live browser evidence depends on an explicitly available executable or CDP target. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Use an explicit `window.__WEB_DEBUG_REACT__` bridge for the first React adapter. Rationale: it gives the suite a deterministic semantic contract without adding a second React DevTools MCP or depending on unstable private Fiber APIs; automatic DevTools integration remains a later adapter. Date/Author: 2026-08-26 / Platform Engineering.

## Outcomes & Retrospective

The source implementation, deterministic tests, adaptive harness, live Chromium smoke, built stdio handshake, React/Vite semantic bridge, React/Vite live smoke, and milestone push are complete for the current milestone. The plan remains active for the next adapter milestone. Next.js server semantics, automatic React DevTools integration, Safari, replay, remote targets, hosted deployment, and production evidence remain intentionally deferred.

## Context and Orientation

The MCP boundary is `src/index.ts`. `SessionManager` in `src/core/session-manager.ts` owns session IDs, temporary artifact directories, action replay, and verification. `ChromiumAdapter` in `src/adapters/chromium.ts` owns Playwright and CDP calls and caches pause-safe browser state. `ReactAdapter` in `src/adapters/react.ts` reads the opt-in bridge. `src/core/redaction.ts` is applied both while collecting browser events and while composing the final `EvidenceBundle`.

The `fixtures/vanilla/` page is served by `scripts/serve-fixture.mjs`; `fixtures/react-vite/` is served by `scripts/serve-react-vite.mjs`. Unit and contract tests live under `test/` and use a fake browser adapter for lifecycle behavior. The project-native harness gate is `scripts/harness-check.mjs`.

## Plan of Work

The first milestone establishes the public contract and deterministic core. The second wires the live Chromium/CDP adapter without arbitrary process or target discovery. The third adds evidence and scenario verification so the project proves behavior rather than only compiling. The current milestone adds a Vite-served React fixture and an explicit runtime bridge that the React adapter can inspect. It proves component/state evidence, executable source location, and the existing fix-verification loop while keeping framework details behind the existing browser boundary. Next.js server semantics, automatic React DevTools integration, Safari, replay, remote targets, hosted deployment, and production evidence remain separate milestones.

## Concrete Steps

Run commands from `/Users/marlonjd/Developer/monorepos/web-debug-mcp`.

1. Install dependencies with `npm install --no-audit --no-fund`. Expected signal: install exits 0 and the lockfile is present. If it fails, retain the error and inspect Node/npm compatibility before changing versions.
2. Run `npm test`, `npm run typecheck`, and `npm run build`. Expected signal: Vitest passes, TypeScript reports no diagnostics, and `dist/` is emitted.
3. Run `npm run harness:check`. Expected signal: `harness-check: PASS`. If it fails, repair the named path or contract rather than weakening the check.
4. Run `npm run smoke:live`. Expected signal: JSON reports `passed: true`, breakpoint source/line assertions pass, and no owned process remains. If Chromium is unavailable, retain the named blocker and run the deterministic suite.
5. Inspect `git diff --check` and `git status --short --branch`. Expected signal: no whitespace errors and only intended project files are present.
6. Create a Conventional Commit with the completed local implementation. Push only to the supplied `origin` after confirming the remote and authenticated write are in scope.

For the React/Vite milestone, run `npm run smoke:react-vite` after the normal checks. Expected signal: JSON reports `passed: true` with a React component, submitted state, source breakpoint, screenshot, and zero console errors. If Vite or Chromium is unavailable, keep the live milestone candidate-only and do not claim framework coverage.

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
- The next milestone will use `fixtures/react-vite/` and `src/adapters/react.ts`; its live smoke must retain the same cleanup and redaction boundaries.
- `npm run smoke:react-vite` produced `passed: true` with `CheckoutForm`, submitted hook state, `App.jsx:17`, screenshot, scenario verification, and no error/pageerror entries; the Vite and Chromium processes exited afterward.
- The final validation sequence passed `npm test` (8 tests), typecheck, build, native harness (88 checks), adaptive harness check (0 errors/0 warnings), vanilla smoke, and React/Vite smoke; process inspection found no leftover fixture, Vite, or headless Chromium process.

## Interfaces and Dependencies

The public MCP server is built with `@modelcontextprotocol/sdk` 1.30.0 and uses `McpServer.registerTool` with Zod 4 schemas. `playwright-core` 1.62.1 is used only through `BrowserAdapter`; it does not download a browser. `SessionManager` accepts a `BrowserAdapterFactory` so deterministic fake adapters can test lifecycle behavior without a browser. `EvidenceBundle` is version 1 and always carries a redaction marker.

The core public tools are `web_project_detect`, `web_session_start`, `web_session_status`, `web_browser_action`, `web_issue_capture`, `web_breakpoint_set`, `web_debug_control`, `web_debug_evaluate`, `web_repro_record`, `web_fix_verify`, and `web_session_close`.

The React adapter consumes the opt-in `window.__WEB_DEBUG_REACT__` bridge exposed by the fixture. It returns bounded component nodes with name, source location when available, props, hook state, and render count; absence of the bridge is a warning, not a session failure. The fixture uses React 19.2.8, Vite 7.3.6, and `@vitejs/plugin-react` 5.1.1 because that combination satisfies the current Vitest peer range without forced dependency resolution.

## Revision History

- (2026-08-26 15:35Z) Change: Created the active implementation plan and selected the first local vertical slice. Reason: Make the empty supplied repository restartable and evidence-driven.
- (2026-08-26 16:09Z) Change: Recorded source commit `5fbdf90` and remote branch verification. Reason: Preserve the first bootstrap checkpoint and leave the active plan ready for the adapter milestone.
- (2026-08-26 18:41Z) Change: Started the React/Vite adapter milestone. Reason: Add framework semantic evidence behind the existing one-MCP core while preserving the first milestone as a stable checkpoint.
- (2026-08-26 18:50Z) Change: Added the React bridge, Vite fixture, and live semantic smoke. Reason: Prove that the single MCP core can expose framework state and verify a React interaction without adding a second MCP server.
- (2026-08-26 18:56Z) Change: Recorded the final React/Vite validation evidence before the milestone checkpoint. Reason: Keep the active plan aligned with the tested working tree and explicit remaining commit/push step.
- (2026-08-26 18:57Z) Change: Recorded milestone commit `bdf83d0` and remote verification. Reason: Preserve the React/Vite checkpoint and leave future Next.js work as a separate active milestone.
