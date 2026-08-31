<!-- harness-plan:v1
id: capture-contract-and-runtime-capabilities
status: completed
created: 2026-08-30
updated: 2026-08-31
completed: 2026-08-31
owner: Web Debug maintainers
-->

# Make capture concise, typed, and runtime-aware

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). This plan covers the selected 0.6 source-next improvements and intentionally excludes a hosted CI matrix and real-project agent evaluations.

## Purpose / Big Picture

The default `web_issue_capture` response should be small enough for routine agent use while preserving explicit access to complete, selected, and changed evidence. Every public tool should advertise and enforce its own result schema. Project detection should stop treating monorepo test/dev dependencies as confirmed application runtimes, and a live session should distinguish source-project potential from the capabilities of the selected Chromium or Safari transport. `SessionManager` should remain the policy façade while high-cohesion replay, evidence, scenario-contract, and lifecycle helpers move into focused modules.

Success is visible when the public MCP still exposes exactly 13 tools, summary/full/include/delta capture behavior is deterministic and bounded, all 13 successes validate against concrete schemas, the repository root is not falsely classified as a five-framework app, Chromium and Safari report distinct negotiated runtime capabilities, and `SessionManager` is materially smaller without changing scenario-verification semantics.

## Progress

- [x] (2026-08-30 23:18Z) Verified the clean released 0.5.0 baseline: 28 test files and 124 tests passed; typecheck, native harness (544 checks), and formal harness check exited zero.
- [x] (2026-08-30 23:22Z) Inspected capture, output-schema, detection, adapter, and SessionManager boundaries; obtained three independent read-only design reviews.
- [x] (2026-08-30 23:37Z) Implemented and tested summary/full/include/delta manual capture while keeping authoritative verification evidence full.
- [x] (2026-08-30 23:36Z) Implemented and enforced concrete tool-specific output schemas for all 13 public tools.
- [x] (2026-08-31 00:20Z) Implemented confidence-aware project detection, bounded workspace discovery, and negotiated Chromium/Safari runtime capability reporting; corrected independent-review findings for bare app/pages, BiDi response shape, Safari network degradation, weak-root provenance, and matrix target provenance.
- [x] (2026-08-30 23:49Z) Extracted replay, evidence/cursors, scenario contract/verification, lifecycle, operation-context, and private-value helpers while keeping `SessionManager` as the façade; manager size fell from 2,066 to 1,408 lines.
- [x] (2026-08-30 23:55Z) Updated source-next identity and product/architecture/security/reliability/harness documentation while preserving immutable plugin/MCP runtime `0.5.0`.
- [x] (2026-08-31 00:25Z) Completed deterministic, package, harness, independent-review, Chromium/framework, local-fidelity, and demo gates; Safari live remained literally blocked after two pre-capture wait timeouts.

## Surprises & Discoveries

- The repository root currently reports Next, Angular, Vite, React, and Vue because dependencies, development dependencies, and peer dependencies are merged before classification even though the root has no application entry/config marker.
- Manual capture and verification representative capture currently share one full-bundle method. Public projection must therefore be added after authoritative capture, not by weakening the verification path.
- The generic MCP envelope permits schema-invalid routing fakes and gives clients no information about each tool's data shape; advertised schemas must also be checked at the success boundary.
- Default capture currently opts into screenshots. The summary profile creates no pixels; full and explicit inclusion are the opt-in pixel paths, with existing auth/private-input suppression retained.

## Decision Log

- 2026-08-30, Web Debug maintainers: Use source version `0.6.0-next.0`; keep immutable npm, GitHub release, Codex plugin, and bundled MCP at `0.5.0` during this task. Rationale: the public capture and capability wire contracts change and no publication was requested.
- 2026-08-30, Web Debug maintainers: Replace `captureScreenshot` rather than retain an alias. The profiles are `summary` (default), `full`, `include`, and `delta`; this repository explicitly does not preserve obsolete compatibility paths.
- 2026-08-30, Web Debug maintainers: Every manual capture is internally redacted and authoritative before output projection. Verification representative captures bypass manual profiles and remain complete EvidenceBundle v4 values.
- 2026-08-30, Web Debug maintainers: Delta means current bounded values for changed surfaces since an opaque, reusable, session-bound cursor; it is not JSON Patch, an event stream, or browser-state time travel. Retain at most eight cursors and purge them on close.
- 2026-08-30, Web Debug maintainers: Treat direct application markers, runtime dependencies, and corroborated scripts as confirmed evidence. Treat uncorroborated dev/peer dependencies as candidates and never auto-select a workspace child.
- 2026-08-30, Web Debug maintainers: Store `projectCapabilities` and `runtimeCapabilities` separately. Runtime capabilities are negotiated from the selected adapter and augmented only by confirmed project enrichments.
- 2026-08-30, Web Debug maintainers: Keep one exported `SessionManager` façade. Extract pure/private-value, replay, evidence projection/cursor, scenario-contract, and lifecycle/operation helpers incrementally; do not rewrite the scenario verifier in this slice.

