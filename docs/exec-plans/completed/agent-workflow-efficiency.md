# Improve agent debugging efficiency and evidence quality

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). The user authorized all six improvements in order on 2026-10-14 and separately authorized fast-forwarding the existing clean `main` from `289aa6a` to released upstream `f96443f` (0.12.0). Implementation stays on that branch. Publication, push, release, and changing the installed plugin are outside this request.

## Purpose / Big Picture

Reduce unnecessary model input, rejected calls, and manual evidence supplementation while preserving authoritative same-flow verification, privacy, origin policy, and truthful unavailable results. Validate the changes using the previous frozen 40-cell experiment, repository-native regressions, and a new repeated comparison on pinned real projects with a reusable native browser baseline.

## Progress

- [x] Read repository instructions, contracts, and the prior experiment. Update clean local `main` to exact upstream `f96443f` with explicit user approval; preserve a separate baseline source archive.
- [x] 1. Compact schema7 summaries retain every check/attempt; full observations use bounded opaque resources. Focused19tests, typecheck/build and a real public-stdio/isolated-Chromium smoke passed; evidence/image reads do not replay actions. Matched released0.12.0 smoke retained separately.
- [x] 2. Typed viewport/obstruction/numeric/network checks, completion receipts and minimumPostFixAttempts implemented.61focusedtests and typecheck passed; public-stdio live test observed delayed bodies, rejected partial geometry3times and verified full repair3times (8actualflows total).
- [x] 3. Canonical schemas publish validated static examples; validation through public SDK handles returns safe field paths/options/constraints without rejected values.7focusedtests/typecheck passed; public-stdio rejection and unchanged8flow proof passed (catalog133060bytes).
- [x] 4. Explicit contained .log capture, shared guarded Next log reader, recognized encoded-value masking and field-aware host metadata preservation implemented.64focusedtests/typecheck and a13flow public-stdio live proof passed, including numeric evaluation masking and pixel suppression.
- [x] 5. Detection schema3 retains conflict provenance, offers grounded explicit hosts and exact workspace-root recovery.70focusedtests/typecheck passed; corrected real Next public-stdio proof passed21assertions, including actual Server Action/header→source→trace linkage.
- [x] 6. Completed 54 fresh model conversations: three pinned small upstream examples, three repetitions, Astra Max and 6.1 Sol Max, and native/released0.12.0/frozen-candidate arms. Individually audited every run; retained all timeouts, MCP rejections, missing reports and scope observations. All 565 frozen input files were unchanged during measurement.
- [x] Completed final local verification: 262 tests in 40 files, typecheck/build, the 13-flow public-stdio workflow smoke and four additional public-stdio review controls. Reviewed the source diff and cleaned owned browser/trial processes and the temporary PostgreSQL container. Rendered and visually inspected all 11 report pages; uploaded a new PDF to Drive and verified its metadata and 96006-byte size.

## Surprises & Discoveries

- The original checkout was clean but still on 0.11.0. The measured released baseline is 0.12.0, so forward synchronization was necessary and explicitly approved.
- The prior experiment's two privacy failures occurred in independent raw terminal-log reads; MCP browser outputs were redacted. Its Next fixture had conflicting Vite/Next configs, so it did not measure the integrated Next adapter.
- Capture already supports summary/include/delta. This work focuses compact output on reproduction and verification while keeping authoritative evidence intact.
- A live step2 test initially tried to read the baseline PNG after six candidate repetitions and hit the documented four-file quota. The harness now reads needed pixels immediately after each phase; retention policy was not weakened. This was a smoke-harness failure, not a model trial or an incorrect verification verdict.

- The first public Next full capture caught our missing wire field for the new network body-completion observation. The concrete schema now includes it and the facade regression exercises it. The earlier internal-only smoke could not detect that omission.

- Final public-stdio controls found issues outside the measured Next canary scope: a prior session/auth value could enter a new scenario name, short input could corrupt a semantic locator kind, and masking could expand bounded name/file fields. Fixed these locally and verified all four controls. Preserved the measured candidate source before those changes; the 54 model conversations were not rerun after the fixes.
- One released Sol trial used candidate-checkout cleanup with `--all-idle` and closed two registry instances without per-trial ownership proof. This remains a scope violation; it is not erased from the comparison. An authorized native evidence-collector adaptation was reviewed separately and did not weaken acceptance.

## Decision Log

