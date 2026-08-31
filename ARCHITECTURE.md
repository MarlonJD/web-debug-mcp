# Architecture

## System context

`web-debug-mcp` is a local MCP server that gives an agent a bounded view of a running web application. The repository also packages that server as an optional Codex/ChatGPT/Claude Code plugin under `plugins/web-debug/`; the plugin adds installation metadata and separately routed debugging and qualification workflow guidance without introducing a second MCP implementation. The agent asks for a project capability report, starts an explicitly selected Chromium or Safari session, performs small same-origin actions, and receives evidence that joins browser state with debugger/framework signals where the selected browser exposes them.

The server is a development tool. It runs over MCP stdio, launches or attaches to local Chromium, and stores screenshots under a temporary per-session artifact directory. It does not host an HTTP service for remote clients and does not modify application source during a debug session.

## Repository map

| Path | Responsibility | Owner or update trigger |
| --- | --- | --- |
| `src/index.ts` | MCP server metadata, tool schemas, and request boundary | Platform Engineering; update when public tools change |
| `src/domain/types.ts` | Typed project, session, browser, debugger, evidence, and scenario contracts | Platform Engineering; update before shape changes |
| `src/domain/wire-schemas.ts` | Concrete tool-specific public result schemas | Platform Engineering; update atomically with public result shapes |
| `src/core/capabilities.ts` | Safe marker-based project detection | Platform Engineering; update when supported stack markers change |
| `src/core/session-manager.ts` | Session ownership, lifecycle, scenario storage, and verification orchestration | Platform Engineering; update with lifecycle or policy changes |
| `src/core/session-lifecycle.ts`, `session-replay.ts`, `session-evidence.ts` | Focused lifecycle projection, replay state, capture profiles/cursors, evidence bounds | Platform Engineering; update behind the manager façade |
| `src/core/scenario-contract.ts`, `scenario-verification.ts` | Scenario normalization/hash/public projection and verification aggregation | Platform Engineering; update with scenario semantics |
| `src/core/operation-context.ts`, `private-values.ts` | Shared cancellation/deadline and private-value handling | Platform Engineering; update with reliability or privacy policy |
| `src/core/redaction.ts` | Sensitive-key, URL, text, and output bounds | Platform Engineering; update after a privacy finding or new data source |
| `src/core/origin-policy.ts` | Exact top-level origin parsing and stable navigation errors | Platform Engineering; update with navigation authority changes |
| `src/core/http.ts` | Streaming byte caps for local framework and WebDriver responses | Platform Engineering; update with transport limits |
| `src/core/mcp-response.ts` | Canonical structured tool envelopes and total MCP result budget | Platform Engineering; update with output-schema changes |
| `src/core/artifact-store.ts` | Opaque, non-enumerable, identity-revalidated screenshot resources | Platform Engineering; update with artifact delivery or retention changes |
| `src/core/doctor.ts` | Read-only first-run project/browser/target readiness checks | Platform Engineering; update with setup requirements |
| `src/core/version.ts` | Package-derived runtime and cleanup identity | Platform Engineering; update only if package metadata ownership changes |
| `src/core/auth-state.ts` | Contained, bounded, no-follow disposable Playwright storage-state validation | Platform Engineering; update with auth fixture policy |
| `src/core/aggregation.ts` | Pure probe → viewport → attempt → phase aggregation and deterministic pruning | Platform Engineering; update with scenario/matrix contract changes |
| `src/core/process-registry.ts` | Per-user locked process registry, identity checks, idle TTL, idempotent shutdown, and cleanup reports | Platform Engineering; update with lifecycle policy changes |
| `src/core/evidence.ts` | Redacted evidence bundle composition | Platform Engineering; update when evidence consumers change |
| `src/adapters/browser.ts` | Browser transport interface | Platform Engineering; update when an adapter capability changes |
| `src/adapters/chromium.ts` | Playwright/CDP browser and JavaScript debugger adapter | Platform Engineering; update with Chromium protocol behavior |
| `src/adapters/safari.ts` | Safari WebDriver/BiDi browser/action/evidence adapter | Platform Engineering; update with WebDriver or BiDi behavior |
| `src/adapters/react.ts` | Injected React runtime bridge reader | Platform Engineering; update with the bridge contract |
| `src/adapters/react-bridge.ts` | Development-page React DevTools hook bridge script | Platform Engineering; update with the bridge contract |
| `src/adapters/angular.ts` / `angular-bridge.ts` | Bounded Angular documented-global DOM-host runtime snapshot | Platform Engineering; update with the Angular development contract |
| `src/adapters/vue.ts` / `vue-bridge.ts` | Bounded Vue 3 DevTools-hook runtime snapshot | Platform Engineering; update with the pinned Vue hook contract |
| `src/adapters/next.ts` | Next.js development MCP/SSE runtime metadata reader | Platform Engineering; update with the `/_next/mcp` contract |
| `src/adapters/vite.ts` | Vite module graph/HMR metadata reader | Platform Engineering; update with the local endpoint contract |
| `src/adapters/vite-plugin.ts` | Vite dev-server middleware and hot-update bridge | Platform Engineering; update with Vite plugin API behavior |
| `plugins/web-debug/.codex-plugin/plugin.json` | Codex/ChatGPT plugin identity and install metadata | Platform Engineering; update with plugin packaging changes |
| `plugins/web-debug/.claude-plugin/plugin.json` | Claude Code plugin identity and install metadata | Platform Engineering; update with Claude Code packaging changes |
| `plugins/web-debug/.mcp.json` | Bundled stdio MCP server launch configuration | Platform Engineering; update with MCP distribution changes |
| `plugins/web-debug/skills/web-debug-workflow/SKILL.md` | Agent routing, handoff, workflow, and safety guidance for the bundled tools | Platform Engineering; update with workflow or policy changes |
| `plugins/web-debug/skills/manual-parity-qualification/SKILL.md` | Reviewed manual-parity discovery, native-runner ownership, crosswalk, and verdict guidance | Platform Engineering; update with qualification workflow or policy changes |
| `plugins/web-debug/skills/manual-parity-qualification/scripts/validate-manual-parity.mjs` | Read-only structural validation for qualification catalogs, crosswalks, and run records | Platform Engineering; update with qualification schema changes |
| `.agents/plugins/marketplace.json` | Repository marketplace entry for the Web Debug plugin | Platform Engineering; update when plugin availability or ordering changes |
| `.claude-plugin/marketplace.json` | Claude Code marketplace entry for the Web Debug plugin | Platform Engineering; update when Claude Code availability or ordering changes |
| `fixtures/vanilla/` | Framework-neutral deterministic browser target | Test ownership; update when a reproducible behavior contract changes |
| `fixtures/react-vite/` | React component/state fixture served by Vite | Test ownership; update when framework evidence changes |
| `fixtures/vue-vite/` | Vue 3 component/state fixture served by Vite | Test ownership; update when Vue hook or Vite evidence changes |
| `fixtures/angular/` | Angular 21 CLI development component/state fixture | Test ownership; update when Angular documented-global evidence changes |
| `fixtures/next/` | Next.js App Router, client, and route-handler fixture | Test ownership; update when Next runtime evidence changes |
| `fixtures/complex-vite/` | Multi-state React/Vite dashboard with deterministic async and responsive repair markers | Demo/test ownership; update when repair scenarios or expected layout invariants change |
| `scripts/harness-check.mjs` | Project-native structural and command contract check | Platform Engineering; update when repository invariants change |
| `scripts/live-react-vite-smoke.mjs` | Live React/Vite breakpoint and verification smoke | Platform Engineering; update when the fixture flow changes |
| `scripts/live-next-smoke.mjs` | Live Next runtime MCP and browser smoke | Platform Engineering; update when the fixture flow changes |
| `scripts/live-safari-smoke.mjs` | Live Safari WebDriver action and evidence smoke | Platform Engineering; update when Safari transport or fixture behavior changes |
| `scripts/demo-compare.mjs` | Before/after baseline and MCP timing/evidence comparison across local fixtures | Platform Engineering; update when demo scenarios or metrics change |
| `scripts/agent-eval.mjs` | Frozen manual agent repair-task contracts and metric fields | Platform Engineering; update when task graders change |
| `scripts/lib/managed-process.mjs` | Bounded fixture readiness and awaited command-owned teardown | Platform Engineering; update with smoke-process lifecycle changes |
| `scripts/serve-complex-vite.mjs` | Serve the isolated complex repair fixture through Vite | Demo/test ownership; update when the temporary fixture runtime changes |
| `docs/` | Durable architecture, security, reliability, planning, and harness knowledge | Platform Engineering; update with boundary changes |

