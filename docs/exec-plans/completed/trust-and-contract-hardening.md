<!-- harness-plan:v1
id: trust-and-contract-hardening
status: completed
created: 2026-08-29
updated: 2026-08-29
completed: 2026-08-29
owner: Platform Engineering
-->

# Harden Web Debug trust boundaries and product contracts

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). This plan covers local source, tests, documentation, and package-contract work only; it does not authorize publication, tags, GitHub writes, plugin installation, production claims, or external browser targets.

## Purpose / Big Picture

Make the existing local Web Debug workflow truthful at every boundary before adding more framework depth. A caller should be unable to leave the selected top-level origin through redirects or browser actions, receive an unbounded MCP payload, retain private auth state after session close, or race Next inspection against another session mutation. The public MCP contract should expose accurate effects, structured machine-readable output, bounded progress for long verification, a self-diagnosing CLI path, and enough deterministic coverage to prove every registered tool is wired correctly.

Success is observable when focused security and lifecycle regressions pass, all 13 tools are exercised through in-memory MCP transport, package/server/registry/plugin version identities derive from one checked source, stale certification is no longer presented as current, deterministic repository gates pass, relevant live smokes pass when the local runtimes are available, and the worktree contains only intentional changes.

## Progress

- [x] (2026-08-29 17:57Z) Create the active ExecPlan and register the cross-cutting implementation before source edits.
- [x] (2026-08-29 20:15Z) Implement fixed-origin Chromium/Safari policy, streaming and final-result byte budgets, destructive session close, screenshot quotas, and leased/cancellable Next inspection.
- [x] (2026-08-29 20:15Z) Centralize source runtime identity, separate prerelease `0.4.0-next.0` from the immutable released plugin `0.3.3`, correct all tool annotations, and make stale certification reporting mechanical.
- [x] (2026-08-29 20:15Z) Add canonical structured MCP results, bounded progress notifications, transactional screenshot resources, and the bounded local `doctor` CLI with help and protocol-shaped readiness checks.
- [x] (2026-08-29 20:15Z) Expand browser actions with press/select/check/hover/scroll while preserving exact locators, private input handling, screenshot suppression, schema versioning, and fail-closed replay.
- [x] (2026-08-29 20:15Z) Strengthen all-handler MCP routing, source/test type checks, live side-effect rejection, process-group teardown, compatibility evidence, and deterministic catalog/run grading.
- [x] (2026-08-29 20:15Z) Pass 106 deterministic tests, typecheck, build, 500 native harness checks, fresh-prefix prerelease handshake, and all local browser/framework smokes; update canonical docs without publishing or claiming production authority.

## Surprises & Discoveries

- The baseline repository is clean on `main`; `npm test` passes 61 tests, `npm run typecheck` passes, and `npm run harness:check` passes 239 native checks.
- The broader documented harness command currently reports 24 strict completed-plan/index errors, while `docs/agent-harness/certification.json` is expired and bound to an older source/hash. Therefore current `CERT000` wording is stale even though the native source gate passes.
- Package and MCP metadata report `0.3.3`, while process registry records and cleanup reports default to `0.3.1`.
- Normal Chromium and Safari sessions validate requested URLs but do not consistently reject cross-origin final redirects or action-triggered top-level navigation.
- Closed managed sessions remain in memory and retain private start options, including disposable auth state, after public scenario/replay data is cleared.
- Real two-origin Chrome probes showed that Playwright page routing alone rejects too late for redirect hops and popup-first requests. Selected-target CDP `Fetch` interception plus a context-wide frame-less-document fallback reduced destination hits to zero in launch and attach mode; the fallback's temporary context cache effect is now disclosed.
- A screenshot can complete after its optional timeout, and a valid capture can exceed the resource or disk budget after pixels already exist. Pending-operation tracking, late-file deletion, transactional handle commit, and a four-file/16 MiB session quota were required to make the boundary durable.
- Wrapper-only SIGKILL can orphan Vite/Next grandchildren. POSIX smokes now own a distinct process group, and a stubborn-grandchild regression proves bounded group escalation.
- The MCP SDK rejects invalid Zod input before handler dispatch, so SDK-level validation errors cannot use the handler's structured envelope; this is an explicit documented protocol exception rather than a fabricated compatibility wrapper.

