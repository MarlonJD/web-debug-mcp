<!-- harness-plan:v1
id: web-debug-mcp-mvp
status: active
created: 2026-08-26
updated: 2026-08-27
completed:
owner: Platform Engineering
-->

# Build the first web-debug-mcp vertical slice

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). This plan records the first implementation on the supplied empty GitHub repository.

## Purpose / Big Picture

Create a standalone TypeScript MCP server that gives Codex one bounded local web-debugging workflow: detect a project, attach to or launch an explicitly selected browser target, capture runtime/debugger evidence, inspect framework runtime state, record a reproducible flow, and verify that flow after a code change. The current increment works for framework-neutral HTML/JS, Chromium/CDP, Safari WebDriver/BiDi actions and evidence, an automatically injected React bridge with bounded commit profiling and render-cause details, Vite module-graph/HMR metadata with transform provenance/diffs and source-map summaries, Next.js development-server metadata with bounded server-log, request-insight, route-compilation, and Server Action execution evidence, and captured-frame replay seek/restore while keeping exact framework parity, external-host evidence, and production certification behind explicit boundaries.

## Progress

- [x] (2026-08-26 21:16Z) Run the final deterministic, harness, vanilla, React/Vite, Next, and Safari smoke set and record Safari permission and external-target evidence literally.

- [x] (2026-08-26 21:12Z) Add explicit CDP endpoint protocol/host validation and remote target metadata.
- [x] (2026-08-26 21:12Z) Verify default-deny remote CDP policy and local launch target isolation metadata.
- [x] (2026-08-26 21:12Z) Commit and push the remote-target policy milestone as 0fbee2d on origin/main.

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
- [x] (2026-08-26 20:49Z) Add bounded Vite transform snapshots and line diffs to the HMR evidence.
- [x] (2026-08-26 20:49Z) Verify a real `App.jsx` HMR edit/restore cycle through the Vite adapter.
- [x] (2026-08-26 20:49Z) Commit and push the Vite transform-diff milestone as `86ff0da` on `origin/main`.
- [x] (2026-08-26 21:00Z) Add explicit Safari WebDriver browser selection, actions, DOM/screenshot evidence, and CDP capability warnings.
- [x] (2026-08-26 21:00Z) Add deterministic Safari transport coverage and a cleanup-safe live smoke.
- [x] (2026-08-26 21:00Z) Attempt the live Safari smoke; record the macOS remote-automation permission blocker without retrying credentials.
- [x] (2026-08-26 21:00Z) Commit and push the Safari WebDriver milestone as `8604c77` on `origin/main`.
- [x] (2026-08-26 21:06Z) Add a 50-frame bounded replay timeline, sanitised actions, and `web_replay_seek`.
- [x] (2026-08-26 21:06Z) Verify replay capture/seek and form-value sanitisation in deterministic and React/Vite live tests.
- [x] (2026-08-26 21:06Z) Commit and push the replay milestone as `4ddf88e` on `origin/main`.
- [x] (2026-08-26 22:10Z) Re-run the sandbox-external Safari WebDriver smoke after enabling macOS remote automation; all Safari assertions passed.
- [x] (2026-08-27 01:42Z) Add Safari WebDriver BiDi subscription, bounded console/network evidence, and a disclosed Performance Resource Timing fallback for Safari versions without network events.
- [x] (2026-08-27 01:42Z) Add mocked BiDi transport coverage and re-run the real Safari smoke with console, network-source, DOM, screenshot, and debugger-boundary assertions.
- [x] (2026-08-27 01:42Z) Commit and push the Safari BiDi milestone as `9d72ae2` on `origin/main`.
- [x] (2026-08-27 01:46Z) Verify that no approved external remote CDP endpoint is present and preserve the default-deny/policy-only status without fabricating an external attach result.
- [x] (2026-08-27 01:47Z) Run the adaptive harness check, plan validation, typecheck, deterministic tests, build, and Safari smoke after the BiDi milestone.
- [x] (2026-08-27 01:56Z) Add a bounded flat React flamegraph view with depth, duration, source, render count, and inferred render-cause summaries; verify it in the live React/Vite smoke.
- [x] (2026-08-27 01:56Z) Commit and push the React flamegraph milestone as `f9a4b73` on `origin/main`.
- [x] (2026-08-27 01:58Z) Correct Safari target metadata to `isolated:false`, add the visible-profile warning, and cover remote WebDriver default-deny behavior.
- [x] (2026-08-27 01:58Z) Commit and push the Safari profile-boundary and endpoint-policy milestones as `c03abaa` and `954de70` on `origin/main`.
- [x] (2026-08-27 02:04Z) Guard optional Safari BiDi runtime support for Node versions without a usable global WebSocket and verify Safari smoke remains green; commit and push as `7d57a81`.
- [x] (2026-08-27 02:10Z) Normalize Next request-insight traces and link the matching server trace into observed Server Action execution evidence; verify the real POST request, trace spans, and action resolution in the Next smoke.
- [x] (2026-08-27 02:10Z) Commit and push the Next request-trace linkage milestone as `f0e28f0` on `origin/main`.
- [x] (2026-08-27 02:16Z) Add deterministic coverage for missing Node WebSocket support and verify explicit Safari BiDi fallback behavior; commit and push as `1f587cc`.
- [x] (2026-08-27 02:17Z) Extend the native harness gate to enforce normalized Next request traces and push as `a866284`.
- [ ] Obtain an approved external Chromium/CDP endpoint for live remote-attach evidence; local policy coverage is complete but external evidence is unavailable.
- [x] (2026-08-27 15:12Z) Create the owner-only external HMAC key, canonical v2 coverage records, and direct-child attestation overlay; verify `CERT000` for repository-local harness readiness. The current source and attestation IDs are authoritative in `docs/agent-harness/certification.json` and Git parent history.
- [x] (2026-08-27 15:30Z) Rewrite the public README to explain the project purpose, MCP value, native macOS/iOS skill distinction, use cases, benefits, expectations, and explicit non-expectations; update the GitHub repository description and topics.
- [x] (2026-08-27 13:49Z) Make the server installable as a standalone stdio MCP through GitHub `npx` for Codex and Claude Code; add the executable package contract, agent-use instructions, and README-first installation guidance.
- [x] (2026-08-27 14:08Z) Add the GPL-3.0-or-later license to the source repository and packaged distribution, with README and contract coverage.
- [x] (2026-08-27 14:35Z) Add `demo:compare` with vanilla, React/Vite, and Next before/after flows, raw baseline measurements, MCP evidence coverage, Markdown/JSON output, and temporary screenshot artifacts.
- [x] (2026-08-27 18:12Z) Add isolated complex React/Vite repair scenarios for stale derived state, out-of-order async quotes, and responsive drawer geometry; add bounded viewport propagation and repair/fix verification reporting.
- [x] (2026-08-27 18:13Z) Validate complex logic, async, and visual repairs with live Chromium, desktop/mobile geometry, temporary before/after screenshots, deterministic fixture contracts, and no owned process left behind.
- [x] (2026-08-27 18:23Z) Run final model QA arms with `gpt-5.6-sol + xhigh` and `gpt-5.6-luna + max`; both passed the core gates and all three repair contracts, and the runner now exits non-zero on semantic repair failure.
- [x] (2026-08-27 18:31Z) Add a user-facing `docs/examples-evidence.md` guide and link it from README, with scenario explanations, before/after evidence, and usage rationale.
- [x] (2026-08-27) Package the local MCP server as the `web-debug` Codex/ChatGPT/Claude Code plugin with shared workflow skill and client-specific repository marketplace entries.