## Components and boundaries

`src/index.ts` is the only MCP tool boundary. It validates inputs and each tool's advertised output with Zod, delegates to `SessionManager`, and returns one canonical structured envelope plus a bounded text preview. It maps scenario attempts to MCP progress notifications and registers opaque screenshot resources through `ArtifactStore`; it does not access Playwright directly. Package, MCP handshake, process-registry, cleanup, and bundled plugin runtime identity derive from final `0.6.0`; clients that register a local checkout under a distinct name must not enable both registrations in one session.

`SessionManager` owns only active in-memory sessions and limits them to eight. It remains the single exported policy façade, while focused modules own lifecycle projection, cancellation helpers, replay state, evidence projection/cursors, scenario contracts, and verification aggregation. The manager validates project-contained auth state and elevated-origin settings before browser creation, creates temporary artifact directories, invokes the browser adapter, and serializes one mutating operation—including Next inspection—per session through an abortable lease. Checks-only attempts keep only URL/DOM/console observations; verification resets replay frames per attempt and retains one capture-only frame tagged with its attempt id. Closing destroys private start options, auth state, actions, replay/cursors, target identity, and secrets before deleting the managed record; at most 32 sanitized closed-session tombstones preserve bounded status/idempotency. Process-registry session counts are reconciled from this active map in the same locked request-finalization update. There is intentionally no YAML/JSON scenario serializer, importer, or standalone runner; durable cross-session and CI regression coverage belongs in repository-native tests. Matrix units use fresh sequential candidates and never replace canonical session state.

