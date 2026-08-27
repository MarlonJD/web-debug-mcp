# Security

`web-debug-mcp` is a local debugging tool that can observe and control a running browser. The default posture is least privilege for local development: explicit target selection, loopback-only URLs, isolated launch mode, bounded evidence, and redaction.

## Trust boundaries

| Boundary | Invariant | Enforcer | Verification | Owner/update trigger |
| --- | --- | --- | --- | --- |
| MCP caller to server | Tool inputs are schema-validated and session IDs are required for runtime actions | Zod schemas in `src/index.ts` and `SessionManager` lookup | `npm run typecheck` and session tests | Platform Engineering; public tool changes |
| Plugin package to local MCP process | The Codex/ChatGPT plugin only launches the existing stdio server; it does not add browser, filesystem, or network authority. Before npm publication, the launch command resolves the repository package from the GitHub main ref and therefore requires an explicit install decision and a local Node/npm runtime | `plugins/web-debug/.codex-plugin/plugin.json`, `plugins/web-debug/.mcp.json`, and package binary contract | Plugin validator and `npm run harness:check` | Platform Engineering; plugin distribution or release changes |
| Server to browser | Remote page/remote CDP targets are rejected unless `allowRemote` is explicit; CDP endpoint protocol is validated and attached sessions are marked non-isolated; navigation stays same-origin | `ChromiumAdapter` URL and CDP endpoint policy | `chromium-policy.test.ts` and manual local smoke | Platform Engineering; target policy changes |
| Browser to evidence | Console, URLs, locals, and evaluated values are bounded and sensitive fields redacted | `src/core/redaction.ts`, adapter bounds, `composeEvidence` | `npm test` redaction coverage | Platform Engineering; new data source or privacy finding |
| Browser profile | Launch mode creates a fresh Playwright context; attach mode is marked non-isolated | `ChromiumAdapter` target metadata | Session summary and issue capture warning | Platform Engineering; browser lifecycle changes |
| Safari WebDriver/BiDi | Safari endpoint is loopback-only by default, browser selection is explicit, BiDi console/network data is bounded and redacted, and unsupported debugger data is not fabricated; Safari network fallback is disclosed | `SafariAdapter` endpoint policy, BiDi subscription, performance fallback, and capability warnings | `safari-adapter.test.ts` and Safari smoke | Platform Engineering; Safari transport changes |
| Replay timeline | Captured frames are redacted and bounded; fill action values are replaced before storage; restore executes only retained safe actions and fails closed for sanitised inputs | `SessionManager` replay sanitizer, restore gate, frame caps, and `redactValue` | Session manager test and live React/Vite smoke | Platform Engineering; replay fields or retention changes |
| Evaluation | CDP evaluation rejects side effects by default | `web_debug_evaluate` schema and `throwOnSideEffect` | Type check plus future live fixture test | Platform Engineering; evaluator behavior changes |
| Artifact storage | Screenshots use a temporary per-session directory and are not written into the project | `SessionManager` temporary directory allocation | Session manager test and runtime contract | Platform Engineering; artifact policy changes |
| Next runtime metadata and logs | Next MCP calls stay on the selected local origin; log tails resolve inside the detected project root and are byte/line bounded and redacted | `NextAdapter` endpoint derivation, path boundary, caps, and redaction | `next-adapter.test.ts` and live Next smoke | Platform Engineering; Next endpoint or log-field changes |
| Next inspection operations | Only `compile_route` and `get_server_action_by_id` are reachable through schema-bounded `web_next_inspect` requests; browser-observed Server Action execution is recorded as evidence, while arbitrary server-side action invocation remains blocked | `src/index.ts` schema, `SessionManager`, and `NextAdapter` allowlist | MCP contract, adapter tests, and live Next smoke | Platform Engineering; inspection operation changes |
| React/Vite runtime metadata | Injected React bridge and Vite middleware expose only bounded development data on the selected local browser origin; the flat flamegraph contains summaries rather than raw Fiber objects and transform diffs are redacted | `ReactAdapter`, `ViteAdapter`, bridge serializer, weak maps, transform cache, and redaction | React/Vite contract and live smoke | Platform Engineering; bridge, module, or diff-field changes |

## Sensitive data policy

The core adapter does not collect cookies, authorization headers, browser storage, or raw response bodies. It does collect URLs, console text, debugger locals, DOM text, and screenshot pixels because those are required for debugging; each is bounded and redacted before returning to the MCP caller. Callers must use disposable local credentials and synthetic data for live sessions.

The Next adapter reads the development server’s MCP metadata surface over the already selected local origin. It does not authenticate to a remote Next server or execute arbitrary Next runtime tools; only the allowlisted metadata tools are called. When `get_logs` returns a path, the adapter resolves it, requires the file to stay inside the detected project root and retain the expected Next development-log basename, then reads only a bounded tail and redacts it. The Vite plugin similarly exposes only bounded module metadata on the local dev server and is not intended for production.

The redaction layer is defensive, not a guarantee of secrecy. New adapters must document every new field and add a regression test before exposing it through `EvidenceBundle`.

## Abuse and recovery

The server binds to MCP stdio and the browser adapter uses explicit local targets. Do not expose a CDP endpoint or a future daemon on a non-loopback interface without a separate authentication and threat-model decision. If a session is attached to the wrong browser, close it immediately, discard the evidence, and restart with launch mode and an isolated profile.

No security review, production hardening, or external penetration test has been performed for this first commit.
