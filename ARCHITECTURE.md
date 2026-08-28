# Architecture

## System context

`web-debug-mcp` is a local MCP server that gives an agent a bounded view of a running web application. The repository also packages that server as an optional Codex/ChatGPT/Claude Code plugin under `plugins/web-debug/`; the plugin adds installation metadata and workflow guidance without introducing a second MCP implementation. The agent asks for a project capability report, starts an explicitly selected Chromium or Safari session, performs small same-origin actions, and receives evidence that joins browser state with debugger/framework signals where the selected browser exposes them.

The server is a development tool. It runs over MCP stdio, launches or attaches to local Chromium, and stores screenshots under a temporary per-session artifact directory. It does not host an HTTP service for remote clients and does not modify application source during a debug session.

## Repository map

| Path | Responsibility | Owner or update trigger |
| --- | --- | --- |
| `src/index.ts` | MCP server metadata, tool schemas, and request boundary | Platform Engineering; update when public tools change |
| `src/domain/types.ts` | Typed project, session, browser, debugger, evidence, and scenario contracts | Platform Engineering; update before shape changes |
| `src/core/capabilities.ts` | Safe marker-based project detection | Platform Engineering; update when supported stack markers change |
| `src/core/session-manager.ts` | Session ownership, lifecycle, scenario storage, and verification orchestration | Platform Engineering; update with lifecycle or policy changes |
| `src/core/redaction.ts` | Sensitive-key, URL, text, and output bounds | Platform Engineering; update after a privacy finding or new data source |
| `src/core/auth-state.ts` | Contained, bounded, no-follow disposable Playwright storage-state validation | Platform Engineering; update with auth fixture policy |
| `src/core/aggregation.ts` | Pure probe → viewport → attempt → phase aggregation and deterministic pruning | Platform Engineering; update with scenario/matrix contract changes |
| `src/core/process-registry.ts` | Per-user locked process registry, identity checks, idle TTL, idempotent shutdown, and cleanup reports | Platform Engineering; update with lifecycle policy changes |
| `src/core/evidence.ts` | Redacted evidence bundle composition | Platform Engineering; update when evidence consumers change |
| `src/adapters/browser.ts` | Browser transport interface | Platform Engineering; update when an adapter capability changes |
| `src/adapters/chromium.ts` | Playwright/CDP browser and JavaScript debugger adapter | Platform Engineering; update with Chromium protocol behavior |
| `src/adapters/safari.ts` | Safari WebDriver/BiDi browser/action/evidence adapter | Platform Engineering; update with WebDriver or BiDi behavior |
| `src/adapters/react.ts` | Injected React runtime bridge reader | Platform Engineering; update with the bridge contract |
| `src/adapters/react-bridge.ts` | Development-page React DevTools hook bridge script | Platform Engineering; update with the bridge contract |
| `src/adapters/next.ts` | Next.js development MCP/SSE runtime metadata reader | Platform Engineering; update with the `/_next/mcp` contract |
| `src/adapters/vite.ts` | Vite module graph/HMR metadata reader | Platform Engineering; update with the local endpoint contract |
| `src/adapters/vite-plugin.ts` | Vite dev-server middleware and hot-update bridge | Platform Engineering; update with Vite plugin API behavior |
| `plugins/web-debug/.codex-plugin/plugin.json` | Codex/ChatGPT plugin identity and install metadata | Platform Engineering; update with plugin packaging changes |
| `plugins/web-debug/.claude-plugin/plugin.json` | Claude Code plugin identity and install metadata | Platform Engineering; update with Claude Code packaging changes |
| `plugins/web-debug/.mcp.json` | Bundled stdio MCP server launch configuration | Platform Engineering; update with MCP distribution changes |
| `plugins/web-debug/skills/web-debug-workflow/SKILL.md` | Agent routing, handoff, workflow, and safety guidance for the bundled tools | Platform Engineering; update with workflow or policy changes |
| `.agents/plugins/marketplace.json` | Repository marketplace entry for the Web Debug plugin | Platform Engineering; update when plugin availability or ordering changes |
| `.claude-plugin/marketplace.json` | Claude Code marketplace entry for the Web Debug plugin | Platform Engineering; update when Claude Code availability or ordering changes |
| `fixtures/vanilla/` | Framework-neutral deterministic browser target | Test ownership; update when a reproducible behavior contract changes |
| `fixtures/react-vite/` | React component/state fixture served by Vite | Test ownership; update when framework evidence changes |
| `fixtures/next/` | Next.js App Router, client, and route-handler fixture | Test ownership; update when Next runtime evidence changes |
| `fixtures/complex-vite/` | Multi-state React/Vite dashboard with deterministic async and responsive repair markers | Demo/test ownership; update when repair scenarios or expected layout invariants change |
| `scripts/harness-check.mjs` | Project-native structural and command contract check | Platform Engineering; update when repository invariants change |
| `scripts/live-react-vite-smoke.mjs` | Live React/Vite breakpoint and verification smoke | Platform Engineering; update when the fixture flow changes |
| `scripts/live-next-smoke.mjs` | Live Next runtime MCP and browser smoke | Platform Engineering; update when the fixture flow changes |
| `scripts/live-safari-smoke.mjs` | Live Safari WebDriver action and evidence smoke | Platform Engineering; update when Safari transport or fixture behavior changes |
| `scripts/demo-compare.mjs` | Before/after baseline and MCP timing/evidence comparison across local fixtures | Platform Engineering; update when demo scenarios or metrics change |
| `scripts/serve-complex-vite.mjs` | Serve the isolated complex repair fixture through Vite | Demo/test ownership; update when the temporary fixture runtime changes |
| `docs/` | Durable architecture, security, reliability, planning, and harness knowledge | Platform Engineering; update with boundary changes |

