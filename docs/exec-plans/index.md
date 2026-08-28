# ExecPlan Registry

## Active

| Plan | Owner | State | Updated (UTC) | Current milestone or blocker |
| --- | --- | --- | --- | --- |
<!-- harness:plans:active:start -->
<!-- harness:plans:active:end -->

## Completed

| Plan | Completed (UTC) | Outcome | Verification |
| --- | --- | --- | --- |
<!-- harness:plans:completed:start -->
| [Publish the first npm package as 0.3.1](completed/npm-publication-0.3.1.md) | 2026-08-28 | First public npm release with a runnable CLI, no install-time script, immutable npm-pinned plugin runtime, and preserved `v0.3.0` history | 61 tests; typecheck/build; harness `232`; plugin validator; real tarball/fresh-prefix and public-registry 13-tool handshakes; npm/GitHub/Codex identities verified |
| [Add local fidelity, semantic diagnostics, and bounded lifecycle cleanup](completed/local-fidelity-and-session-lifecycle.md) | 2026-08-28 | Guarded loopback TLS/auth, exact semantic locators and probes, computed AX diagnostics, checkpointed viewport matrices, bounded lifecycle cleanup, and Web Debug plugin `0.3.0` | 61 tests; typecheck/build; harness `231`; all live smokes/demo; real tarball/install; exact GitHub release; Codex plugin updated/enabled; released-tag 13-tool handshake |
| [Build the first web-debug-mcp vertical slice](completed/web-debug-mcp-mvp.md) | 2026-08-28 | Local vertical slice complete; external Chromium/CDP attachment and provider-backed production attestation remain candidate-only follow-ups | deterministic suite, live local browser/framework/Safari evidence, and repository-local harness certification |
| [Make reproduction and fix verification adaptive and flake-aware](completed/adaptive-flake-verification.md) | 2026-08-27 | Adaptive session-bound reproduction and fix verification with authoritative evidence, fresh-attempt policy, tri-state checks, bounded redaction/retention, and truthful Chromium/Safari limits | 13 files/50 tests passed; typecheck, build, harness (`208 checks`), live Chromium/React-Vite/Next/Safari, complex-async, and all-scenario comparisons passed; Safari debugger/profile and Performance Resource Timing fallback warnings remain explicit |
<!-- harness:plans:completed:end -->

## Lifecycle rules

- Keep active plans under `active/`.
- Move a plan to `completed/` only after the validation section is satisfied and the registry is updated.
- Track confirmed deferred work in [`tech-debt-tracker.md`](tech-debt-tracker.md).
