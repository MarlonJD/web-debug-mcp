# Reliability

The first increment favors bounded, recoverable local sessions over background persistence. A failed browser connection must remove its session record and release any browser resources it owns.

## Reliability contract

| Risk or invariant | Detection | Recovery | Verification |
| --- | --- | --- | --- |
| Browser executable or CDP endpoint is missing | `BROWSER_EXECUTABLE_REQUIRED` or adapter connection error | Provide an explicit executable path or CDP endpoint; no arbitrary browser is launched | `npm run typecheck`; live browser smoke when Chromium is available |
| Invalid project root | `PROJECT_ROOT_INVALID` | Pass a real directory containing the target project | `capabilities.test.ts` |
| More than eight active sessions | `SESSION_LIMIT_REACHED` | Close an existing session, then retry | Session manager contract |
| Browser wait or action hangs | Playwright action timeout capped at 30 seconds | Inspect the bounded error, capture state, and close the session | Adapter implementation and fixture flow |
| Browser process exits | Playwright/CDP operation error | Close the session, retain artifact paths, start a fresh isolated session | Live smoke when a browser is available |
| Evidence grows without bound | Ring buffers, item caps, text caps, and eight-frame debugger limit | Use the returned truncation warning and request a narrower follow-up | Redaction and evidence tests |
| MCP process receives SIGINT/SIGTERM | Process signal handler | Close owned sessions and the MCP connection | Manual fixture lifecycle; future process test |
| Next runtime endpoint is unavailable or returns malformed SSE | `NextAdapter` timeout/JSON-RPC warning | Keep browser evidence, report the Next capability warning, and retry after the dev server is ready | `next-adapter.test.ts` and `npm run smoke:next` |
| Next development log is missing, outside the project, or too large | `NextAdapter` path boundary, byte/line caps, and warning | Keep the Next metadata and browser evidence; inspect the returned warning or the local dev server directly | `next-adapter.test.ts` and `npm run smoke:next` |
| Next route compile or Server Action lookup is unavailable | `web_next_inspect` returns a bounded error/warning from the local Next MCP endpoint | Keep the session and capture evidence; retry after the route/server manifest is ready | `next-adapter.test.ts` and `npm run smoke:next` |
| Vite debug endpoint is unavailable or returns malformed JSON | `ViteAdapter` timeout/HTTP/JSON warning | Keep browser evidence, report the Vite capability warning, and verify the Vite plugin is installed | `vite-adapter.test.ts` and `npm run smoke:react-vite` |
| Vite transform history is missing or too large | Plugin keeps 200 source snapshots, 32 KiB/module, and 12 KiB/diff bounds; absence remains nullable | Keep module graph/HMR evidence and report a missing diff rather than failing the session | `vite-adapter.test.ts` and `npm run smoke:react-vite` |
| React commit profiling data is unavailable or grows too large | Bridge uses bounded commit history, Fiber weak maps, and nullable duration fields | Keep component/state evidence and report the React bridge warning; do not fail the browser session | `react-fixture-contract.test.ts` and `npm run smoke:react-vite` |
| Safari remote automation is disabled or WebDriver is unavailable | `SafariAdapter` returns a bounded startup error; the smoke reports `status: "blocked"` | Enable Safari remote automation or provide a loopback WebDriver endpoint; use Chromium when CDP debugger evidence is required | `safari-adapter.test.ts` and `npm run smoke:safari` |

## Operational signals

MCP responses carry structured error codes for expected failures. Evidence carries warnings for truncation, unavailable DOM/screenshot data, non-isolated external attachment, and unavailable optional Next runtime tools. Diagnostic text must go to stderr so the MCP stdout stream remains parseable.

## Recovery boundary

Temporary artifacts are intentionally retained after a session closes so the agent can inspect the evidence. The operating system owns temporary-directory cleanup. The project has no database, hosted daemon, migration, deployment, or rollback surface in this increment.
