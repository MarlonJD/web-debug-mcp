# Web Debug product contract

The immutable package/plugin release is `0.6.0`. It changes capture and capability wire contracts, adds a second qualification workflow skill, and keeps the 13-tool MCP catalog unchanged.

## User outcome

A local coding agent can detect one web project, start one explicitly selected browser target, reproduce a symptom with deterministic same-origin actions, receive bounded browser/framework evidence, and verify the same session-owned flow after a source change.

## Public surface

The MCP catalog remains 13 tools. Inputs are Zod-validated. Handler outputs use the canonical `{ ok, data, error, artifacts, warnings }` structured envelope and one bounded text preview; SDK-level input/protocol rejection occurs before the handler and retains the SDK error shape. Long scenario phases may publish fixed-scale progress; progress is never a verdict. Screenshots may be inline only within the total result budget and otherwise use non-enumerable opaque resources.

Browser actions are carried by `web_browser_action`, not new tools: navigate, click, fill, press from a fixed key allowlist, exact select, declared checked state, hover, scroll-into-view, observable wait, and reload. Public replay never restores fill/select values.

The scenario and verification data contract is schema version 5. Environment fingerprints include project detection confidence and negotiated runtime capability states; callers must branch on `schemaVersion` rather than infer shape from package version.

Authoritative issue evidence is schema version 4. Public manual capture is also schema version 4 but uses a profile wrapper: `summary` by default, explicit `full`, selected `include`, or current changed surfaces through a reusable session-bound `delta` cursor. Summary produces no screenshot; full and explicit screenshot inclusion opt into pixels, while existing auth/private-input suppression still wins. Local screenshot paths never cross the capture wire boundary. Angular/Vue enrichment remains Chromium development-only, checks-only attempts return null fields, paused captures are explicitly stale, and Safari remains generic browser evidence.

Project detection schema 2 reports project kind, confidence, provenance, ambiguity, weak candidate signals, bounded declared-workspace candidates, and `projectCapabilities`. A live session summary schema 2 separately reports adapter-negotiated `runtimeCapabilities`; project dependencies never claim that Safari exposes a JavaScript debugger, semantic locator, accessibility, TLS/auth, or matrix surface.

Every public tool advertises and enforces a concrete data schema. A handler result that drifts from its advertised shape becomes bounded `RESULT_SCHEMA_VIOLATION`; deep bounded runtime/upstream payloads remain JSON leaves while stable tool and capture-profile structure is explicit.

## Trust and lifecycle

Targets are loopback-only unless remote authority is explicit. The selected top-level origin is fixed before navigation and never rebased after redirects or actions. Ordinary cross-origin subresources remain usable; top-level escapes and secondary pages are rejected or quarantined. Elevated TLS/auth mode retains its stronger exact-origin network guard.

Sessions are active-only managed records. Close destroys private URLs, auth state, actions, replay, secrets, endpoints, executable path, and target identity, then retains at most one of 32 sanitized tombstones for status/idempotency. The process registry derives its absolute active-session count from the manager during locked request finalization, so repeated/concurrent close and bookkeeping failures cannot create a false public lifecycle result. Artifacts are retained by default only within the four-file/16 MiB session quota or removed through the exact-session `artifactPolicy: "delete"` option; opaque handles may expire earlier than their one-hour upper-bound TTL when quota pruning removes an older file.

## Product boundaries

The package-only `doctor` command checks first-run readiness without adding an MCP tool or launching arbitrary browser state. The repository does not create portable scenario files, execute arbitrary Next Server Actions, monitor production, control unattended remote browsers, or claim current HMAC/production certification without fresh external evidence.

Exact verified versions and candidate-only boundaries live in [`../COMPATIBILITY.md`](../COMPATIBILITY.md); agent evaluation tasks live in [`../demos/agent-evaluation.md`](../demos/agent-evaluation.md). Angular CLI's internal Vite is not the Web Debug endpoint, and Vue hook evidence has no DOM-private fallback.