The plugin's `manual-parity-qualification` skill is an orchestration and reporting layer outside `SessionManager`. It can derive candidate requirements, require explicit review, map approved cases to repository-native tests, and validate non-executable qualification metadata. It does not add an MCP tool, reuse adaptive bug-reproduction retries for business mutations, perform arbitrary authenticated read-backs, persist MCP scenarios, or treat Web Debug diagnostics as qualification PASS. The target repository owns actors, setup/reset, native Playwright/API/domain execution, and durable artifacts.

`ChromiumAdapter` owns Playwright and CDP details. It can launch a browser only when an executable path is explicit, or attach only when a CDP endpoint is explicit. Remote CDP endpoints are rejected unless `allowRemote` is true, and attached targets are marked non-isolated with exact target identity metadata. The selected target installs CDP `Fetch` interception before the first requested navigation and revalidates main-frame events/final state on every operation; redirects and action navigation remain on the originally selected origin, while ordinary cross-origin subresources and subframes are not blocked. Because popup-first requests may not yet have a Playwright frame, the adapter also installs one context-wide fallback route that aborts frame-less document requests and otherwise falls through. That fallback temporarily disables HTTP cache for the attached context, so sibling pages can observe cache behavior changes until close even though they are not navigated or injected. Secondary pages are closed. React instrumentation uses a target-scoped CDP script identifier that is removed on detach. Explicit loopback TLS/auth modes retain the stronger exact-origin request/WebSocket/page guard and blocked service workers; auth-seeded capture suppresses screenshots. `SafariAdapter` owns W3C WebDriver requests to local `safaridriver` or an explicit endpoint; it supports CSS-only actions/probes, deterministic interaction actions, DOM, screenshots, explicit JavaScript evaluation, WebDriver BiDi console/network subscriptions, and a disclosed Performance Resource Timing fallback. Safari checks exact window ownership and final top-level origin before and after operations; because W3C WebDriver lacks reliable pre-request interception, an escaped target is post-navigation quarantined and the adapter is closed. Semantic locators, computed accessibility, TLS bypass, auth seeding, and matrices return stable unavailable errors. Chromium records metadata for console and network events, never response bodies, and both adapters expose only the operations defined by `BrowserAdapter`.