## Surprises & Discoveries

The supplied GitHub repository was empty and had no repository-local instructions. The current AviaWorkspace checkout has unrelated modifications, so the new project was kept in a sibling directory. The first live browser path cannot assume a browser binary; launch mode therefore requires an explicit executable path and attach mode requires an explicit CDP endpoint.

Evidence: clone reported an empty repository; `git status --short --branch` reported `No commits yet on main`; `npm view` resolved the selected dependency versions; the first type check exposed and then resolved two CDP typing issues; the live smoke initially exposed pause-safe action/snapshot races and then passed with source, line, locals, screenshot, and console assertions; the built stdio server passed a client handshake with 11 discoverable tools; the React/Vite smoke passed component discovery, submitted state, source breakpoint, screenshot, and scenario verification while treating Vite/React informational console entries as non-errors; dependency selection initially exposed a Vite 8/Vitest peer conflict and was corrected to the compatible Vite 7/plugin-react 5 pair; the Next endpoint probe confirmed SSE JSON-RPC responses and a larger tool inventory than the thin adapter needs; the Next smoke exposed and then fixed an async client-state wait and a fixture favicon noise source; automatic bridge injection preserved React evidence after removing fixture setup, and the Vite endpoint exposed the live `App.jsx` module with its importer and active HMR channel; the Next log-tail tests confirmed project-root enforcement, bounded reads, and redaction; the Next inspection smoke resolved a real manifest action ID and compiled `/` with no issues; the React profiler smoke initially exposed Fiber alternate identity churn and then verified the corrected state render cause and commit timeline; the Vite smoke initially exposed lifecycle pause races during HMR and then verified a bounded transformed-code diff after the update and restore cycle; the Safari smoke reached safaridriver but was blocked by the macOS Allow remote automation setting and did not consume or retry a password; the replay smoke verified retained action/capture frames, non-mutating seek, and sanitised fill values.