## Decision Log

- Decision: Fix trust, lifecycle, and truthfulness gaps before expanding framework parity. Rationale: these gaps undermine already-documented guarantees and carry more user risk than missing optional enrichment. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Keep one 13-tool MCP facade; add behavior through existing tools and a package-only `doctor` command. Rationale: the repository contract favors adapter and CLI improvements over catalog growth. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Keep the immutable public npm/plugin runtime at `0.3.3`, but identify the changed source package and MCP handshake as prerelease `0.4.0-next.0`; package metadata records both identities. Rationale: source-next must not impersonate the released contract, while pinning the plugin to an unpublished version would break the working install path. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Treat MCP text plus structured content as two intentional representations for humans and machines, with one canonical bounded value and no legacy field aliases. Rationale: both representations are protocol-native and must not diverge. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Fail closed on every frame-less Chromium document request while the selected target is attached. Rationale: `noopener` and `no-referrer` remove the metadata needed to attribute a popup-first request safely; allowing it would violate the zero-request origin boundary. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Retain at most four screenshots and 16 MiB per session, with 4 MiB per file and one-hour resource TTL as an upper bound. Rationale: adapters write pixels before MCP delivery, so both disk quota and early handle expiry must be explicit and testable. Date/Owner: 2026-08-29 / Platform Engineering.

## Outcomes & Retrospective

The source-next workflow is locally complete. Chromium and Safari now fix the selected top-level origin before navigation, reject redirects/actions/popups with stable errors, and leave ordinary cross-origin subresources available outside elevated mode. Redaction and transport work is bounded before expensive processing; complete MCP results use one schema-validated envelope, progress is liveness-only, screenshot handles commit only after a valid result, and session close destroys private start/auth/action/evidence state before retaining a capped tombstone. Next inspection shares the lease, expanded actions remain deterministic, replay fails closed when its start or input is unavailable, and `doctor` distinguishes configuration warnings from protocol readiness.

Observed evidence is 106/106 deterministic tests, source and test typecheck, build, `harness-check: PASS (500 checks; certification: stale-candidate)`, a fresh-prefix `web-debug-mcp-0.4.0-next.0.tgz` handshake reporting version `0.4.0-next.0`, 13 tools, and output schemas, plus passing Chromium, React/Vite, Next, Safari, and strengthened local-fidelity smokes. Independent read-only security review reproduced and then cleared the redirect, launch-popup, and attach `no-referrer`/`noopener` escape probes with zero destination hits. `git diff --check` passes.

No npm publication, tag, GitHub write, plugin update, external CDP target, current HMAC certification, provider authority, or production evidence was created. The formal repository checker still reports the same 24 historical completed-plan/index errors tracked by DEBT-003; no error names this plan. Exact framework parity, approved external-CDP evidence, and fresh owner-key attestation remain the previously scoped follow-ups rather than blockers for this local source increment.

## Context and Orientation

`src/index.ts` owns public schemas, tool registration, request wrapping, and stdio startup. `src/domain/types.ts` owns public action/evidence/scenario contracts. `src/core/session-manager.ts` owns live sessions, private start settings, leases, replay, adaptive verification, and close semantics. `src/core/redaction.ts` owns defensive sanitization; `src/core/process-registry.ts` owns process identity and cleanup reporting. Chromium and Safari transports live under `src/adapters/`; Next and Vite adapters fetch local framework metadata. `bin/web-debug-mcp.mjs` dispatches stdio or package-only commands.

The current public npm package and plugin remain `0.3.3`; the source checkout and its MCP handshake are `0.4.0-next.0` and release pending. Scenarios stay session-owned and in-memory. Browser targets remain loopback-only unless explicit remote opt-in is supplied, while top-level navigation remains same-origin even for opted-in targets. Cross-origin subresources are not prohibited by the ordinary same-origin navigation policy. Auth-seeded and private-input screenshots remain suppressed.

