# Architecture

## System context

`web-debug-mcp` is a local MCP server that gives an agent a bounded view of a running web application. The agent asks for a project capability report, starts an explicitly selected browser session, performs small same-origin actions, and receives evidence that joins browser state with JavaScript debugger state.

The server is a development tool. It runs over MCP stdio, launches or attaches to local Chromium, and stores screenshots under a temporary per-session artifact directory. It does not host an HTTP service for remote clients and does not modify application source during a debug session.

## Repository map

| Path | Responsibility | Owner or update trigger |
| --- | --- | --- |
| `src/index.ts` | MCP server metadata, tool schemas, and request boundary | Platform Engineering; update when public tools change |
| `src/domain/types.ts` | Typed project, session, browser, debugger, evidence, and scenario contracts | Platform Engineering; update before shape changes |
| `src/core/capabilities.ts` | Safe marker-based project detection | Platform Engineering; update when supported stack markers change |
| `src/core/session-manager.ts` | Session ownership, lifecycle, scenario storage, and verification orchestration | Platform Engineering; update with lifecycle or policy changes |
| `src/core/redaction.ts` | Sensitive-key, URL, text, and output bounds | Platform Engineering; update after a privacy finding or new data source |
| `src/core/evidence.ts` | Redacted evidence bundle composition | Platform Engineering; update when evidence consumers change |
| `src/adapters/browser.ts` | Browser transport interface | Platform Engineering; update when an adapter capability changes |
| `src/adapters/chromium.ts` | Playwright/CDP browser and JavaScript debugger adapter | Platform Engineering; update with Chromium protocol behavior |
| `src/adapters/react.ts` | Opt-in React runtime bridge reader | Platform Engineering; update with the bridge contract |
| `fixtures/vanilla/` | Framework-neutral deterministic browser target | Test ownership; update when a reproducible behavior contract changes |
| `fixtures/react-vite/` | React component/state fixture served by Vite | Test ownership; update when framework evidence changes |
| `scripts/harness-check.mjs` | Project-native structural and command contract check | Platform Engineering; update when repository invariants change |
| `scripts/live-react-vite-smoke.mjs` | Live React/Vite breakpoint and verification smoke | Platform Engineering; update when the fixture flow changes |
| `docs/` | Durable architecture, security, reliability, planning, and harness knowledge | Platform Engineering; update with boundary changes |

## Components and boundaries

`src/index.ts` is the only public MCP boundary. It validates inputs with Zod, delegates to `SessionManager`, and serializes structured results or bounded errors. It does not access Playwright directly.

`SessionManager` owns one in-memory record per session and limits active sessions to eight. It creates temporary artifact directories, invokes the browser adapter, updates lifecycle status, and composes evidence. It is the policy boundary for session lookup and close behavior.

`ChromiumAdapter` owns Playwright and CDP details. It can launch a browser only when an executable path is explicit, or attach only when a CDP endpoint is explicit. It records metadata for console and network events, never response bodies, and exposes only the operations defined by `BrowserAdapter`.

React intelligence is available through an explicit development bridge at `window.__WEB_DEBUG_REACT__`. `ReactAdapter` reads bounded component nodes, props, hook values, source locations, and render counts only when that bridge is present. The React/Vite fixture installs the bridge before React loads. Vite-specific HMR/module-graph semantics and Next.js server semantics are still future adapters; their absence is a warning, not a discovery failure.

## Data and control flow

1. `web_project_detect` reads only known marker files and `package.json` dependency sections.
2. `web_session_start` detects the project, allocates a session ID and temporary artifact directory, then starts the Chromium adapter.
3. Browser actions are bounded and same-origin. Console, request, response, and page-error observers retain bounded metadata in memory.
4. `web_breakpoint_set` and `web_debug_control` use the local CDP Debugger domain. `web_debug_evaluate` uses CDP Runtime with side effects rejected by default.
5. `web_issue_capture` collects DOM, console, network, screenshot, paused-frame, and optional React bridge data, then applies the redaction policy again before returning the evidence bundle.
6. `web_repro_record` stores an action/check contract in memory. `web_fix_verify` reloads the scenario URL, replays actions, captures evidence, and evaluates the declared checks.

## Runtime topology

```text
Codex MCP client
      │ stdio
      ▼
web-debug-mcp process
      ├── SessionManager
      └── ChromiumAdapter ── Playwright/CDP ── loopback Chromium
                                      │
                                      └── local web app
```

The deterministic fixture uses `scripts/serve-fixture.mjs` on `127.0.0.1`. A live adapter requires either `WEB_DEBUG_CHROME_EXECUTABLE_PATH` or a caller-provided `cdpEndpoint`. Temporary screenshots remain outside the project and survive session close so the caller can inspect evidence; the operating system owns eventual temporary-directory cleanup.

Production, hosted MCP, remote browser, Safari, and cloud deployment environments are intentionally out of scope for this increment.

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
| Sensitive values are redacted before evidence leaves the adapter | `redaction.test.ts`, React bridge serialization, and `composeEvidence` | Add a regression test for any newly observed sensitive shape |
| Session count and browser wait time are bounded | `SessionManager` and `ChromiumAdapter` constants | Use a smaller bounded operation or change the limit with a reliability review |

## Architecture decisions

The suite uses one MCP surface with internal adapters because Codex should see a stable workflow rather than four overlapping server catalogs. The first adapter is Chromium/CDP because it is the smallest route to browser state, JavaScript execution, and debugger control. Framework adapters will be promoted only after the core evidence and lifecycle contracts have deterministic fixtures.
