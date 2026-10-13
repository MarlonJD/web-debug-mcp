# Connect browser execution to original source and behavioral changes

Maintain this plan according to `docs/PLANS.md`.

## Purpose / Big Picture

Extend the existing local debugging workflow with original-source locations and breakpoints, explicitly selected bounded execution coverage, request/source/action correlation, and explanatory before/after evidence differences. Keep the existing 13-tool facade, origin policy, redaction, bounded outputs, and acceptance-based verification verdicts.

## Progress

- [x] Inspect the clean `main` checkout at `36450ec` and confirm the current 0.6.0 contracts.
- [x] Implement and test bounded source identity, map resolution, original-source locations, and breakpoints.
- [x] Implement opt-in Chromium execution windows with guaranteed instrumentation cleanup and explicit coverage limits.
- [x] Correlate request initiators and action windows without claiming temporal correlation proves causality.
- [x] Add explanatory capture/verification differences without changing acceptance verdict semantics.
- [x] Exercise deterministic tests and an owned Chromium fixture, update contracts, and pass native gates.

## Surprises & Discoveries

The current repository already provides Vite source-map summaries, module graphs, transform diffs, hashed capture deltas, and session-owned verification. It does not provide source-map decoding or precise execution coverage. The installed plugin is a separate version and is not the implementation target.

The first live minified-TSX run found that generic redaction's depth limit replaced typed coverage ranges with strings. Bounded typed-leaf redaction now preserves schema shape, and the repeated real-browser run passed. Initial sandbox runs also showed that process-identity and loopback tests require unsandboxed execution; the authorized rerun passed all tests.

## Decision Log

- 2026-10-12: Work on the existing branch. No publication or branch operations are part of this task.
- 2026-10-12: Deliver the four prioritized improvements. Generic static bundle analysis and portable evidence export remain second-stage candidates, not requirements of this increment.
- 2026-10-12: Use an established source-map library and separate Chromium transport intelligence from core evidence comparison. Coverage is diagnostic and opt-in; final fix verification runs without precise coverage.

## Outcomes & Retrospective

The four scoped improvements are implemented. Verified locally: 177 tests across 33 files; typecheck; build; native harness (582 checks, historical certification remains stale-candidate); minified TSX original breakpoint, coverage/source/request attribution, semantic delta, changed script identity, and uninstrumented `verified` fix flow; React/Vite coverage, commit-count bracketing, HMR identity and existing replay/render behavior; existing vanilla CDP smoke. The final real-browser reload assertion also confirmed that a script-bound original breakpoint becomes stale after document replacement. All scoped acceptance checks passed.

Tests used Chromium 153.0.8010.36 with owned headless profiles. Process inspection found no surviving test-owned Chrome or fixture processes. Safari's unsupported diagnostics were tested deterministically. On the user's follow-up, `npm run smoke:safari` and one request-timed retry both reported `blocked`: the loopback fixture and WebDriver `/status` became ready, but `POST /session` did not respond before cancellation. No DOM, screenshot, network, or BiDi console PASS is claimed from those attempts. Remote attachment, agent speed/token benchmarks, and publication were not performed. Generic bundle analysis and portable evidence export remain second-stage candidates.

## Context and Orientation

`src/index.ts` owns public inputs and result validation. `src/domain/types.ts` and `wire-schemas.ts` own evidence contracts. `ChromiumAdapter` owns CDP; `SessionManager` owns leases and verification. `session-evidence.ts` projects compact captures and cursors. Tests are under `test/`, with owned-process live fixture checks under `scripts/`.

## Plan of Work

1. Add source identity and bounded source-map resolution, preserving generated coordinates and reporting unavailable mappings. Translate explicitly requested original-source breakpoints and invalidate sources on document/context replacement.
2. Extend the existing browser action request with an optional bounded diagnostic observation. Arm precise coverage before actions, stop it on success/failure/cancellation, and return actual observed ranges and capability warnings.
3. Retain bounded CDP request initiator locations and monotonic timestamps. Associate evidence with observation windows and distinguish direct initiator evidence from temporal action association.
4. Compare bounded console, request, framework, and execution evidence. Attach diagnostic changes to capture deltas and fix verification while keeping checks authoritative.
5. Verify minified TypeScript mapping, missing/unsafe maps, reload/HMR invalidation, Unicode offsets, execution windows, request association, cleanup, and unchanged verification semantics.