## Plan of Work

Milestone 1 adds a core top-level-origin invariant and adapter final-URL checks for initial navigation, click, reload, and popup/secondary-page behavior. It adds bounded response readers, sanitizer budgets, a final MCP response budget, evaluate-result bounds, closed-session destruction with bounded sanitized tombstones, explicit artifact retention behavior, and lease/cancellation propagation for Next inspection. Focused tests prove each former escape or retention path.

Milestone 2 introduces one package-derived release identity used by MCP metadata, process records, cleanup reports, and verification checks. It corrects effect annotations for all tools and makes the native harness validate certification presence, expiry, source ancestry/hash consistency, or explicitly report a stale candidate without claiming current certification.

Milestone 3 gives tools declared output schemas and `structuredContent` based on the same bounded value used for text content. Long scenario phases emit bounded MCP progress only when the caller supplies a progress token. A package-only `doctor` command validates Node/runtime inputs, explicit browser configuration, project detection, optional local URL readiness, and framework endpoint availability without discovering or launching an arbitrary browser.

Milestone 4 adds only essential deterministic action variants supported by both selected transports where feasible, such as keyboard press, selection, checked state, hover, and bounded scrolling. Replay, scenario hashing, redaction, and safe restore are updated atomically; unsupported Safari behavior remains explicit.

Milestone 5 exercises every public handler through in-memory MCP transport, type-checks tests with a dedicated configuration, adds live side-effect-rejection evidence for evaluation, centralizes fixture readiness/teardown with bounded escalation, records exact supported framework/runtime versions, and turns existing repair scenarios into a repeatable task-level evaluation contract without calling external models automatically.

## Concrete Steps

Work from `/Users/marlonjd/Developer/monorepos/web-debug-mcp` on the existing branch. Use `apply_patch` for edits and preserve the clean user worktree outside this plan.