The Safari 26.5 BiDi probe accepted `session.subscribe` and delivered console events but did not consistently emit network events; the adapter therefore discloses and bounds a Performance Resource Timing fallback. Node 20.10 requires experimental WebSocket support, so the adapter detects missing runtime support and degrades explicitly. Safari 27 and Safari Technology Preview 247 now expose Apple’s official Safari MCP server, so this project keeps one internal Safari compatibility adapter rather than adding a duplicate public MCP catalog. A remote-CDP alias test was intentionally discarded after Chrome normalized the address to local loopback; only an approved external endpoint would count as live remote evidence. The repository-local certification overlay now returns `CERT000`; optional provider-backed production attestation and approved external CDP evidence remain unavailable.

The comparison demo showed that a scripted MCP flow can add structured evidence while remaining within the same local-machine time scale: the final three-run run measured median total times of 701 ms baseline versus 808 ms MCP for vanilla validation (+107 ms), 695 ms versus 845 ms for React/Vite render diagnosis (+150 ms), and 841 ms versus 1,189 ms for Next Server Action linkage (+348 ms). These are technical local measurements, not human diagnosis-time claims; the Next delta reflects route/action inspection and linked server evidence.

The complex repair demo initially exposed two harness issues during live iteration: temporary fixture copies could contain a Vite-generated `node_modules` directory before the dependency symlink was created, and the Next happy-path flow could click before client hydration. The runner now filters copied dependency directories, uses an isolated symlink to the repository dependencies, and records a bounded hydration wait in the Next scenario. A three-run async sweep also exposed a Vite variant-readiness race; the runner now polls the served module marker before opening a browser. The visual repair uses geometry invariants in addition to screenshots so a passing pixel capture cannot hide a viewport regression, and repair failures now exit non-zero.

The plugin packaging follows the AWS Agent Toolkit pattern: a manifest, skills directory, and `.mcp.json` are installed together. The plugin is named `web-debug` for Codex and Claude Code discovery, while the underlying package and binary remain `web-debug-mcp` for cross-client MCP compatibility. The bundled configuration launches the existing local stdio server on demand; it does not introduce a hosted endpoint or a second tool catalog.

## Decision Log

- Decision: Require explicit remote CDP opt-in and expose remote/non-isolated target metadata. Rationale: remote browser control is materially higher risk than a local launch, so endpoint host/protocol validation and allowRemote must be visible in the session contract; no target discovery or implicit credential flow is added. Date/Author: 2026-08-26 / Platform Engineering.

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
- Decision: Cache post-plugin Vite transform snapshots and produce a minimal changed-block diff on HMR. Rationale: the module graph identifies what changed, while the bounded diff shows why without exposing unbounded source or requiring a second Vite MCP server. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Add Safari through W3C WebDriver with an explicit `browser: "safari"` selection. Rationale: it provides real Safari actions, DOM, screenshots, evaluation, and BiDi evidence without mislabeling Playwright WebKit as Safari; debugger parity remains explicitly unavailable and visible Safari profiles are non-isolated. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Keep replay as a bounded captured-state timeline with an explicit seek tool and safe-action restore. Rationale: it gives agents inspectable before/after evidence and can reissue navigation/click/wait/reload actions, while sanitising fill values and rejecting unsafe restoration. Date/Author: 2026-08-26 / Platform Engineering.
- Decision: Use Safari WebDriver BiDi for console and network subscription, with Performance Resource Timing as an explicitly disclosed fallback. Rationale: Safari 26.5 delivered reliable BiDi console events but did not consistently emit network events; preserving bounded metadata is useful as long as the source is visible and no CDP parity is claimed. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Do not add Apple’s Safari 27 MCP as another public server in this repository. Rationale: Safari 27 already provides an official browser-native Safari MCP surface; duplicating it would create the MCP sprawl this project is designed to avoid. The internal adapter remains a compatibility path for older Safari and shared session orchestration. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Restore replay frames only by replaying safe retained actions. Rationale: navigation, click, wait, and reload can be reissued within the session origin, while sanitised form inputs and redacted URLs must fail closed; this is not application-state time travel. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Keep external remote attach and HMAC certification as evidence-gated work. Rationale: a policy test or locally selected key cannot substitute for an approved external target, caller-supplied key, or trusted attestation scope. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Compare MCP against a repeatable raw-browser baseline instead of inventing human-time claims. Rationale: direct Playwright/source inspection gives an auditable machine baseline, while human diagnosis time requires a separate controlled usability study; the report therefore compares phase timings and evidence coverage explicitly. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Keep complex repair fixtures isolated in temporary runtime copies and require exact single-match patches. Rationale: buggy and fixed variants must be reproducible without dirtying the repository or letting a broad source rewrite silently target the wrong file; geometry invariants and repeated checks remain the acceptance gate alongside screenshots. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Add bounded explicit Chromium viewport input to `web_session_start`. Rationale: responsive visual debugging needs the same named viewport in the MCP path and raw baseline, while attached/non-isolated browser profiles must not be presented as deterministic visual evidence. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Compare Sol `xhigh` and Luna `max` as separate controlled QA arms, not as a repository runtime dependency. Rationale: the demo repository should remain model-agnostic; each arm must use the same fixture, prompt, ports, and oracle while model identity, reasoning setting, wall time, and verification outcomes remain external evaluation metadata. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Treat a model QA run as valid only when the tracked snapshot is stable and the semantic repair exit status agrees with the report. Rationale: a green process status can conceal a failed repair, and concurrent workspace or port changes can invalidate a model comparison; the final arms therefore record these conditions explicitly. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Keep the repository and MCP package named `web-debug-mcp`, but distribute a `web-debug` Codex/ChatGPT plugin. Rationale: `web-debug-skill` would misdescribe the tool-bearing project, while `web-debug-plugin` would obscure standalone MCP compatibility; a short plugin ID gives users a clean install surface without renaming the server. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Add a Claude Code manifest and repository marketplace alongside the Codex plugin files. Rationale: Claude Code discovers GitHub marketplaces through root `.claude-plugin/marketplace.json` and loads plugin MCP servers from root `.mcp.json`; sharing the same skill and server preserves one implementation while supporting both clients. Date/Author: 2026-08-27 / Platform Engineering.