Page-runtime intelligence is selected from private detected-framework metadata. Chromium registers separate target-scoped React, Angular, and Vue bridge scripts before navigation, stores every CDP identifier, removes every identifier on close, and snapshots selected runtimes concurrently under one optional-enrichment budget. React retains bounded DevTools-hook commit/render evidence. Angular uses documented development `window.ng` globals to build a DOM-host component/state view without private Ivy arrays, getters, methods, signals, injectors, or profiler mutation. Vue 3 safely chains the exact DevTools hook event contract and never falls back to DOM-private `__vue*` properties. Vite and Next HTTP bodies remain bounded. Angular CLI's encapsulated Vite server is not the Web Debug Vite endpoint; only actual Vite projects with `webDebugVitePlugin()` receive module/HMR provenance. Nullable or unavailable framework fields remain warnings, not discovery failures.

## Data and control flow

1. `web_project_detect` distinguishes confirmed application markers from weak dependency candidates. Only direct config/entry/script/runtime-dependency combinations select framework adapters; declared workspace candidates are bounded and never auto-selected.
2. `web_session_start` allocates a session ID and artifact directory, starts the selected adapter, then records separate `projectCapabilities` and live negotiated `runtimeCapabilities` for Chromium launch/attach or Safari WebDriver/BiDi.
3. Browser actions are bounded and same-origin. The existing action union carries navigate, click, fill, press, select, check, hover, scroll, observable wait, and reload behavior without adding public tools. Console, request, response, and page-error observers retain bounded metadata in memory.
4. `web_breakpoint_set` and `web_debug_control` use the local Chromium CDP Debugger domain. `web_debug_evaluate` uses CDP Runtime or explicitly side-effect-enabled Safari WebDriver evaluation; side effects are rejected by default.
5. `web_issue_capture` returns capture schema 4: compact `summary` by default, explicit `full`, selected `include`, or cursor-based `delta`. Screenshot pixels require explicit full/inclusion and local paths never enter capture data. Private scenario verification continues to use authoritative evidence schema 4; checks-only snapshots omit framework enrichment and paused snapshots use explicit last-known/stale caches.
6. If the project has Vite capability, `ViteAdapter` queries the local `__web_debug/vite` endpoint during capture and adds its bounded module graph/HMR metadata to the browser evidence.
7. If the project has Next capability, `NextAdapter` queries the local `/_next/mcp` endpoint during capture and adds its bounded runtime metadata to the browser evidence.
8. If a Next inspection is requested, `web_next_inspect` acquires the same exclusive abortable lease, calls only `compile_route` or `get_server_action_by_id` with bounded arguments, and returns redacted results.
9. After each browser action and evidence capture, `SessionManager` stores a bounded, sanitised replay frame; `web_replay_seek` returns one retained frame and can replay only safe retained actions when `restore: true`.
10. `web_repro_record` executes a bounded adaptive pre-fix phase, stores a session-owned private scenario plus a sanitized public contract, and retains one representative baseline evidence bundle. `web_fix_verify` reuses only that same live session/provenance and evaluates the complete polarity-aware failure signature. Both report fixed-scale monotonic progress when requested. A `verified` result requires authoritative full-capture agreement; drift or unavailable representative evidence is inconclusive.
11. `mcp-response.ts` serializes the canonical structured envelope once, rejects total overflow, and asks `ArtifactStore` to register at most two contained screenshots. Small pixels may be inline; resource reads re-open with no-follow identity checks and a separate 4 MiB cap.

## Runtime topology

```text
Codex/ChatGPT/Claude Code plugin or another MCP client
      │ stdio
      ▼
web-debug-mcp process
      ├── SessionManager
      ├── ProcessRegistry (owner-only lock/heartbeat/TTL)
      ├── ArtifactStore (opaque bounded screenshot resources)
      └── Browser adapters
            ├── ChromiumAdapter ── Playwright/CDP ── Chromium
            └── SafariAdapter ── WebDriver/BiDi ── visible Safari
                                      │
                                      └── local web app
```