## Outcomes & Retrospective

Source-next `0.6.0-next.0` now implements all selected improvements without changing the 13-tool catalog or publishing a release. Default manual capture is compact and non-pixel; explicit full/include/delta profiles preserve access to bounded detail, screenshot paths stay private, and authoritative scenario evidence remains complete. All tools advertise/enforce concrete root data schemas. Root detection no longer promotes fixture/dev-only dependencies or unrelated `app/pages` directories, and live sessions separate project eligibility from negotiated transport capability. `SessionManager` is a 1,408-line façade backed by focused modules instead of the former 2,066-line mixed implementation.

Final local evidence is 31 files / 155 deterministic tests, typecheck, build, native harness 572, zero-error/warning formal harness, exact 152-entry tarball/fresh-prefix handshake with 13 concrete schemas, Chromium/React-Vite/Next/Vue/Angular/local-fidelity smokes, and all six comparison scenarios. Safari 26.6.2 opened WebDriver but timed out on the fixture wait twice before capture, so fresh Safari live evidence is `blocked`; deterministic Safari/BiDi/capability tests pass and immutable `0.5.0` Safari evidence remains historical. CI matrix and repeated real-project eval expansion remain deferred exactly as requested. No publish, tag, marketplace, plugin-install, or dist-tag mutation occurred.

## Context and Orientation

`src/index.ts` registers the 13 MCP tools and binds each to its concrete schema from `src/domain/wire-schemas.ts`. `src/core/mcp-response.ts` serializes, validates, bounds, and emits the canonical envelope. `src/domain/types.ts` owns public evidence, session, scenario, and capability shapes. `src/core/capabilities.ts` detects projects. `src/adapters/browser.ts` is the negotiated transport contract; Chromium and Safari implement it. `src/core/session-manager.ts` remains the session/policy façade while focused lifecycle, replay, evidence, scenario, operation-context, and private-value modules own extracted concerns. `src/core/evidence.ts` composes authoritative EvidenceBundle v4 values.

The active browser policy remains loopback-first, same-origin, bounded, redacted, and explicit about remote/side-effectful behavior. No new tool, hosted target, credential path, scenario persistence, framework parity claim, CI workflow, or real-project eval belongs to this plan.

## Plan of Work

Milestone 1 defines wire schemas and capture types from one domain module, then changes `web_issue_capture` input to the four profiles. The manager collects authoritative evidence, projects a compact summary or requested surfaces, maintains an eight-entry cursor ring, and attaches screenshots only for explicit full/include/delta requests. Focused tests prove size, redaction, cursor reuse/eviction, selected keys, and screenshot suppression.

Milestone 2 replaces the generic top-level data field with a per-tool schema factory. All 13 tool registrations pass a concrete schema to both the advertised output and `successToolResult`; schema drift becomes a bounded `RESULT_SCHEMA_VIOLATION`. Stable tool/profile fields are explicit while deep bounded runtime/upstream payloads remain JSON leaves.

Milestone 3 changes project detection to report project kind, confirmed framework detections, bounded candidate signals, and project capabilities. Workspace discovery is limited to declared workspace patterns and does not choose a child automatically. The adapter contract reports runtime capabilities after start; session summaries expose both maps and warnings explain gaps.

Milestone 4 extracts cohesive internal modules. Pure scenario/private helpers and replay move first, capture projection/cursor logic moves with the new contract, and lifecycle/operation helpers move after capability negotiation. The manager retains session maps, mutation ordering, policy decisions, and scenario-verification orchestration.

Milestone 5 updates source-next identity, contract docs, architecture, examples, compatibility truth, active plan evidence, and harness assertions. Run deterministic gates, package/handshake checks, and the relevant Chromium/React-Vite/Next/Vue/Angular/Safari/local-fidelity smokes. CI matrix and real-project evals remain explicitly deferred.

## Concrete Steps

Work in `/Users/marlonjd/Developer/monorepos/web-debug-mcp` on the current branch only.