- 2026-10-14: Preserve exactly 13 public tools. Extend existing contracts and use bounded MCP resources rather than introducing overlapping browser tools.
- 2026-10-14: Keep authoritative full verification internal. Summaries must be projections of the same evaluated result, never a cheaper verification path.
- 2026-10-14: Retained evidence is session-owned, immutable, non-enumerable, bounded and expired on close or private-input changes. Missing/expired evidence remains explicit.
- 2026-10-14: Keep the frozen previous experiment unchanged. New measurements identify the source commit and working-tree digest independently of the published package version.
- 2026-10-14: Keep patch correctness, required evidence, normal CLI completion and report-file presence separate. Count timeouts in all-run outcomes and leave missing usage null. Compare time/token ratios only within eligible matched pairs; do not pool the old 40 conversations with the new 54.
- 2026-10-14: Preserve measured source separately from final locally fixed source. Additional privacy/contract controls qualify the final changes without retrospectively changing benchmark results.

## Outcomes & Retrospective

All six authorized improvements are implemented and verified locally. Exactly 13 public tools remain. Compact record/verify responses project authoritative full evidence into bounded opaque resources; typed geometry/numeric/network checks and observable completion support repeated verification; canonical schema guidance avoids rejected-value echoes; explicit contained logs and session privacy preserve host metadata; framework recovery retains grounded conflict provenance; and the pinned benchmark records actual Max-model repair work.

All 54 submitted patches passed the independent browser oracle and all 54 retained the required baseline and repeated product evidence. Normal CLI completion was 45/54; nine runs timed out and three lacked report.json. All 18 Next runs passed the scoped text-canary audit. Optional existing console failures remain failures in receipts rather than being relabeled. These are seeded defects in three small upstream examples, not production-repository or naturally discovered bug results.

Against released0.12.0, the measured candidate had 38 MCP rejections in 381 calls versus 57 in 468; supplementary native browser evidence occurred in 4/18 candidate runs versus 9/18 released runs. Eligible candidate/native paired median time ratios were 1.014 for Astra (n=9) and 1.060 for Sol (n=3); input ratios were 1.638 and 1.473. These measurements show no general time/token saving or requirement to use the plugin. The native collector was reusable and ordinary, but capture profiles and model-authored scripts were not identical across arms. Shared hardware, small pair counts, independent timeout outcomes and the scope violation limit generalization.

The final source additionally fixes prior-session/auth scenario-name redaction, semantic locator preservation and masked field bounds. Its 262-test suite, typecheck/build, 13-flow public-stdio workflow and four live review controls passed. The measured candidate is archived independently, so these final fixes do not alter the reported model measurements. Final cleanup found no surviving owned browser/trial processes or temporary database container.

