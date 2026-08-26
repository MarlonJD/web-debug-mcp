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

## Operational signals

MCP responses carry structured error codes for expected failures. Evidence carries warnings for truncation, unavailable DOM/screenshot data, non-isolated external attachment, and unavailable optional Next runtime tools. Diagnostic text must go to stderr so the MCP stdout stream remains parseable.

## Recovery boundary

Temporary artifacts are intentionally retained after a session closes so the agent can inspect the evidence. The operating system owns temporary-directory cleanup. The project has no database, hosted daemon, migration, deployment, or rollback surface in this increment.
