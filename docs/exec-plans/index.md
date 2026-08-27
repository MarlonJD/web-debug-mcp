# ExecPlan Registry

## Active

| Plan | Owner | State | Updated (UTC) | Current milestone or blocker |
| --- | --- | --- | --- | --- |
<!-- harness:plans:active:start -->
| [Build the first web-debug-mcp vertical slice](active/web-debug-mcp-mvp.md) | Platform Engineering | implementing | 2026-08-27 | Local fidelity and repository-local harness certification are complete; approved external CDP and production authority remain gated |
<!-- harness:plans:active:end -->

## Completed

| Plan | Completed (UTC) | Outcome | Verification |
| --- | --- | --- | --- |
<!-- harness:plans:completed:start -->
| [Make reproduction and fix verification adaptive and flake-aware](completed/adaptive-flake-verification.md) | 2026-08-27 | Adaptive session-bound reproduction and fix verification with authoritative evidence, fresh-attempt policy, tri-state checks, bounded redaction/retention, and truthful Chromium/Safari limits | 13 files/50 tests passed; typecheck, build, harness (`208 checks`), live Chromium/React-Vite/Next/Safari, complex-async, and all-scenario comparisons passed; Safari debugger/profile and Performance Resource Timing fallback warnings remain explicit |
<!-- harness:plans:completed:end -->

## Lifecycle rules

- Keep active plans under `active/`.
- Move a plan to `completed/` only after the validation section is satisfied and the registry is updated.
- Track confirmed deferred work in [`tech-debt-tracker.md`](tech-debt-tracker.md).
