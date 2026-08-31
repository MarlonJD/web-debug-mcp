<!-- harness-plan:v1
id: release-0-7-0
status: active
created: 2026-08-31
updated: 2026-08-31
completed:
owner: Platform Engineering
-->

# Release Web Debug 0.7.0 and update Codex

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). The user explicitly authorized stable npm/GitHub publication plus updating the installed Codex MCP/plugin. Work on existing `main`; do not create or switch branches.

## Purpose / Big Picture

Promote verified `0.7.0-next.0` to final `0.7.0`, publish one exact tested npm archive, create an exact annotated Git tag and GitHub release, update both plugin marketplaces/manifests and bundled runtime pin, replace the local source-next Codex plugin with the released remote plugin, and retain one verified rollback path. The MCP catalog stays exactly 13 tools and the released plugin contains all three skills.

## Progress

- [x] (2026-08-31 15:02Z) Confirmed clean `main`, GitHub keyring auth, absent `v0.7.0` tag/release, npm `latest=next=0.6.0`, installed/enabled local source-next rollback plugin, and no duplicate MCP registration.
- [x] (2026-08-31 15:06Z) Restored npm owner `marlonjd` through browser-authorized CLI login and verified package ownership.
- [x] (2026-08-31 15:10Z) Promoted every live package/plugin/marketplace/document/test/harness identity to final `0.7.0` and added release notes.
- [x] (2026-08-31 15:21Z) Passed deterministic, type/build, production audit, native/formal harness, skill/plugin, all final live-browser/comparison, and cleanup gates; exact-archive Node 20/22/24 gates follow the clean release commit.
- [ ] Commit/push final release source, create/push exact annotated `v0.7.0`, publish the tested archive, converge npm `latest`/`next`, and create the GitHub release.
- [ ] Upgrade the remote marketplace, install released `web-debug@web-debug`, verify one enabled plugin/one MCP registration/three skills/runtime `0.7.0`, remove the local source-next plugin/marketplace only after success, and record final evidence.

## Surprises & Discoveries

- Preflight `npm whoami` returned `E401`; a fresh browser-authorized session restored owner access before immutable publication.
- The installed source-next runtime is content-addressed and verified, providing rollback while final package/plugin publication is pending.
- Formal harness initially exposed strict formatting debt in the three newly completed plans; their ordered sections, UTC progress/revision entries, registry state/title, and semantic-review attestations were repaired before release freeze. The repeated formal check returned zero errors and warnings.

## Decision Log

- 2026-08-31, user and Platform Engineering: Promote to public stable `0.7.0` and update Codex. Rationale: the source-next WebMCP, hybrid authoring, Safari decision, and skill behavior are complete and verified.
- 2026-08-31, Platform Engineering: Publish only the exact archive built from the clean final release commit; never rebuild between validation and npm publication.
- 2026-08-31, Platform Engineering: Preserve installed local source-next until public package, GitHub release, and remote plugin availability all pass; then replace it atomically with the released plugin.

## Outcomes & Retrospective

Not implemented.

## Context and Orientation

Current source and installed local plugin are `0.7.0-next.0`; immutable public npm/GitHub/remote marketplace remain `0.6.0`. Release surfaces include package/lock, live docs, release identity tests, harness contracts, both plugin manifests and marketplaces, bundled `.mcp.json`, release notes, compatibility evidence, and installed Codex plugin state. Historical completed ExecPlans are not rewritten.

## Plan of Work

Authenticate npm, promote live identities to `0.7.0`, run all gates, then create one clean release commit. Pack that exact commit once, install and handshake under Node 20/22/24, record shasum/integrity/entry count, and publish that exact `.tgz`. Push an annotated tag that peels to the release commit, create the GitHub release from checked-in notes, verify public empty-cache install, and converge npm tags.

Refresh the configured remote `web-debug` marketplace and confirm it advertises final `0.7.0`. Remove the local source-next plugin only immediately before installing the released plugin; on failure reinstall source-next from the retained local marketplace/runtime. After success verify one enabled Web Debug plugin, three skills, `.mcp.json` pin `web-debug-mcp@0.7.0`, exact 13-tool/13-schema handshake, and no duplicate standalone MCP. Remove only the exact obsolete local source-next plugin/marketplace/runtime after the released install is proven.

## Concrete Steps

1. Promote final package/plugin/marketplace/docs/tests/harness identities and run focused gates.
2. Run full deterministic, type/build, audit, native/formal harness, skill/plugin, and live-browser gates.
3. Commit/push the final source, pack the clean commit once, and verify the exact archive under Node 20/22/24.
4. Create/push annotated `v0.7.0`, publish the tested tarball, converge npm tags, and create the GitHub release.
5. Refresh/install the remote Codex plugin, verify one released plugin/MCP registration/three skills, then remove only the obsolete source-next local installation state.

## Validation and Acceptance

- `npm test`, `npm run typecheck`, `npm run build`, `npm run harness:check`, `git diff --check`, production audit, three skill validators, and plugin validator pass.
- Chrome WebMCP, Chromium, React/Vite, Vue/Vite, Angular, Next, local-fidelity, Safari WebDriver, and one-run comparison smokes pass or retain a literal scoped blocker; no Safari MCP cutover is claimed.
- The exact final archive returns `serverInfo.version: 0.7.0`, exact canonical 13 names, and 13 concrete schemas under Node 20/22/24.
- Package, lock, runtime, npm, peeled tag, GitHub release, plugin manifests/marketplaces, bundled MCP, and installed plugin agree on final `0.7.0` or one timestamped Codex build.
- Local and remote `main` agree; no previous tag/version moves; no build cache, credential, temp archive, or command-owned process remains.

## Idempotence and Recovery

All prepublication checks are rerunnable. Stop before npm/tag/release writes on any gate failure. After npm publication, never unpublish or move `v0.7.0`; repair forward. Rollback for Codex removes only the failed released plugin and reinstalls retained `web-debug@web-debug-source-next` from its exact local marketplace/runtime. Never delete broad Codex config/cache paths.

## Artifacts and Notes

- Public baseline: npm/GitHub/plugin `0.6.0`; npm `latest=next=0.6.0`; `v0.7.0` absent at preflight.
- Rollback plugin: enabled local `web-debug@web-debug-source-next` `0.7.0-next.0+codex.20260831144834` with content-addressed runtime shasum `b58bf248e9846fa201947b17dfcf1e6de47b9ed3`.
- npm owner session was restored through browser-authorized `npm login --auth-type=web`.

## Interfaces and Dependencies

Change no dependency version. Keep the exact 13 public tool names and final wire schemas. Add no release-only runtime. Official OpenAI documentation describes Codex plugins as bundles of skills and MCP servers; this release updates both through one plugin identity.

## Revision History

- (2026-08-31 15:03Z) Change: Created the release plan after public/npm/GitHub/Codex preflight. Reason: Make the authorized immutable publication and plugin replacement auditable and recoverable.
