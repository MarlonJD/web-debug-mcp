# ExecPlan Registry

## Active

| Plan | Owner | State | Updated (UTC) | Current milestone or blocker |
| --- | --- | --- | --- | --- |
<!-- harness:plans:active:start -->
| [Add local fidelity, semantic diagnostics, and bounded lifecycle cleanup](active/local-fidelity-and-session-lifecycle.md) | Platform Engineering | release-ready | 2026-08-28 | All local gates pass; exact-SHA v0.3.0 release and reversible Codex plugin update are explicitly authorized and pending |
<!-- harness:plans:active:end -->

## Completed

| Plan | Completed (UTC) | Outcome | Verification |
| --- | --- | --- | --- |
<!-- harness:plans:completed:start -->
| [Build the first web-debug-mcp vertical slice](completed/web-debug-mcp-mvp.md) | 2026-08-28 | Local vertical slice complete; external Chromium/CDP attachment and provider-backed production attestation remain candidate-only follow-ups | deterministic suite, live local browser/framework/Safari evidence, and repository-local harness certification |
| [Make reproduction and fix verification adaptive and flake-aware](completed/adaptive-flake-verification.md) | 2026-08-27 | Adaptive session-bound reproduction and fix verification with authoritative evidence, fresh-attempt policy, tri-state checks, bounded redaction/retention, and truthful Chromium/Safari limits | 13 files/50 tests passed; typecheck, build, harness (`208 checks`), live Chromium/React-Vite/Next/Safari, complex-async, and all-scenario comparisons passed; Safari debugger/profile and Performance Resource Timing fallback warnings remain explicit |
<!-- harness:plans:completed:end -->

## Lifecycle rules

- Keep active plans under `active/`.
- Move a plan to `completed/` only after the validation section is satisfied and the registry is updated.
- Track confirmed deferred work in [`tech-debt-tracker.md`](tech-debt-tracker.md).
