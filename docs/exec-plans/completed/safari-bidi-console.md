# Restore Safari console delivery through native MCP

## Purpose / Big Picture

Make Safari deliver real console events through its internal adapter and retain the real-console requirement in the live smoke. Preserve the prior startup recovery, loopback/origin/ownership policy, bounded redaction, and truthful unavailable observations.

## Progress

- [x] Reinspect the current Safari adapter and the recorded failed controls.
- [x] Isolate the actual BiDi endpoint/session/runtime behavior with primary protocol and WebKit evidence.
- [x] Replace the non-delivering experimental route with the official native MCP transport and regression coverage.
- [x] Pass the full Safari live smoke (17 assertions), all 10 supported keys, 183 tests, typecheck, build, and native harness.
- [x] Clean up owned processes, restore the five personal tabs, and verify native startup/console while normal Safari stays open.

## Surprises & Discoveries

Safari 27.0 returns an experimental WebSocket URL on a different port than the explicitly requested --bidi port. That socket acknowledges subscriptions and serves browsingContext.getTree, but previous controls observed no log or network events. Event-name, context, module, automaticInspection, and standard-only capability variations did not fix the old route. Repeating those controls is not a new verification step.

The classic driver's experimental socket acknowledged session.subscribe locally without forwarding it to WebKit. Standard-only capabilities plus the requested BiDi port had no connectable endpoint. The official native MCP control returned Inspector Console.messageAdded records with the correct source location. This is a replacement of the defective route, not a claim to fix Safari's BiDi implementation.

Evidence is retained under `/private/tmp/web-debug-bidi-fix-20261013-BJpbNZ`: endpoint/standard-port probes, native-console-probe.log, native-smoke-4.log, native action runs, and gate logs. Safari's [official native MCP announcement](https://webkit.org/blog/18136/introducing-the-safari-mcp-server-for-web-developers/) documents the supported local console bridge.

## Decision Log

- Use Safari 27+ native MCP internally with the existing SDK, one owned child/tab, 256 KiB frames, bounded/cancelled calls, no second public tool catalog, and explicit safari-mcp provenance. Remove the old WebDriver endpoint options and BiDi client instead of retaining a compatibility fallback.
- Keep CSS pointer hit testing and bind native typing to structured focus metadata plus exact DOM identity; do not trust text matching or the advertised but unavailable $uid evaluation macro.
- Retain the console smoke requirement. Do not fabricate events, substitute another browser, or treat a silent stream as noConsoleErrors PASS.
- Prior user approval to preserve and quit/reopen normal Safari applies to this continuing diagnosis. Never kill unrelated automation clients or delete profile data.
- Keep the existing branch and uncommitted source-correlation work.

## Validation and Acceptance

Require an actual page/driver console marker in the Safari capture and a full smoke PASS. Add a regression for the identified protocol defect. Run relevant tests, typecheck, build, harness and diff checks. Disclose any remaining unsupported surface independently.

## Outcomes & Retrospective

Verified locally on Safari 27.0 (22625.1.29.11.27): `npm run smoke:safari` passed all 17 assertions in `safari-normal-open-final.log` (final run with normal Safari open), including a real app.js:8 error, noConsoleErrors rejection, drain/reset, a fresh marker after reload, all 10 keys, select/check/hover, DOM, initial screenshots and private-input suppression. The Space key required a literal space in the native protocol; its regression is covered.

`npm test` passed 183 tests across 34 files; typecheck, build, and `harness:check` passed (585 checks; certification remains stale-candidate). The SDK client tests cover actual stdio negotiation, oversized frames, timeout, cancellation and conflicting owners. Native console checks also fail closed for malformed/foreign-tab records and truncation. The public facade stays at 13 tools. Native network records remain best effort and the smoke explicitly disclosed Performance Resource Timing.

`coexist-smoke.log` proves native startup and actual console delivery while normal Safari is open. The test-owned automation process from earlier classic probes exited. Subsequent process inspection found only the restored normal Safari and the pre-existing unrelated MCP launcher; no command-owned driver, fixture, or Chrome process remained. All five saved personal tab titles matched after the final coexistence control. No branch, commit, publication, or installed-plugin update was performed; release pending.


## Revision History

- 2026-10-13: Started the explicitly requested BiDi console fix after bounded startup recovery.

- 2026-10-13: Completed the native transport replacement after full live console/action evidence, all local gates, coexistence verification, and personal-window restoration.
