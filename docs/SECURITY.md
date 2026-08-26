# Security

`web-debug-mcp` is a local debugging tool that can observe and control a running browser. The default posture is least privilege for local development: explicit target selection, loopback-only URLs, isolated launch mode, bounded evidence, and redaction.

## Trust boundaries

| Boundary | Invariant | Enforcer | Verification | Owner/update trigger |
| --- | --- | --- | --- | --- |
| MCP caller to server | Tool inputs are schema-validated and session IDs are required for runtime actions | Zod schemas in `src/index.ts` and `SessionManager` lookup | `npm run typecheck` and session tests | Platform Engineering; public tool changes |
| Server to browser | Remote targets are rejected unless `allowRemote` is explicit; navigation stays same-origin | `ChromiumAdapter` URL policy | Adapter contract tests and manual local smoke | Platform Engineering; target policy changes |
| Browser to evidence | Console, URLs, locals, and evaluated values are bounded and sensitive fields redacted | `src/core/redaction.ts`, adapter bounds, `composeEvidence` | `npm test` redaction coverage | Platform Engineering; new data source or privacy finding |
| Browser profile | Launch mode creates a fresh Playwright context; attach mode is marked non-isolated | `ChromiumAdapter` target metadata | Session summary and issue capture warning | Platform Engineering; browser lifecycle changes |
| Evaluation | CDP evaluation rejects side effects by default | `web_debug_evaluate` schema and `throwOnSideEffect` | Type check plus future live fixture test | Platform Engineering; evaluator behavior changes |
| Artifact storage | Screenshots use a temporary per-session directory and are not written into the project | `SessionManager` temporary directory allocation | Session manager test and runtime contract | Platform Engineering; artifact policy changes |

## Sensitive data policy

The core adapter does not collect cookies, authorization headers, browser storage, or raw response bodies. It does collect URLs, console text, debugger locals, DOM text, and screenshot pixels because those are required for debugging; each is bounded and redacted before returning to the MCP caller. Callers must use disposable local credentials and synthetic data for live sessions.

The redaction layer is defensive, not a guarantee of secrecy. New adapters must document every new field and add a regression test before exposing it through `EvidenceBundle`.

## Abuse and recovery

The server binds to MCP stdio and the browser adapter uses explicit local targets. Do not expose a CDP endpoint or a future daemon on a non-loopback interface without a separate authentication and threat-model decision. If a session is attached to the wrong browser, close it immediately, discard the evidence, and restart with launch mode and an isolated profile.

No security review, production hardening, or external penetration test has been performed for this first commit.