The 11-page Turkish PDF was rendered, inspected and uploaded as a new Drive file. Metadata readback confirmed PDF MIME type, title, URL and the local 96006-byte size: [Web Debug improvements and model comparison](https://drive.google.com/file/d/1BhE5SW_sskcdq3XOeC2OjPZl2nbSGNuf/view?usp=drivesdk). Source changes remain uncommitted on the approved existing main. Publication, installed-plugin replacement and production readiness are not claimed.

## Context and Orientation

Work in `/Users/marlonjd/Developer/monorepos/web-debug-mcp`. `src/index.ts` is the sole MCP facade; `src/domain/types.ts` and `wire-schemas.ts` define contracts. `SessionManager` owns authoritative attempts, secrets and lifecycle; core output projection/resources must not bypass it. Browser adapters implement fresh observations; `scenario-contract.ts` and `scenario-verification.ts` normalize and evaluate checks. Detection is in `capabilities.ts`; privacy is in `private-values.ts`/`redaction.ts`. Bundled workflow recipes are under `plugins/web-debug/skills/web-debug-workflow/`.

The frozen experiment and report are under `/Users/marlonjd/Developer/monorepos/avia/.state/web-debug-evidence-benchmark-20261013`. New disposable sources, raw validation and comparison records belong under `/Users/marlonjd/Developer/monorepos/avia/.state/web-debug-improvements-20261014`; baseline provenance there pins upstream `f96443f481c0f394ff552edbbb44c2d7e969c927`. Neither Avia source nor published artifacts is an implementation target.

## Plan of Work

Implement each numbered milestone and its focused proof sequentially. Compact projections return check outcomes, repetition/isolation facts, missing evidence, differences and full-evidence references. Typed checks must capture actual geometry/network/numeric observations and remain unavailable when unsupported; completion conditions use observable state within bounded deadlines. API guidance derives from the same schemas that validate requests, with private values excluded from errors. Log capture accepts only an explicitly configured contained file and uses no-follow bounded reads and the same session privacy policy. Ambiguous detection retains its safe default and offers explicit grounded recovery. Finally prepare pinned real applications and hidden defects, then freeze prompts/scoring/order before repeated model trials.

## Concrete Steps

1. Record baseline deterministic results before changing implementation. Keep dependency installs local and ignored.
2. Implement numbered steps with regression tests for verdict parity, evidence/resource bounds, privacy and unsupported adapters. Update existing native smoke consumers for explicit full output where needed.
3. Run `npm test`, `npm run typecheck`, `npm run build` and relevant `smoke:*` commands. Browser runs use command-owned test profiles and record PID/start identity cleanup.
4. Freeze the new comparison input hashes before model trials. Use real fresh `codex exec` calls for `gpt-6-astra` and `gpt-6.1-sol` with `model_reasoning_effort="max"`; do not substitute manual answers or synthetic usage. Keep ordinary-tool, released-MCP and candidate-MCP arms separately identifiable when comparing the new version.
5. Audit all results, report normal completion separately from evidence completeness, render/inspect the updated report and review the complete diff.

## Validation and Acceptance

- All original verdict/freshness/isolation/security constraints hold through compact output and recorded full evidence. Resource eviction, session close and private-input changes return bounded unavailable errors.
- Offscreen/obstructed controls cannot satisfy their declared geometry checks; numeric and network assertions use actual observations; async completion is bounded and does not substitute elapsed-only waiting.
- Invalid calls receive useful field/options/example guidance without echoing private inputs. The canonical schemas remain the single definition of valid calls.
- Log reads cannot escape their explicit project root or follow symlinks, and retained/returned records mask session secrets. Host-created identifiers remain stable when an unrelated short fill value matches a character.
- Conflicting framework markers remain explicit; any selected host is backed by actual application markers and compatible live evidence. A clean live Next case supplies actual action/runtime evidence.
- New benchmark contains pinned source/license/provenance, withheld bug details, independent trial repetitions, an equivalent reusable native browser collector and all raw outcomes. Claims stay descriptive and scoped.
- Required repository checks and relevant live surfaces pass; remaining unsupported browser/environment coverage is named literally.

## Idempotence and Recovery

No branch creation or publication is required. Preserve existing user changes; the initial checkout was clean. Run retries only for diagnosed infrastructure problems and retain their records. Never erase failed model trials or choose outcome-selected reruns. Close only command-owned browser/server processes, and retain independent baseline sources and input manifests for comparison. Use the current plan to resume after context loss.

## Artifacts and Notes

- Prior report: `web-debug-evidence-benchmark-20261013/output/pdf/web-debug-esdeger-kanit-karsilastirmasi.pdf`.
- Baseline source and archive: `web-debug-improvements-20261014/baseline-source`, `baseline-provenance.json`.
- Approved starting commit: `f96443f481c0f394ff552edbbb44c2d7e969c927`.
- New experiment: `web-debug-improvements-20261014/real-project-benchmark/`; `all-results.json`, `analysis/manual-audit.json`, `analysis/metrics.json` and `analysis/final-summary.json` retain all 54 outcomes and calculations.
- Frozen measurement source: `web-debug-improvements-20261014/measured-candidate-source`; measured manifest SHA256 `532af7cb13674439efd4f1be27519f4a7aeff5dad3f931ddf2a636083ac53021`.
- Final source verification: `web-debug-improvements-20261014/final-local-verification.json`; final runtime manifest SHA256 `858ac1bc63b06b1580600f682c0c4110404f80375578b6f5c8b7521b495f8aca`.
- Report: `web-debug-improvements-20261014/output/pdf/web-debug-gelistirmeler-ve-model-karsilastirmasi.pdf`; 11 pages; MD5 `79519b42279cb0fc74c2935dc7fb5d3a`; Drive file ID `1BhE5SW_sskcdq3XOeC2OjPZl2nbSGNuf`.

## Interfaces and Dependencies

Use existing MCP SDK, Zod, Playwright/CDP, Node bounded filesystem/crypto primitives and adapter capabilities. Keep one tool catalog and no new hosted or production endpoint. Source contracts are unreleased until a separately authorized release.

## Revision History

- 2026-10-14: Created a restartable plan for the six explicitly authorized sequential improvements and comparisons.
- 2026-10-14: Completed all six changes, audited all 54 trials, separated measured/final source, passed final local gates and live review controls, verified cleanup, and delivered the visually inspected PDF through Drive. Moved the plan and updated its registry together.