## Concrete Steps

Working directory: `/Users/marlonjd/Developer/library/web-debug-mcp`.

- Install the explicitly declared mapping dependency using `npm install --no-audit --no-fund`.
- Run focused Vitest contracts while implementing.
- Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run harness:check` before completion.
- Run the new diagnostic live smoke and relevant existing Chromium/framework smoke with a dedicated browser profile; await teardown and inspect remaining owned processes.

## Validation and Acceptance

Original-source locations must resolve for a known mapped fixture and never invent positions for unavailable maps. Original-source breakpoints must pause in the expected generated script. Diagnostic windows must expose bounded ranges and request initiators, stop instrumentation on every terminal path, and disclose missing/truncated evidence. Differences must explain observations without changing `verified`/`failed`/`inconclusive` decisions. Safari must explicitly reject unsupported diagnostic operations while preserving generic behavior. All repository-native gates must pass.

## Idempotence and Recovery

All runtime checks use disposable loopback fixtures and command-owned browser processes. Source caches are session-owned and bounded; close purges them. Failed observation cleanup must prevent continued use of an uncertain session. No persisted executable scenarios or broader network/file authority are introduced.

## Artifacts and Notes

Baseline source: `36450ec`. External protocol/library documentation is used only as implementation reference; real fixture results will be recorded here.

## Interfaces and Dependencies

Use `@jridgewell/trace-mapping` as an explicit runtime dependency. Extend existing action, breakpoint, capture, and verification contracts, with matching concrete Zod schemas and runtime capabilities. Keep additional source text private and bounded; only selected mapped locations and diagnostic metadata cross the wire.

## Revision History

- (2026-10-12) Created the implementation plan following the user's approval of the proposed improvements.

- (2026-10-12) Completed source mapping, explicit diagnostic windows, correlation, explanatory differences, deterministic and live Chromium acceptance, documentation, and process cleanup. Release remains pending.

- (2026-10-12) Ran the requested Safari live smoke and one bounded request-timed diagnostic retry. Both were blocked during WebDriver session creation (`POST /session`); build, fixture readiness, and WebDriver status succeeded. No adapter or smoke acceptance checks were weakened.

## Full local retest — 2026-10-13

The user requested a fresh complete test pass after the Safari startup blocker. No runtime source or test acceptance logic was changed in this retest.

| Check | Fresh result |
| --- | --- |
| npm test (including build/pretest) | 33 files, 177 tests passed |
| npm run typecheck | Passed |
| npm run harness:check and git diff --check | Passed; 582 harness checks; historical certification remains stale-candidate |
| npm pack --dry-run --json (including prepack build) | Passed; 176 archive entries; no publication |
| npm run eval:catalog | Passed; catalog only, no model benchmark |
| Source-correlation, vanilla, React/Vite, Next, Vue/Vite, Angular, and local-fidelity live smokes | All seven passed |
| node scripts/demo-compare.mjs --runs=1 --json | All six scenarios met their expected capture or reproduce/diagnose/fix criteria; the three repair scenarios ended verified, including desktop and mobile layout checks |
| Safari 27.0 live smoke | Blocked before browser actions: WebDriver session creation did not answer |
| Plain W3C Safari control on a separate owned port, without BiDi | Also timed out at POST /session after 15 seconds; owned driver exited cleanly |
| Safari automation setting | Observed enabled in the Developer settings UI; no settings changed |
| Cleanup and fixture preservation | No test-owned browser/driver/server processes remained; tracked fixtures unchanged; pre-existing Safari MCP process preserved |

Safari DOM, screenshot, network, and BiDi console remain unverified for this checkout. The plain W3C control reproduces the startup failure without this repository's adapter, but does not establish its underlying Safari/OS cause. One repetition of the comparison scenarios is functional evidence, not a performance claim.

Run logs and the machine-readable summary: /private/tmp/web-debug-retest-20261013-OfRjTi/.

## Subsequent Safari recovery

The session-creation blocker was isolated and recovered on 2026-10-13. See [Safari session recovery](safari-session-recovery.md) for the native rejection, user-approved window preservation, successful driver-owned startup, remaining BiDi console limitation, 181-test final result, and restoration of all five personal tabs. Historical failed retests above remain unchanged.