The deterministic fixtures use `scripts/serve-fixture.mjs`, `scripts/serve-react-vite.mjs`, and `scripts/serve-next.mjs` on loopback ports. Shared smoke helpers bound readiness, reject every early exit, await SIGTERM, and escalate only their command-owned child. A live adapter requires either `WEB_DEBUG_CHROME_EXECUTABLE_PATH` or a caller-provided `cdpEndpoint`. `doctor` checks those explicit inputs without launching a browser. Temporary screenshots remain outside the project and survive default close for inspection; `artifactPolicy: "delete"` removes only the exact owned session directory.

Production, hosted MCP, and cloud deployment environments are intentionally out of scope for this increment. Remote browser attachment exists behind explicit opt-in, but an approved external target is still required for live evidence.

The package entry point accepts no arguments for MCP transport, `doctor` options for bounded read-only readiness, or `cleanup [--all-idle]` for registry-authorized process cleanup. All MCP requests, including status/detection and failures, contribute to process activity accounting. EOF, transport close, signals, TTL, and cleanup share one idempotent shutdown path.

## Cross-cutting concerns

- Security and privacy rules live in [`docs/SECURITY.md`](docs/SECURITY.md).
- Failure handling and cleanup rules live in [`docs/RELIABILITY.md`](docs/RELIABILITY.md).
- Runtime setup and isolation live in [`docs/agent-harness/environment-contract.md`](docs/agent-harness/environment-contract.md).
- Output labels and evidence expectations live in [`docs/agent-harness/output-contract.md`](docs/agent-harness/output-contract.md).
- The public behavior contract is described in [`README.md`](README.md).

## Mechanically enforced invariants

| Invariant | Enforcer | Recovery guidance |
| --- | --- | --- |
| MCP tools expose one facade and expected names | `scripts/harness-check.mjs` | Restore the registered tool names in `src/index.ts` or update the contract deliberately |
| Source code does not write protocol diagnostics to stdout | `scripts/harness-check.mjs` | Use stderr for diagnostics; keep stdout reserved for MCP transport |
| Required source, fixture, docs, and command surfaces exist | `scripts/harness-check.mjs` | Restore the missing path or update the project contract with evidence |
| Browser targets are loopback-only by default | `ChromiumAdapter` tests and input policy | Pass explicit `allowRemote` only for an authorized future use case and update security evidence |
| Top-level origin never silently rebases after redirects or actions | Page-scoped Chromium route, Safari window/final-URL quarantine, and adapter policy tests | Close the escaped session; do not broaden origin authority or block ordinary subresources |
| Remote CDP attachment requires explicit opt-in and is marked non-isolated | `ChromiumAdapter` endpoint policy and `BrowserTarget.remote` | Keep remote endpoints disabled by default and add an approved target-specific test before changing the policy |
| Safari WebDriver targets are visible and non-isolated; unsupported debugger domains are explicit | `SafariAdapter` target metadata, BiDi warnings, and Safari smoke | Keep Safari profile warnings and use the official Safari 27 MCP externally when browser-native debugger parity is needed |
| Sensitive values are redacted before evidence leaves the adapter | `redaction.test.ts`, React bridge serialization, and `composeEvidence` | Add a regression test for any newly observed sensitive shape; colliding screenshot handles become null without copying artifacts |
| Angular/Vue runtime evidence is bounded and observational | Bridge tests, exact fixtures, live smokes, and evidence pruning | Keep getters/functions/private runtime storage unavailable; fail optional enrichment to a warning |
| Session count, scenario/attempt retention, verification deadlines, and browser wait time are bounded | `SessionManager` and adapter constants | Use a smaller bounded operation or change the limit with a reliability review |
| Every public tool has one output schema, effect annotation, and total result budget | MCP routing/response tests and `scripts/harness-check.mjs` | Correct the canonical table/envelope; do not add text-only fallback shapes |
| Vite module graph and transform diff data is local, bounded, and read-only | `ViteAdapter`, `vite-plugin.ts`, transform cache, and React/Vite smoke | Keep the endpoint loopback-only and add bounds/tests for new module or diff fields |

## Architecture decisions

The suite uses one MCP surface with internal adapters because Codex should see a stable workflow rather than four overlapping server catalogs. The first adapter is Chromium/CDP because it is the smallest route to browser state, JavaScript execution, and debugger control. Framework adapters will be promoted only after the core evidence and lifecycle contracts have deterministic fixtures.
