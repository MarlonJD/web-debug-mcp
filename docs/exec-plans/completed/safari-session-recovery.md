<!-- harness-plan:v1
id: safari-session-recovery
status: completed
created: 2026-10-13
updated: 2026-10-13
completed: 2026-10-13
owner: Platform Engineering
-->

# Recover Safari 27 automation startup and report remaining capabilities honestly

## Purpose / Big Picture

Resolve the repeated Safari session-creation timeout, preserve the user's normal Safari windows, and ensure the adapter reports actionable startup errors and never treats a silent BiDi connection as proof of an error-free console.

## Progress

- [x] Isolate session creation with plain W3C and explicit macOS controls.
- [x] Confirm Safari's native rejection: `Safari was not launched for automation`.
- [x] Obtain user approval and use Quit and Keep Windows on normal Safari.
- [x] Release only the empty automation Safari created by this investigation; retain the existing native MCP launcher.
- [x] Verify a fresh driver-created automation session (HTTP 200, approximately 2032 ms).
- [x] Exercise full smoke: actions, DOM, screenshot and network pass; BiDi console remains absent.
- [x] Add actionable error classification and truthful silent-console observations; run focused/full native gates.
- [x] Record the remaining Safari 27 BiDi limitation, clean up the owned automation browser, and restore normal Safari windows.

## Surprises & Discoveries

The running Safari and driver both report 27.0 (22625.1.29.11.27). Automation permission is enabled. Native logs show ordinary Safari reaching AppIsReady and rejecting the new automation session. Creating an automation process via native MCP did not fix WebDriver until normal Safari closed, then the empty MCP-owned process caused an explicit already-paired rejection. Letting the classic driver launch its own --automation process resolved session creation without changing permissions.

Global/event-specific, context-specific, module-wide, automaticInspection, and standard-only WebSocket capability controls did not yield console events. Safari accepts experimental BiDi subscriptions and browsingContext.getTree; it emits no console event even from the actual fixture click handler. Standard-only webSocketUrl returns a boolean rather than a WebSocket address. Do not lower the smoke's console requirement or substitute DOM/network success for it.

## Decision Log

- Keep current WebDriver/BiDi transport and safety policy; no speculative transport migration or automatic personal-browser termination.
- Preserve timeout bounds. Classify startup timeout and session-in-use errors with recovery guidance.
- A connected socket alone cannot satisfy noConsoleErrors. Require actual console-delivery evidence and an open connection; otherwise report unavailable.

## Validation and Acceptance

Focused Safari adapter and doctor tests, full npm test, typecheck, build, harness and diff checks must pass. Live startup/DOM/screenshot/network recovery must be reported separately from the blocked BiDi console guardrail. Restore the normal Safari session after command-owned driver cleanup.

## Outcomes & Retrospective

Verified locally: 181 tests across 33 files, focused Safari/doctor tests (21), typecheck and build. Fresh WebDriver startup succeeds, all full-smoke assertions except actual BiDi console delivery pass, and the new console-availability truthfulness assertion passes. Full Safari smoke remains literally blocked at phase complete because the console guardrail cannot be verified. Native harness passed (583 checks, historical certification remains stale-candidate); final diff checks passed. The final full test run again passed 181 tests. A connected but unverified console capability is degraded, while the required observation remains unavailable.

Normal Safari was restored; the UI reported the same five tab titles before and after. The WebDriver-owned automation browser and all command-owned drivers/fixtures were closed; the pre-existing native MCP launcher was preserved. No profile deletion, security-setting changes, acceptance weakening, branch changes or publication occurred. Investigation artifacts: /private/tmp/web-debug-safari-fix-20261013-MHI0qK/.

## Revision History

- 2026-10-13: Created from the reproduced failure, explicit user approval, and successful clean-start control.

- 2026-10-13: Completed scoped startup recovery, explicit timeout/owner errors, conservative console guardrail, full validation, cleanup, and five-tab restoration. Safari BiDi console remains a named upstream/runtime limitation; no full smoke PASS is claimed.