## Components and boundaries

`src/index.ts` is the only public MCP boundary. It validates inputs with Zod, delegates to `SessionManager`, and serializes structured results or bounded errors. It does not access Playwright directly. The Web Debug plugin for Codex, ChatGPT, and Claude Code points at this same server through its root `.mcp.json`; it does not duplicate tools or browser policy.

`SessionManager` owns one in-memory record per session and limits active sessions to eight. It validates project-contained auth state and elevated-origin settings before browser creation, creates temporary artifact directories, invokes the browser adapter, serializes one mutating operation per session through an abortable lease, records a capped replay timeline, and composes evidence. Checks-only attempts keep only URL/DOM/console observations; verification resets replay frames per attempt and retains one capture-only frame tagged with its attempt id. It is the policy boundary for session lookup, replay seek, scenario ownership, exact locator/checkpoint/matrix contracts, pure bounded aggregation, adaptive baseline/fix state machines, provenance, redaction, and close behavior. Scenarios are capped at ten per session and are purged with their private executable actions on close. Matrix units use fresh sequential candidates and never replace canonical session state.

`ChromiumAdapter` owns Playwright and CDP details. It can launch a browser only when an executable path is explicit, or attach only when a CDP endpoint is explicit. Remote CDP endpoints are rejected unless `allowRemote` is true, and attached targets are marked non-isolated with exact target identity metadata. Isolated Chromium launch sessions accept a bounded explicit viewport and expose exact CSS/role/text/label/test-id locators through fresh live probes. Explicit loopback TLS/auth modes install a request/WebSocket/page guard before first page creation and block service workers; auth-seeded capture suppresses screenshots. Accessibility enrichment uses normalized bounded CDP AX nodes and suggestions whose uniqueness is only `uniqueAtCapture`. Attached Chromium keeps the exact selected target, clears only adapter-owned observers, and never reconnects through an arbitrary first tab. `SafariAdapter` owns W3C WebDriver requests to local `safaridriver` or an explicit endpoint; it supports CSS-only actions/probes, DOM, screenshots, explicit JavaScript evaluation, WebDriver BiDi console/network subscriptions, and a disclosed Performance Resource Timing fallback. Semantic locators, computed accessibility, TLS bypass, auth seeding, and matrices return stable unavailable errors. Safari targets are always marked non-isolated because the visible Safari profile is not controlled as a fresh isolated profile; its JavaScript debugger remains unavailable. Chromium records metadata for console and network events, never response bodies, and both adapters expose only the operations defined by `BrowserAdapter`.

