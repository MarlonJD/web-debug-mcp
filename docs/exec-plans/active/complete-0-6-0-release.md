<!-- harness-plan:v1
id: complete-0-6-0-release
status: active
created: 2026-08-31
updated: 2026-08-31
completed:
owner: Platform Engineering
-->

# Release Web Debug 0.6.0 and update Codex

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). The user explicitly authorized stable `0.6.0` npm/GitHub publication and updating the installed Codex plugin. Work on the existing `main` branch only.

## Purpose / Big Picture

Freeze the verified `0.6.0-next.0` capture/runtime work together with the new `manual-parity-qualification` skill, promote every live distribution identity to final `0.6.0`, publish one exact tested archive, and update the configured Codex marketplace/plugin without duplicating the MCP registration.

Success is observable when package, lockfile, serverInfo, Git tag, GitHub release, npm `latest`/`next`, both plugin manifests and marketplaces, bundled `.mcp.json`, and the installed Codex plugin agree on final `0.6.0` or its timestamped Codex build. The public MCP still exposes exactly 13 tools with concrete output schemas, and the installed cache contains both workflow skills.

## Progress

- [x] (2026-08-31 00:08Z) Verified GitHub keyring and npm owner authentication; confirmed npm `0.6.0`, Git/GitHub `v0.6.0`, and release are absent; captured the installed Codex `0.5.0` rollback baseline.
- [x] (2026-08-31 00:29Z) Received the coordinated capture/runtime writer freeze, closed its source-next plan, restored formal plan attestation, and audited every tracked/untracked release file.
- [x] (2026-08-31 00:36Z) Promoted package, plugin, marketplace, documentation, tests, harness, workflow guidance, and release notes to final `0.6.0`.
- [x] (2026-08-31 00:41Z) Passed deterministic, type, build, native/formal harness, skill/plugin, audit, exact-archive Node 20/22/24, and cleanup gates; retained the fresh Safari fixture-wait result as literal `blocked` while all other live gates remained passed.
- [ ] Commit and push frozen source, create/push exact annotated `v0.6.0`, publish the tested archive, create the GitHub release, and converge npm dist-tags.
- [ ] Refresh/install the Codex plugin, verify one enabled 0.6 build with two skills and bundled runtime 0.6, then record evidence and close this plan.

## Surprises & Discoveries

- The source-next thread implemented the five selected 0.6 improvements while this thread added a second qualification skill in the same checkout; release requires one explicit writer handoff and one combined freeze.
- The source-next exact archive already handshakes on Node 24 with 13 tools and 13 concrete data schemas, but stable `0.6.0` still needs final-identity archive checks on Node 20, 22, and 24.
- Fresh Chromium, React/Vite, Next, Vue, Angular, local-fidelity, and comparison flows passed. Safari WebDriver opened but two source-next fixture waits timed out; stable release must either obtain a fresh pass after the final fixes or retain a literal scoped blocker without claiming fresh Safari capture evidence.
- Critical new source, extracted modules, tests, and the manual-parity skill are untracked. They must be explicitly audited and staged before building the release archive so the Git tag and tarball cannot diverge.
- The host Python lacks `yaml`; skill/plugin validation succeeds through isolated `uv run --with pyyaml` without changing repository dependencies.

## Decision Log

- 2026-08-31, Platform Engineering: Promote forward to stable `0.6.0`; never rewrite prior versions or tags. Rationale: the current source-next identity is `0.6.0-next.0`, and the user authorized its stable package/plugin release.
- 2026-08-31, Platform Engineering: Keep the 13-tool MCP catalog and publish the breaking capture/profile/schema migration as a minor version. Rationale: this repository explicitly removes obsolete compatibility paths, while semver communicates the public contract change.
- 2026-08-31, Platform Engineering: Publish only an archive built from the exact clean release commit after every intended untracked file is staged and committed. Rationale: prevent dist output from containing source absent from the tag.
- 2026-08-31, Platform Engineering: Use one timestamped Codex build identity and preserve the installed 0.5 snapshot until the public package/GitHub release succeeds. Rationale: plugin rollback is local and reversible; npm versions and Git tags are immutable.
- 2026-08-31, Platform Engineering: Do not create a fresh HMAC/provider attestation in this release. Rationale: stale-candidate certification, external CDP, and provider-production authority require separate ownership and evidence.

## Outcomes & Retrospective

Release in progress. Record exact immutable identities, archive digests, test counts, live evidence, public registry/GitHub state, installed plugin state, and unavailable authority before completion.

## Context and Orientation

`package.json` owns source/MCP/process identity. Release surfaces include `package-lock.json`, `README.md`, `ARCHITECTURE.md`, product/security/reliability/compatibility/harness docs, `docs/releases/0.6.0.md`, `scripts/harness-check.mjs`, `test/release-identity.test.ts`, `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`, both plugin manifests, and `plugins/web-debug/.mcp.json`.

The source-next capture contract uses project/session schema 2, evidence/capture schema 4, environment fingerprint schema 3, and scenario/verification schema 5. The plugin packages `web-debug-workflow` plus `manual-parity-qualification`; qualification JSON remains non-executable and repository-native tests own durable execution.