## Outcomes & Retrospective

The remote-target policy milestone is implemented and pushed. It covers explicit CDP endpoint validation and target metadata; an approved external host is still required for live remote-attach evidence.

The source implementation, deterministic tests, adaptive harness, live Chromium smoke, built stdio handshake, automatically injected React bridge with bounded commit profiler/render-cause evidence, Vite module-graph/HMR adapter with transform provenance/diffs and source-map summaries, bounded replay timeline/restore, React/Vite live smoke, Next runtime metadata with bounded server-log/request-insight/Server Action execution evidence, Safari WebDriver/BiDi transport, the before/after comparison demo, repository-local harness certification, the `web-debug` Codex/ChatGPT/Claude Code plugin wrapper, and remote push are complete for the implemented local suite. The plan remains active only for an approved external remote target and optional provider-backed production attestation; exact framework parity and hosted deployment remain explicit non-claims.

The current deterministic suite passes 24 tests, typecheck, build, 127 native harness checks, adaptive harness with zero errors/warnings, plan validation, vanilla CDP, React/Vite profiler/flamegraph/replay/transform evidence, Next route/action/log/request-trace evidence, and Safari BiDi/fallback/profile-boundary evidence. No approved external remote host was available for live attach; repository-local certification returns `CERT000`, while provider-backed production attestation remains unavailable.

The Safari permission blocker is resolved for this host: the real retry passed with `browser: "safari"`, DOM/action/screenshot evidence, BiDi console evidence, bounded network evidence, and explicit debugger/fallback warnings. Safari 27’s official Safari MCP is recorded as the browser-native alternative; this repository intentionally does not duplicate its public catalog. The external remote-CDP host and formal harness attestation remain unavailable.

## Context and Orientation

The MCP boundary is `src/index.ts`. `SessionManager` in `src/core/session-manager.ts` owns session IDs, temporary artifact directories, bounded replay frames, action replay, and verification. `ChromiumAdapter` in `src/adapters/chromium.ts` owns Playwright/CDP calls, injects the React bridge, and caches pause-safe browser state. `ReactAdapter` in `src/adapters/react.ts` reads the bridge’s bounded component and commit profiler snapshots. `ViteAdapter` in `src/adapters/vite.ts` reads the local Vite plugin endpoint. `NextAdapter` in `src/adapters/next.ts` reads the Next development MCP endpoint and handles bounded inspection operations. `src/core/redaction.ts` is applied both while collecting browser events and while composing the final `EvidenceBundle`. The `plugins/web-debug/` directory packages this same server with the `web-debug-workflow` skill and repository marketplace metadata.

The `fixtures/vanilla/` page is served by `scripts/serve-fixture.mjs`; `fixtures/react-vite/` is served by `scripts/serve-react-vite.mjs`; `fixtures/next/` is served by `scripts/serve-next.mjs`. Unit and contract tests live under `test/` and use a fake browser adapter for lifecycle behavior. The project-native harness gate is `scripts/harness-check.mjs`; `scripts/demo-compare.mjs` runs the raw-browser baseline and MCP comparison.