React intelligence is available through a development bridge at `window.__WEB_DEBUG_REACT__`. `ChromiumAdapter` injects the bridge into the isolated browser context before application scripts run, and `ReactAdapter` reads bounded component nodes, props, hook values, source locations, render counts, commit summaries, profiler durations, a flat flamegraph view, and inferred render causes only when React commits are observed. `ViteAdapter` reads the fixture’s local read-only module graph/HMR endpoint and bounded transform diffs/provenance/source-map summaries, while `vite-plugin.ts` owns the Vite server middleware, transform snapshots, and hot-update summary. `NextAdapter` speaks JSON-RPC over the Next development server’s `/_next/mcp` SSE endpoint, records project metadata, route discovery, compilation issues, request insights, normalized request traces, and log path, reads only a bounded redacted tail when that log resolves inside the detected project root, and handles explicit route compilation, Server Action lookup, and request-linked action execution evidence through the existing facade. These are bounded development signals rather than full React DevTools, source-map debugger, or distributed server-trace parity; nullable or unavailable fields remain warnings, not discovery failures.

## Data and control flow

1. `web_project_detect` reads only known marker files and `package.json` dependency sections.
2. `web_session_start` detects the project, allocates a session ID and temporary artifact directory, then starts the Chromium adapter with an optional bounded viewport.
3. Browser actions are bounded and same-origin. Console, request, response, and page-error observers retain bounded metadata in memory.
4. `web_breakpoint_set` and `web_debug_control` use the local Chromium CDP Debugger domain. `web_debug_evaluate` uses CDP Runtime or explicitly side-effect-enabled Safari WebDriver evaluation; side effects are rejected by default.
5. `web_issue_capture` collects DOM, console, network, screenshot, paused-frame, and optional React bridge data, then applies the redaction policy again before returning the evidence bundle. Attempt checks-only snapshots return only URL/DOM/console observations and omit network, screenshot, React, and debugger enrichment; verification may retain the adapter-owned network buffer until that attempt's authoritative capture.
6. If the project has Vite capability, `ViteAdapter` queries the local `__web_debug/vite` endpoint during capture and adds its bounded module graph/HMR metadata to the browser evidence.
7. If the project has Next capability, `NextAdapter` queries the local `/_next/mcp` endpoint during capture and adds its bounded runtime metadata to the browser evidence.
8. If a Next inspection is requested, `web_next_inspect` calls only `compile_route` or `get_server_action_by_id` with bounded arguments and returns redacted results.
9. After each browser action and evidence capture, `SessionManager` stores a bounded, sanitised replay frame; `web_replay_seek` returns one retained frame and can replay only safe retained actions when `restore: true`.
10. `web_repro_record` executes a bounded adaptive pre-fix phase, stores a session-owned private scenario plus a sanitized public contract, and retains one representative baseline evidence bundle. `web_fix_verify` reuses only that same live session/provenance, starts fresh launch-owned Chromium attempts where possible, replays private actions, and evaluates the complete polarity-aware failure signature together with separated acceptance/regression checks. A `verified` result requires authoritative full-capture agreement for the decisive post-fix attempt; drift or unavailable representative evidence is inconclusive. It returns `verified`, `failed`, or `inconclusive` with per-attempt summaries and decisive rates; screenshots and framework bundles are representative evidence only.
10. `web_repro_record` executes a bounded adaptive pre-fix phase, stores a session-owned private scenario plus a sanitized public contract, and retains one representative baseline evidence bundle. Named checkpoint probes run at completed-action offsets, and multiple declared viewports run through sequential ephemeral Chromium candidates with `failureViewports` evaluated by exact names. `web_fix_verify` reuses only that same live session/provenance, replays private actions, and evaluates the complete polarity-aware failure signature together with separated acceptance/regression/checkpoint observations. A `verified` result requires authoritative full-capture agreement for the decisive post-fix attempt; drift or unavailable representative evidence is inconclusive. It returns `verified`, `failed`, or `inconclusive` with lightweight phase/attempt/viewport summaries and decisive rates; screenshots and framework bundles are representative evidence only.

