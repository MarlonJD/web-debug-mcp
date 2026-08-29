# Web Debug product contract

This contract belongs to source-next `0.4.0-next.0` and is release pending. The published npm package and bundled plugin remain on the immutable `0.3.3` contract until a separately authorized release.

## User outcome

A local coding agent can detect one web project, start one explicitly selected browser target, reproduce a symptom with deterministic same-origin actions, receive bounded browser/framework evidence, and verify the same session-owned flow after a source change.

## Public surface

The MCP catalog remains 13 tools. Inputs are Zod-validated. Handler outputs use the canonical `{ ok, data, error, artifacts, warnings }` structured envelope and one bounded text preview; SDK-level input/protocol rejection occurs before the handler and retains the SDK error shape. Long scenario phases may publish fixed-scale progress; progress is never a verdict. Screenshots may be inline only within the total result budget and otherwise use non-enumerable opaque resources.

Browser actions are carried by `web_browser_action`, not new tools: navigate, click, fill, press from a fixed key allowlist, exact select, declared checked state, hover, scroll-into-view, observable wait, and reload. Public replay never restores fill/select values.

The current scenario and verification data contract is schema version 4. It removes legacy duplicate fields and alternate viewport input shapes; callers must branch on `schemaVersion` rather than infer shape from package version.

## Trust and lifecycle

Targets are loopback-only unless remote authority is explicit. The selected top-level origin is fixed before navigation and never rebased after redirects or actions. Ordinary cross-origin subresources remain usable; top-level escapes and secondary pages are rejected or quarantined. Elevated TLS/auth mode retains its stronger exact-origin network guard.

Sessions are active-only managed records. Close destroys private URLs, auth state, actions, replay, secrets, endpoints, executable path, and target identity, then retains at most one of 32 sanitized tombstones for status/idempotency. Artifacts are retained by default only within the four-file/16 MiB session quota or removed through the exact-session `artifactPolicy: "delete"` option; opaque handles may expire earlier than their one-hour upper-bound TTL when quota pruning removes an older file.

## Product boundaries

The package-only `doctor` command checks first-run readiness without adding an MCP tool or launching arbitrary browser state. The repository does not create portable scenario files, execute arbitrary Next Server Actions, monitor production, control unattended remote browsers, or claim current HMAC/production certification without fresh external evidence.

Exact verified versions live in [`../COMPATIBILITY.md`](../COMPATIBILITY.md); agent evaluation tasks live in [`../demos/agent-evaluation.md`](../demos/agent-evaluation.md).