## Plan of Work

The remote-target milestone adds explicit CDP endpoint validation and non-isolated metadata. Its deterministic policy is complete; external-host live attach remains a separate evidence gate because no approved endpoint is available in this environment.

The bounded requested milestones are implemented and pushed. React profiler/render-cause details, Vite transform provenance/source-map summaries, Next request/action evidence, Safari BiDi/fallback evidence, safe replay restore, and repository-local harness certification are now covered without adding duplicate MCP catalogs. The remaining items are authority/evidence gates: approved external-target live evidence and optional provider-backed production attestation.

The first milestone establishes the public contract and deterministic core. The second wires the live Chromium/CDP adapter without arbitrary process or target discovery. The third adds evidence and scenario verification so the project proves behavior rather than only compiling. The React/Vite milestones add automatic component/state evidence, bounded commit profiler/render-cause details, module graph/HMR state, transform provenance/diffs, and source-map summaries without adding public MCP servers. The Next milestones add direct SSE JSON-RPC metadata, bounded logs/request insights, route compilation, Server Action lookup, and request-linked execution evidence. The Safari milestones add W3C WebDriver actions/DOM/screenshots plus BiDi console/network subscription with a disclosed fallback. The replay milestones add captured-frame timeline/seek and safe action restore. Remote policy is fail-closed and external attach remains authority-gated; repository-local harness certification is current while provider-backed production attestation remains gated.

## Concrete Steps

Run commands from `/Users/marlonjd/Developer/monorepos/web-debug-mcp`.

1. Install dependencies with `npm install --no-audit --no-fund`. Expected signal: install exits 0 and the lockfile is present. If it fails, retain the error and inspect Node/npm compatibility before changing versions.
2. Run `npm test`, `npm run typecheck`, and `npm run build`. Expected signal: Vitest passes, TypeScript reports no diagnostics, and `dist/` is emitted.
3. Run `npm run harness:check`. Expected signal: `harness-check: PASS`. If it fails, repair the named path or contract rather than weakening the check.
4. Run `npm run smoke:live`. Expected signal: JSON reports `passed: true`, breakpoint source/line assertions pass, and no owned process remains. If Chromium is unavailable, retain the named blocker and run the deterministic suite.
5. Inspect `git diff --check` and `git status --short --branch`. Expected signal: no whitespace errors and only intended project files are present.
6. Create a Conventional Commit with the completed local implementation. Push only to the supplied `origin` after confirming the remote and authenticated write are in scope.

For the comparison demo, run `npm run demo:compare -- --runs=1` for a quick local check or `npm run demo:compare` for the default three-run median/p90 report. Expected signal: Markdown lists vanilla, React/Vite, and Next baseline/MCP timings and added evidence fields; `--json` returns the same report as structured output. If Chromium is unavailable, keep the demo live path blocked and do not infer its results.

For the complex repair demo, run `npm run demo:compare -- --scenario=complex-logic-fix --runs=1`, `complex-async-fix`, and `visual-layout-fix`. Expected signal: each buggy flow reproduces, MCP evidence includes the runtime or geometry signal, the temporary exact patch is applied, and the fixed verification passes; the visual scenario must pass at `1440×900` and `390×844`.

For the React/Vite milestone, run `npm run smoke:react-vite` after the normal checks. Expected signal: JSON reports `passed: true` with a React component, submitted state, source breakpoint, screenshot, and zero console errors. If Vite or Chromium is unavailable, keep the live milestone candidate-only and do not claim framework coverage.

For the Next milestone, run `npm run smoke:next` after the normal checks. Expected signal: JSON reports `passed: true` with Next runtime tool discovery, route metadata, compilation issues, server-rendered text, client route-handler state, and zero browser errors. A disabled optional Next tool may remain an explicit warning.

For the framework-runtime milestone, run `npm run smoke:react-vite` after the normal checks. Expected signal: JSON reports `passed: true` with automatic React bridge detection, component state, Vite module graph/HMR status, source breakpoint, screenshot, and zero browser errors.

For the Next server-evidence milestone, run `npm run smoke:next` after the normal checks. Expected signal: JSON reports `passed: true` with a relative, bounded `logTail` and no browser errors. A missing or out-of-bound log path must remain a warning, not a session failure.

For the Next inspection milestone, run `npm run smoke:next` after the normal checks. Expected signal: JSON reports `passed: true` with a clean `/` route compilation result and a resolved Server Action filename/function from the real development manifest.

For the React profiler milestone, run `npm run smoke:react-vite` after the normal checks. Expected signal: JSON reports `passed: true` with at least two commits, a changed component count, a state-derived `renderCause`, and no browser errors.