1. Add domain wire schemas and capture profiles; run focused MCP response/routing/session tests.
2. Add detection provenance and runtime negotiation; run capability, adapter, session, doctor, and MCP tests.
3. Extract internal modules one slice at a time; after each slice run `npm test` and `npm run typecheck`.
4. Update version and documentation; run `npm run build`, `npm run harness:check`, and the formal harness checker.
5. Run `npm pack --dry-run --json`, fresh-prefix stdio handshake, selected live smokes, `git diff --check`, and process cleanup checks.

If a slice breaks behavior, revert only the current uncommitted slice through an explicit patch and retain prior verified slices. Do not reset the worktree or alter unrelated user changes.

## Validation and Acceptance

- `npm test`: every deterministic test passes, including all four capture profiles, cursor boundaries, per-tool schema validation, monorepo/root detection, Chromium/Safari negotiation, and unchanged scenario verification.
- `npm run typecheck`: both production and test TypeScript projects exit with no diagnostics.
- `npm run build`: `dist/` is emitted.
- `npm run harness:check`: prints `harness-check: PASS`; stale-candidate certification remains literal unless independently refreshed with owner authority.
- Formal harness check exits zero with no errors or warnings.
- Package dry-run includes the runnable binary and built exports; a fresh-prefix stdio client observes version `0.6.0-next.0`, 13 tools, and distinct concrete output data schemas.
- Default capture returns profile `summary`, no screenshot artifact, and a response under 16 KiB on the React/Vite fixture. Full/include/delta behavior matches the profile contract and never exposes a local screenshot path.
- Repository-root detection does not confirm fixture-only frameworks. Fixture roots continue confirming Vanilla, React/Vite, Next/React, Angular, and Vue/Vite.
- A Chromium session and Safari session report separate project/runtime capabilities; unsupported Safari debugger/semantic/framework surfaces remain false with bounded warnings.
- Relevant live smokes remain passed; missing platform/browser evidence is named rather than inferred.

## Idempotence and Recovery

Capture cursors are opaque, reusable, bounded, and session-local. Unknown, evicted, cross-session, or stale-generation cursors fail with explicit errors and do not mutate browser state beyond the capture itself. Close purges cursor, replay, private auth/action, and scenario state under the existing lifecycle contract.

No release, dist-tag, Git tag, GitHub release, marketplace, or installed-plugin mutation is authorized by this plan. The immutable 0.5.0 distribution remains the rollback point while 0.6.0-next.0 exists only in the source tree.

## Artifacts and Notes

- Baseline: 28 test files / 124 tests, typecheck exit 0, native harness 544 checks, formal harness check exit 0.
- Design reviews were read-only and identified the exact capture, detection, capability, schema, and refactor seams recorded above.
- Final exact archive: 152 entries; SHA-256 `424a7a2c755c889b94019b9ad5e1177f2681730e3230418926fa8af9f2a33967`; clean-prefix stdio returned version `0.6.0-next.0`, 13 tools, and 13 concrete schemas.
- Independent final reviews found and then verified fixes for summary overflow disclosure, screenshot-path warning leakage, replay self-delta, capture profile schema discrimination, URL-bound mismatch, app/pages false positives, Safari BiDi parsing/capability truth, weak-root provenance, and matrix candidate provenance.

## Interfaces and Dependencies

Keep the existing `@modelcontextprotocol/sdk`, Zod, and Playwright dependencies. Add no package for hashing, workspace discovery, schema generation, or cursor storage. Use Node crypto, bounded filesystem inspection, adapter methods, and Zod 4 already present.

Stable outer interfaces remain the 13 tool names, the canonical `{ok,data|error,artifacts,warnings}` envelope, same-origin policy, and the `SessionManager` exported façade. Source-next uses project/session schema 2, capture/evidence schema 4, environment fingerprint schema 3, and scenario/verification schema 5; it deliberately changes capture input/output and capability field names.

## Revision History

- (2026-08-30 23:22Z) Change: Created the plan from the selected improvement set. Reason: Exclude CI matrix and real-project eval expansion as requested while making the cross-cutting work restartable.
- (2026-08-31 00:25Z) Change: Completed source-next implementation, independent review, and local freeze verification. Reason: Every selected behavior is implemented and all available gates pass; Safari's unavailable fresh live evidence is explicitly blocked rather than inferred.
  Semantic-Review: reviewer=Web Debug maintainers; reviewed-at=2026-08-31 00:25Z; content-sha256=563c725ab006fd36d0fe2b2531a39df95d9b3acc27d0ae64c9e9c9b714d84d3d; evidence=Reviewed every selected capture, schema, detection, runtime-capability, refactor, privacy, package, deterministic, live-browser, blocked-Safari, rollback, and deferred-scope claim against implementation and observed outputs; two independent read-only reviewers rechecked the corrected tree with no remaining code findings.