## Runtime topology

```text
Codex/ChatGPT/Claude Code plugin or another MCP client
      │ stdio
      ▼
web-debug-mcp process
      ├── SessionManager
      ├── ProcessRegistry (owner-only lock/heartbeat/TTL)
      └── Browser adapters
            ├── ChromiumAdapter ── Playwright/CDP ── Chromium
            └── SafariAdapter ── WebDriver/BiDi ── visible Safari
                                      │
                                      └── local web app
```

The deterministic fixtures use `scripts/serve-fixture.mjs`, `scripts/serve-react-vite.mjs`, and `scripts/serve-next.mjs` on loopback ports. The React/Vite fixture’s `vite.config.ts` installs the local module-graph middleware. A live adapter requires either `WEB_DEBUG_CHROME_EXECUTABLE_PATH` or a caller-provided `cdpEndpoint`. `scripts/demo-compare.mjs` runs fresh headless Chromium contexts through a raw Playwright baseline and the `SessionManager` workflow, then reports timing and evidence-coverage differences without changing fixture source. Temporary screenshots remain outside the project and survive session close so the caller can inspect evidence; the operating system owns eventual temporary-directory cleanup.

Production, hosted MCP, and cloud deployment environments are intentionally out of scope for this increment. Remote browser attachment exists behind explicit opt-in, but an approved external target is still required for live evidence.

The stdio entry point accepts no arguments for MCP transport or `cleanup [--all-idle]` for registry-authorized process cleanup. All MCP requests, including read-only status/detection and failures, contribute to process activity accounting. EOF, transport close, signals, TTL, and cleanup share one idempotent shutdown path.

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
| Remote CDP attachment requires explicit opt-in and is marked non-isolated | `ChromiumAdapter` endpoint policy and `BrowserTarget.remote` | Keep remote endpoints disabled by default and add an approved target-specific test before changing the policy |
| Safari WebDriver targets are visible and non-isolated; unsupported debugger domains are explicit | `SafariAdapter` target metadata, BiDi warnings, and Safari smoke | Keep Safari profile warnings and use the official Safari 27 MCP externally when browser-native debugger parity is needed |
| Sensitive values are redacted before evidence leaves the adapter | `redaction.test.ts`, React bridge serialization, and `composeEvidence` | Add a regression test for any newly observed sensitive shape; colliding screenshot handles become null without copying artifacts |
| Session count, scenario/attempt retention, verification deadlines, and browser wait time are bounded | `SessionManager` and adapter constants | Use a smaller bounded operation or change the limit with a reliability review |
| Vite module graph and transform diff data is local, bounded, and read-only | `ViteAdapter`, `vite-plugin.ts`, transform cache, and React/Vite smoke | Keep the endpoint loopback-only and add bounds/tests for new module or diff fields |

## Architecture decisions

The suite uses one MCP surface with internal adapters because Codex should see a stable workflow rather than four overlapping server catalogs. The first adapter is Chromium/CDP because it is the smallest route to browser state, JavaScript execution, and debugger control. Framework adapters will be promoted only after the core evidence and lifecycle contracts have deterministic fixtures.
