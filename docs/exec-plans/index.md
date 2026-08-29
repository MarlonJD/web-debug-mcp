# ExecPlan Registry

## Active

| Plan | Owner | State | Updated (UTC) | Current milestone or blocker |
| --- | --- | --- | --- | --- |
<!-- harness:plans:active:start -->
| [Complete the 0.4.0 release and harness migration](active/complete-0-4-0-release.md) | Platform Engineering | implementing | 2026-08-29 | Migrating historical plans and preparing final release identities after npm authentication succeeded |
<!-- harness:plans:active:end -->

## Completed

| Plan | Completed (UTC) | Outcome | Verification |
| --- | --- | --- | --- |
<!-- harness:plans:completed:start -->
| [Harden Web Debug trust boundaries and product contracts](completed/trust-and-contract-hardening.md) | 2026-08-29 | Source-next `0.4.0-next.0` locally hardens origin, lifecycle, MCP output, artifacts, actions, doctor, evaluation, and harness truthfulness without publishing | 106 tests; typecheck/build; native harness `500` stale-candidate; fresh-prefix 13-tool prerelease handshake; Chromium/React-Vite/Next/Safari/local-fidelity smokes |
| [Clarify Web Debug routing and publish 0.3.2/0.3.3 correction](completed/web-debug-routing-0-3-2.md) | 2026-08-28 | Web Debug routing clarified as a browser-evidence complement; immutable `0.3.3` metadata correction published and installed in Codex | 61 tests; typecheck/build; harness `234`; skill/plugin validators; public npm/fresh-prefix 13-tool handshake; exact `v0.3.3` release SHA; Codex `0.3.3+codex.20260828123311` enabled |
| [Publish the first npm package as 0.3.1](completed/npm-publication-0-3-1.md) | 2026-08-28 | First public npm release with a runnable CLI, no install-time script, immutable npm-pinned plugin runtime, and preserved `v0.3.0` history | 61 tests; typecheck/build; harness `232`; plugin validator; real tarball/fresh-prefix and public-registry 13-tool handshakes; npm/GitHub/Codex identities verified |
| [Add local fidelity, semantic diagnostics, and bounded lifecycle cleanup](completed/local-fidelity-and-session-lifecycle.md) | 2026-08-28 | Guarded loopback TLS/auth, exact semantic locators and probes, computed AX diagnostics, checkpointed viewport matrices, bounded lifecycle cleanup, and Web Debug plugin `0.3.0` | 61 tests; typecheck/build; harness `231`; all live smokes/demo; real tarball/install; exact GitHub release; Codex plugin updated/enabled; released-tag 13-tool handshake |
| [Build the first web-debug-mcp vertical slice](completed/web-debug-mcp-mvp.md) | 2026-08-28 | Local vertical slice complete; external Chromium/CDP attachment and provider-backed production attestation remain candidate-only follow-ups | deterministic suite, live local browser/framework/Safari evidence, and repository-local harness certification |
| [Make reproduction and fix verification adaptive and flake-aware](completed/adaptive-flake-verification.md) | 2026-08-27 | Adaptive session-bound reproduction and fix verification with authoritative evidence, fresh-attempt policy, tri-state checks, bounded redaction/retention, and truthful Chromium/Safari limits | 13 files/50 tests passed; typecheck, build, harness (`208 checks`), live Chromium/React-Vite/Next/Safari, complex-async, and all-scenario comparisons passed; Safari debugger/profile and Performance Resource Timing fallback warnings remain explicit |
<!-- harness:plans:completed:end -->

## Lifecycle rules

- Keep active plans under `active/`.
- Move a plan to `completed/` only after the validation section is satisfied and the registry is updated.
- Track confirmed deferred work in [`tech-debt-tracker.md`](tech-debt-tracker.md).