For the Vite transform milestone, run `npm run smoke:react-vite` after the normal checks. Expected signal: JSON reports `passed: true` with a non-empty bounded `transformDiff` after a real HMR update and the fixture source restored afterward.

For the Safari milestone, run `npm run smoke:safari` after the normal checks. Expected signal: JSON reports `passed: true` for Safari WebDriver actions/DOM/screenshot, BiDi console evidence, and network evidence with its source disclosed; if macOS remote automation is disabled, the command must report `status: "blocked"` with the exact setting requirement.

For the replay milestone, run `npm run smoke:react-vite` after the normal checks. Expected signal: JSON reports `passed: true` with retained frames, successful `web_replay_seek`, safe-action restore, and no raw fill value in a replay action.

For the remote-target evidence gate, run `npm test -- --run test/chromium-policy.test.ts` and inspect the environment for an explicitly approved external CDP endpoint. A local alias or policy-only result is not external evidence; absent an approved endpoint, record the gate as unavailable.

For the formal harness gate, run the project-native checks and the bundled `harness.py certify` command with the external owner-only HMAC key, trusted direct-child attestation commit, and fresh v2 records recorded by the repository procedure. The ordinary repository-local profile returns `CERT000`; the optional production profile still requires provider authority and must not be simulated.

## Validation and Acceptance

Remote-target acceptance additionally requires default-deny and endpoint-protocol tests plus local target metadata. A remote live run is candidate-only until an approved external endpoint is supplied.

Acceptance requires all of the following:

- `npm test` passes all deterministic tests.
- `npm run typecheck` and `npm run build` exit 0.
- `npm run harness:check` prints `harness-check: PASS`.
- `npm run smoke:live` reports `passed: true` when an explicit Chromium executable is available.
- `web_project_detect` reports `vanilla` and browser capabilities for `fixtures/vanilla`.
- A fake-adapter session can start, capture an evidence bundle with redaction metadata, verify a recorded scenario, and close.
- `ChromiumAdapter` rejects non-loopback URLs unless explicitly allowed and same-origin navigation is enforced.
- The MCP server registers the documented high-level tools and keeps diagnostics off stdout.
- `python3 /Users/marlonjd/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/web-debug` passes for the Codex/ChatGPT plugin package.
- The Codex and Claude Code plugin manifests expose the `web-debug` identity; the shared `.mcp.json` launches the existing `web-debug-mcp` stdio binary with bounded timeouts.
- The Codex and Claude Code repository marketplaces point to `./plugins/web-debug`; installing the plugin does not require a separate MCP registration.
- `npm run smoke:react-vite` reports the React component tree and submitted state from a loopback Vite dev server.
- `npm run smoke:react-vite` reports the Vite module graph/HMR summary from the local development plugin.
- `npm run smoke:next` reports Next `/_next/mcp` metadata and the route-handler state from a loopback Next dev server.
- `npm run smoke:next` reports a bounded, redacted Next development-log tail whose file remains inside the detected project root.
- `npm run smoke:next` reports allowlisted route compilation and Server Action resolution through `web_next_inspect`.
- `npm run smoke:react-vite` reports bounded React commit summaries, durations where available, and an inferred state render cause.
- `npm run smoke:react-vite` reports a bounded Vite transform diff for a real HMR update.
- `npm run smoke:react-vite` reports a bounded replay timeline, non-mutating frame seek, and successful safe-action restore.
- `npm run demo:compare` reports repeatable baseline/MCP timing and evidence-coverage differences for the three original and three complex repair fixture families.
- `npm run demo:compare -- --scenario=complex-async-fix` reports deterministic request 1/request 2 out-of-order behavior, stale-result reproduction, and latest-request-wins verification.
- `npm run demo:compare -- --scenario=visual-layout-fix` reports before/after screenshots and geometry invariants at desktop and mobile viewports without a desktop regression.

- `npm run smoke:safari` reports Safari WebDriver action/DOM/screenshot evidence, BiDi console evidence, network-source disclosure, and the explicit debugger boundary or the exact macOS permission blocker.