1. Add focused failing tests for origin escape, unbounded results/readers, close purge/tombstone caps, Next lease/cancellation, version identity, and annotations; implement the smallest code that passes them.
2. Add MCP output/progress and doctor contracts using the installed `@modelcontextprotocol/sdk`, existing Zod dependency, and Node APIs; add no dependency unless existing APIs are demonstrated insufficient.
3. Extend actions through the existing `BrowserAction` and `web_browser_action` schemas, both adapters, replay sanitizer, validation, docs, and fixtures.
4. Add the verification layers and update architecture, security, reliability, environment/output/verification matrices, README, skill guidance, and debt/certification wording where behavior changed.
5. Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run harness:check`. Run the documented broader harness command and record its literal result. Run proportional live smokes with an explicit command-owned browser/runtime and clean only command-owned processes afterward.

Expected source gates exit zero. Any unavailable Safari, external target, provider authority, release, or production evidence stays literally unavailable and does not block locally scoped code that passes its applicable contract.

## Validation and Acceptance

- A loopback start redirected to another origin, a click-triggered cross-origin navigation, a cross-origin reload state, or a secondary popup fails with a stable bounded error in Chromium and Safari without blocking ordinary cross-origin subresources.
- Evaluate, Next, Vite, error details, structured content, and final MCP serialization cannot exceed their declared byte budgets; decisive verification fields are never silently truncated into success.
- Closing a session clears private actions, replay, redaction secrets, auth state, and raw start URL from managed memory; closed-session idempotency uses a bounded sanitized record and artifact retention/cleanup is explicit.
- Next inspection shares the exclusive abortable lease and passes the operation context into every local framework request.
- Package metadata, MCP handshake, process registry record, cleanup report, plugin pins/manifests, and harness checks agree on release identity or report an intentional unreleased state.
- All tool annotations match observable effects; all 13 schema-to-handler paths have MCP transport tests.
- Structured results validate against advertised output schemas, progress is monotonic and bounded when requested, and `doctor` returns bounded JSON with exact recovery guidance.
- Deterministic tests, source/test type checks, build, and native harness pass. Relevant live smokes pass or name a literal environment blocker. Formal certification is claimed only when the configured verifier actually accepts a fresh attestation.

## Idempotence and Recovery

Focused tests and local checks are safe to rerun. Browser and fixture processes must be command-owned, bounded, awaited during teardown, and escalated only after identity-preserving graceful shutdown fails. Failed session startup removes only its exact artifact directory. Closed-session cleanup never deletes a broad temporary root. No existing npm version, Git tag, release, plugin installation, branch, or remote target is changed by this plan.

If a structured-output or action change cannot remain bounded across both transports, keep the old public tool count, return an explicit unavailable capability, and record the unresolved behavior rather than adding an unverified fallback. If formal certification remains blocked by historical plan schema, downgrade current certification claims and track the exact remaining migration instead of fabricating evidence.

## Artifacts and Notes

- Baseline native evidence: 61 tests passed; source typecheck passed; `harness-check: PASS (239 checks)` on 2026-08-29.
- Baseline broader harness evidence: 24 errors, all in historical plan/index strict-schema validation; no runtime source failure was reported.
- Current certification manifest expires at `2026-08-28T14:13:04Z` and references source commit `2338fe69f0ed77ca907ec26f544defff1593ac47`, not current `main`.
- Final deterministic evidence: `npm test` passed 24 files/106 tests; `npm run typecheck`, `npm run build`, and `git diff --check` exited zero; `npm run harness:check` reported `PASS (500 checks; certification: stale-candidate)`.
- Final live evidence: `smoke:live`, `smoke:react-vite`, `smoke:next`, `smoke:safari`, and `smoke:local-fidelity` reported `passed: true`; exact local versions and scopes are frozen in `docs/compatibility-evidence.json`.
- Final distribution evidence: the real local `web-debug-mcp-0.4.0-next.0.tgz` installed 96 packages into a command-owned fresh prefix; stdio reported prerelease version `0.4.0-next.0`, 13 tools, and output schemas for every tool; the temporary prefix/archive were deleted afterward.
- Final formal evidence: `harness.py check --root .` reported 24 errors, 0 warnings, and 5 info items, all errors confined to the historical completed plans/index recorded by DEBT-003.

## Interfaces and Dependencies

Keep `@modelcontextprotocol/sdk`, `playwright-core`, and `zod`. Reuse MCP output schemas, `structuredContent`, request metadata/progress notifications, and content blocks from the installed SDK. Reuse Playwright page/CDP navigation events and W3C WebDriver commands; do not introduce a second browser automation library. Reuse Node streams, fetch bodies, filesystem descriptors, crypto, and process APIs for bounds and diagnostics.

Stable public ownership remains: `src/index.ts` for MCP schemas; `BrowserAction` and result contracts in `src/domain/types.ts`; browser transport behavior behind `BrowserAdapter`; policy, leases, private state, and evidence composition in core. New shared helpers must be narrower than the modules they replace and have deterministic unit tests.

## Revision History

- (2026-08-29 17:57Z) Change: Created and registered the trust-and-contract hardening plan with five locally verifiable milestones. Reason: Convert the authorized improvement review into a restartable implementation without expanding release or production authority.
- (2026-08-29 20:15Z) Change: Completed the local trust, lifecycle, MCP/DX, action, artifact, evaluation, compatibility, and harness milestones; recorded exact validation and remaining external/historical gates. Reason: Make the plan self-contained and completion-ready after independent API, security, product, and harness review.
  Semantic-Review: reviewer=Platform Engineering; reviewed-at=2026-08-29 20:15Z; content-sha256=1f40494e846ca689c3c568c9dd3192cc1d5fe3ed5127317bd80849d27ab5bc0d; evidence=Reviewed all checked milestones, fixed-origin and artifact boundaries, source-versus-release identity, deterministic and live evidence, process recovery, external authority limits, and the unchanged 24-error historical formal baseline.
