# ExecPlan Registry

## Active

| Plan | Owner | State | Updated (UTC) | Current milestone or blocker |
| --- | --- | --- | --- | --- |
<!-- harness:plans:active:start -->
| [Release Web Debug 0.6.0 and update Codex](active/complete-0-6-0-release.md) | Platform Engineering | implementing | 2026-08-31 | Promote the frozen source-next and qualification skill, run final release gates, publish npm/GitHub, and update the installed Codex plugin |
<!-- harness:plans:active:end -->

## Completed

| Plan | Completed (UTC) | Outcome | Verification |
| --- | --- | --- | --- |
<!-- harness:plans:completed:start -->
| [Make capture concise, typed, and runtime-aware](completed/capture-contract-and-runtime-capabilities.md) | 2026-08-31 | Added compact capture profiles, concrete tool schemas, confidence-aware detection, negotiated runtime capabilities, and focused SessionManager modules without publishing | 155 tests; typecheck/build; native/formal harness; exact 152-entry archive/fresh-prefix 13-schema handshake; Chromium/framework/local-fidelity smokes; six-scenario demo; Safari fresh live blocked after two wait timeouts |
| [Add reviewed manual-parity qualification guidance](completed/manual-parity-qualification-skill.md) | 2026-08-31 | Added a separately routed qualification skill with candidate/reviewer gates, native-runner ownership, non-executable metadata, case-scoped evidence, digest chaining, and diagnostic-only Web Debug escalation | 31 files/149 tests; typecheck/build; native harness 572; both skill validators; plugin validator; adversarial containment/verdict tests; independent forward-tests and final adversarial review |
| [Complete the 0.5.0 security and plugin release](completed/complete-0-5-0-release.md) | 2026-08-31 | Reviewed redaction and registry defects fixed; final npm/GitHub/Codex plugin and MCP identities converged on immutable 0.5.0 | 124 tests; typecheck/build; native/formal harness; plugin/skill validators; prod audit; Node 20/22/24 handshakes; seven live smokes; six-scenario demo; exact local/public archive; GitHub/npm/dist-tags/Codex verification |
| [Complete the 0.4.0 release and harness migration](completed/complete-0-4-0-release.md) | 2026-08-29 | Formal harness debt cleared; immutable npm/GitHub `0.4.0` and Codex plugin published with exact local/public evidence | 106 tests; typecheck/build; native/formal harness; plugin validator; five live smokes; six-scenario demo; local/public 13-tool handshakes; release/plugin identity equality |
| [Add bounded Angular and Vue 3 runtime evidence](completed/angular-vue-support.md) | 2026-08-30 | Source-only `0.5.0-next.0` adds bounded Angular 21 and Vue 3 Chromium runtime evidence without changing the immutable `0.4.0` release/plugin | 117 tests; typecheck/build; native harness `542` with stale-candidate certification; Angular/Vue and all existing live smokes; package dry-run |
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