- Remote CDP policy rejects unapproved targets by default; a live external attach remains unverified until an approved endpoint is supplied.
- Formal repository-local `harness-ready` certification is current at `CERT000`; the optional production-attestation profile is not claimed without provider authority.

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
- `npm run smoke:react-vite` produced `passed: true` with `CheckoutForm`, submitted hook state, a flat flamegraph with depth/durations, `App.jsx:17`, screenshot, scenario verification, and no error/pageerror entries; the Vite and Chromium processes exited afterward.
- The final validation sequence passed `npm test` (8 tests), typecheck, build, native harness (88 checks), adaptive harness check (0 errors/0 warnings), vanilla smoke, and React/Vite smoke; process inspection found no leftover fixture, Vite, or headless Chromium process.
- `npm run smoke:next` produced `passed: true` with Next tools, `/` and `/api/health` routes, project metadata, clean compilation issues, server/client rendered text, and no browser errors; the Next and Chromium processes exited afterward.
- The framework-runtime validation passed `npm test` (12 tests), typecheck, build, native harness (107 checks), and React/Vite smoke with automatic bridge detection, `App.jsx` module/importer evidence, active HMR, breakpoint, screenshot, scenario verification, and no browser errors; the Vite and Chromium processes exited afterward.
- The Next server-evidence validation passed `npm test` (14 tests), typecheck, build, and `npm run smoke:next` with relative log-tail evidence; the safe-path and out-of-bound-path tests passed and the Next/Chromium processes exited afterward.
- The Next inspection validation passed `npm test` (15 tests), typecheck, build, and `npm run smoke:next` with `/` compilation `issues: []` and a real `submitPayment` Server Action manifest resolution; the Next/Chromium processes exited afterward.
- The React profiler validation passed `npm test` (15 tests), typecheck, build, and `npm run smoke:react-vite` with two commits, `CheckoutForm` render cause `state`, changed-component evidence, breakpoint, screenshot, and no browser errors; the Vite and Chromium processes exited afterward.
- The Vite transform validation passed `npm test` (16 tests), typecheck, build, and `npm run smoke:react-vite` with a bounded transformed-code diff and restored fixture source; the Vite and Chromium processes exited afterward.
- The Safari validation passed deterministic adapter tests and the cleanup-safe smoke reached safaridriver, then reported `status: "blocked"` because macOS remote automation was disabled; no password was retried.
- The follow-up Safari validation passed `npm run smoke:safari` outside the sandbox with action, DOM, screenshot, BiDi console, disclosed network fallback, debugger-boundary, and cleanup assertions.
- The replay validation passed deterministic session-manager tests and `npm run smoke:react-vite` with retained frames, frame seek, safe restore, sanitised fill actions, and no browser errors.
- The remote-target validation passed endpoint policy tests; a local alias was discarded as external evidence after Chrome normalized it to loopback, and no approved external host was available for live remote attach.
- The Safari BiDi validation passed the deterministic transport test, typecheck, build, harness checks, plan validation, and real Safari smoke; the repository-local full harness verifier returns `CERT000` for the direct-child attestation overlay.
- The complex repair validation passed the fixture contract tests, typecheck, build, and live one-run logic/async/visual demos; stale filtering and async quote results reproduced before exact temporary fixes, and desktop/mobile drawer coverage passed after the visual fix.
- The final Sol `xhigh` and Luna `max` QA arms each passed `npm test`, typecheck, build, harness, and the three repair contracts; Sol completed its valid sweep in about 30.77 seconds and Luna in about 30.82 seconds after one transient port retry. These are single-run QA observations, not a statistically reliable model benchmark.

## Interfaces and Dependencies

Browser targets now identify the selected browser engine and whether the connection is remote; Safari uses WebDriver and Chromium uses CDP/launch according to explicit session input.

The public MCP server is built with `@modelcontextprotocol/sdk` 1.30.0 and uses `McpServer.registerTool` with Zod 4 schemas. `playwright-core` 1.62.1 is used only through `BrowserAdapter`; it does not download a browser. `SessionManager` accepts a `BrowserAdapterFactory` so deterministic fake adapters can test lifecycle behavior without a browser. `EvidenceBundle` is version 1 and always carries a redaction marker.

The core public tools are `web_project_detect`, `web_session_start`, `web_session_status`, `web_browser_action`, `web_issue_capture`, `web_next_inspect`, `web_breakpoint_set`, `web_debug_control`, `web_debug_evaluate`, `web_repro_record`, `web_fix_verify`, and `web_session_close`.

The React adapter consumes the automatically injected, bounded `window.__WEB_DEBUG_REACT__` bridge. It returns component nodes with name, source location when available, props, hook state, render count, inferred render cause, prop/hook change details, optional actual/self/tree durations, and a flat flamegraph view with depth. Render causes are inferred from serialized prop/hook signatures across Fiber alternates and are not a substitute for the full React DevTools profiler. The Vite adapter reads the bounded graph/HMR summary, transformed-code diff, transform provenance, and source-map summary served by `webDebugVitePlugin()` at `/__web_debug/vite`. The Safari adapter uses W3C WebDriver through local `safaridriver` or an explicit endpoint for actions, DOM, screenshots, and explicitly side-effect-enabled evaluation; WebDriver BiDi supplies console/network events where implemented, with a disclosed Performance Resource Timing fallback, while JavaScript debugger parity is not claimed and every visible profile is marked non-isolated. The replay timeline retains up to 50 sanitised frames, and `web_replay_seek` can return a frame or replay safe retained actions without exposing sanitised inputs. The fixture uses React 19.2.8, Vite 7.3.6, and `@vitejs/plugin-react` 5.1.1 because that combination satisfies the current Vitest peer range without forced dependency resolution. The Next adapter uses Next 16.3.3’s `/_next/mcp` endpoint, calls only the allowlisted metadata tools documented in `src/adapters/next.ts`, reads a bounded log tail only after the returned path resolves inside the detected project root, normalizes request-insight spans into bounded `requestTraces`, and links the matching trace into observed Server Action execution evidence through the existing single facade.