## Plan of Work

First accept the other thread's freeze, audit the complete diff and every untracked file, reconcile its completed plan/registry and the manual-parity plan, then promote all non-historical release identities to `0.6.0`. Update the existing workflow skill for summary-by-default capture and produce final release notes covering both the runtime migration and qualification skill.

Next run the complete local and live release gates. Create one real archive in a command-owned temporary directory, install it into clean prefixes, and handshake that exact archive under Node 20/22/24 for version, 13 tools, and concrete schemas. Capture shasum/integrity and verify clean process/artifact state.

Finally explicitly stage every intended file, freeze one release commit, push main and an exact annotated tag, publish the same tested archive, create the GitHub release, verify a fresh public install, and update the Codex marketplace/plugin. Record a separate evidence-only follow-up commit without moving the tag.

## Concrete Steps

1. Reconcile/complete the capture source plan and create final release notes/identity changes with `apply_patch`; run focused release tests.
2. Run `npm test`, typecheck, build, native/formal harness, both skill validators, plugin validator, audit, diff checks, and all relevant live smokes/comparison.
3. Pack one exact archive, install/handshake it on Node 20/22/24, and record its entry count, shasum, integrity, and clean teardown.
4. Audit `git status`, explicitly stage all intended paths, commit `release: prepare 0.6.0`, push `main`, create/push annotated `v0.6.0`, and prove local/remote peeled equality.
5. Publish the exact archive with npm `latest`, converge `next`, create the GitHub release from checked-in notes, and repeat public fresh-cache verification.
6. Snapshot then upgrade the `web-debug` marketplace, install the new plugin, verify one enabled 0.6 build/two skills/runtime pin/no duplicate, and record final evidence.

## Validation and Acceptance

- `npm test`, `npm run typecheck`, `npm run build`, `npm run harness:check`, formal harness check, `git diff --check`, and production dependency audit exit zero.
- Both skill validators and the plugin validator exit zero; the installed immutable plugin cache contains both skills.
- Chromium, React/Vite, Vue/Vite, Angular, Next, local-fidelity, and comparison flows pass. Safari is reported from fresh final evidence only; a blocker cannot be relabeled as PASS.
- The exact final archive reports `serverInfo.version: 0.6.0`, exactly 13 tools, and 13 concrete data schemas under Node 20/22/24; help, doctor, cleanup, and EOF behavior remain bounded.
- Package, lockfile, tests, harness, README, release notes, npm, peeled Git tag, GitHub release, both marketplaces/manifests, bundled MCP, and installed Codex plugin identities agree.
- Every intended untracked file is in the release commit; no build cache, fixture mutation, credential, temporary archive, or command-owned browser/server process remains.
- No previous version/tag moves, no connector-authored GitHub comment/review is created, and no production/provider claim is inferred.

## Idempotence and Recovery

All validation and packaging steps are safe to rerun before publication. Stop before immutable writes when any required local gate fails. After npm publication, never unpublish or move `v0.6.0`; repair code forward as `0.6.1` and repair documentation/plugin state without changing the released tag.

Before Codex mutation, retain the exact installed `0.5.0+codex.20260830202439` version, marketplace source/root, enabled state, and MCP pin. If the new local install fails, restore that snapshot and repoint npm dist-tags only when a genuine public package defect requires rollback. Remove only exact command-owned temporary directories/processes.

## Artifacts and Notes

- Baseline Git: `932f931` on `main`, matching `origin/main`; released tag `v0.5.0` peels to `4c0cb075ee9e6a2e32cdf2d1cdc942bdb416d05b`.
- npm preflight: owner `marlonjd`; `latest=0.5.0`, `next=0.5.0`; `0.6.0` absent.
- GitHub preflight: keyring account `MarlonJD`; `v0.6.0` tag/release absent.
- Codex rollback baseline: one installed/enabled `web-debug@web-debug` at `0.5.0+codex.20260830202439`, bundled MCP `web-debug-mcp@0.5.0`.
- Frozen final archive candidate: `/tmp/web-debug-release-0.6.0.1i5DPT/web-debug-mcp-0.6.0.tgz`; 152 entries; npm shasum `3dc99d7ed5959359999f435136b5dc0aac4b26cb`; integrity `sha512-TfdFeIU2RUdqYkvm4ojQoHyUNVbc1cuK/RRL7DI1fvpeliAngj5gzRRZZG3F/X0Rng0bK03QMIqTM6sUMMQ+xQ==`; Node 20/22/24 each returned `0.6.0`, 13 tools, and 13 concrete schemas.
- Official plugin packaging guidance: <https://developers.openai.com/plugins/build/plugins>.

## Interfaces and Dependencies

Keep `@modelcontextprotocol/sdk`, `playwright-core`, and Zod versions unchanged. Add no release-only runtime dependency. Preserve loopback-first, fixed-origin, redaction, bounded-output, artifact, session, and process-ownership policies.

## Revision History

- (2026-08-31 00:27Z) Change: Created the stable 0.6.0 release-and-plugin-update plan after authentication, public-version, installed-plugin, source-next, and cross-thread preflight. Reason: Make the authorized immutable publication and rollback sequence restartable and auditable.