## Revision History

- (2026-08-26 21:12Z) Change: Recorded remote-target policy commit 0fbee2d and local policy verification. Reason: Make remote CDP control explicit, bounded, and visibly non-isolated.
- (2026-08-26 21:16Z) Change: Recorded final cross-stack validation with literal Safari and external-target blockers. Reason: Close the requested bounded suite milestone without inferring unsupported evidence.

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
- (2026-08-26 20:49Z) Change: Recorded Vite transform-diff commit `86ff0da` and live verification. Reason: Preserve bounded HMR source provenance before Safari and replay work.
- (2026-08-26 21:00Z) Change: Recorded Safari WebDriver commit `8604c77` and the host permission blocker. Reason: Preserve real Safari transport coverage without claiming CDP debugger parity.
- (2026-08-26 21:06Z) Change: Recorded replay timeline commit `4ddf88e` and live verification. Reason: Preserve captured-state seek while keeping state restoration explicitly out of scope.
- (2026-08-26 22:10Z) Change: Recorded successful external Safari WebDriver smoke after the macOS automation setting was enabled. Reason: Replace the prior host-permission blocker with verified local Safari evidence.
- (2026-08-27 01:42Z) Change: Recorded Safari BiDi commit `9d72ae2` and live evidence. Reason: Add bounded console/network subscription with an explicit Performance Resource Timing fallback while preserving the Safari debugger boundary.
- (2026-08-27 01:46Z) Change: Recorded the absence of an approved external CDP host and discarded the normalized loopback alias experiment as external evidence. Reason: Keep remote-target status literal and fail closed.
- (2026-08-27 01:47Z) Change: Recorded the current certification blocker: `harness.py certify` returns `CERT001` because no caller-supplied HMAC key or attestation overlay exists. Reason: Do not fabricate harness or production authority.
- (2026-08-27 01:56Z) Change: Recorded React flamegraph commit `f9a4b73` and live verification. Reason: Make duration/cause evidence directly consumable as a bounded flamegraph view.
- (2026-08-27 01:58Z) Change: Recorded Safari profile-boundary commit `c03abaa` and endpoint-policy test commit `954de70`. Reason: Correctly expose visible Safari profile non-isolation and fail closed for remote WebDriver endpoints.
- (2026-08-27 02:04Z) Change: Recorded Safari BiDi runtime guard commit `7d57a81`. Reason: Preserve the Node >=20 package contract by degrading optional BiDi support explicitly when global WebSocket is unavailable.
- (2026-08-27 02:10Z) Change: Recorded Next request-trace linkage commit `f0e28f0` and live verification. Reason: Make server request tracing directly inspectable and connect observed `Next-Action` requests to their server spans without duplicating an MCP catalog.
- (2026-08-27 02:16Z) Change: Recorded Safari BiDi fallback test commit `1f587cc`. Reason: Verify explicit degradation when the Node runtime lacks WebSocket support.
- (2026-08-27 02:17Z) Change: Recorded native Next trace contract commit `a866284`. Reason: Keep the project gate aligned with the normalized server trace evidence.
- (2026-08-27 15:30Z) Change: Recorded the public README and GitHub metadata positioning update. Reason: Make the project’s purpose, differentiation, value, use cases, and limits discoverable before installation.
- (2026-08-27) Change: Added the `web-debug` Codex/ChatGPT plugin wrapper, bundled `web-debug-workflow` skill, local stdio MCP configuration, repository marketplace entry, and install documentation. Reason: Provide the AWS Agent Toolkit-style single-install experience while preserving the standalone `web-debug-mcp` server for other MCP clients.
- (2026-08-27) Change: Expanded the README with explicit plugin installation, bundled-MCP behavior, first-launch requirements, and post-install usage steps. Reason: Make the single-install experience understandable to users without requiring separate MCP configuration.
- (2026-08-27) Change: Added the Claude Code plugin manifest and root marketplace catalog, plus Claude-specific README installation and namespaced-skill guidance. Reason: Make the same single-install plugin available to Claude Code while retaining the shared MCP server and skill.
