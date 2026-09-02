<!-- harness-plan:v1
id: release-0-8-0
status: active
created: 2026-09-02
updated: 2026-09-02
completed:
owner: Platform Engineering
-->

# Release Web Debug 0.8.0 and update Codex

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). The user explicitly authorized stable npm and GitHub publication, plugin marketplace promotion, and replacement of the installed Codex Web Debug plugin/MCP. Work on existing `main`; do not create or switch branches.

## Purpose / Big Picture

Promote locally verified source-next `0.8.0-next.0` to stable `0.8.0`, publish one exact tested npm archive, create an immutable annotated Git tag and GitHub release, update the Codex and Claude plugin manifests/marketplaces plus bundled MCP pin, then upgrade the installed Codex plugin to the released build. The public MCP catalog remains exactly 13 tools. The installed result must expose the fail-closed Gate 0 skill and launch public `web-debug-mcp@0.8.0` without duplicate MCP registration.

## Progress

- [x] (2026-09-02 12:18Z) Confirmed clean synchronized `main` at `2a79f4f`, absent local/remote `v0.8.0` tag and GitHub release, absent npm `0.8.0`, npm `latest=next=0.7.0`, and one installed/enabled Codex plugin `0.7.0+codex.20260831150253` with MCP pin `0.7.0`.
- [x] (2026-09-02 12:25Z) Restored npm owner authentication through the supported browser-authorized CLI flow; `npm whoami` returned `marlonjd` and package ownership matched.
- [x] (2026-09-02 12:27Z) Promoted package/plugin/marketplace/docs/tests/harness identities to stable `0.8.0`, set Codex build `0.8.0+codex.20260902122251`, and added release notes.
- [x] (2026-09-02 12:31Z) Passed 32 files/169 tests, source/test typecheck, build, audit zero, 620-check native harness, three skill validators, plugin validator, Chrome/WebMCP/local-fidelity/framework/Next/Safari smokes, and all six comparison scenarios. Exact-archive Node 20/22/24 verification follows the clean release commit.
- [ ] Commit/push the final release source, push annotated `v0.8.0`, publish the exact tested archive, converge npm tags, and create the GitHub release.
- [ ] Upgrade the configured remote marketplace and installed Codex plugin, verify one released plugin/MCP registration, real 13-tool Gate 0 handshake, and clean final repository state.

## Surprises & Discoveries

- npm owner credentials from the prior release are no longer valid; GitHub keyring authentication remains valid. No immutable publication action has started.
- Current Codex CLI is `0.146.0`. It can manage the installed plugin, but a new task/session is still required for the current official binding-recovery baseline after the installed plugin is upgraded.

## Decision Log

- 2026-09-02, user and Platform Engineering: Promote source-next to stable `0.8.0`, publish it, update the plugin, and install the update in Codex.
- 2026-09-02, Platform Engineering: Publish only one archive packed from the clean final release commit; never rebuild between archive verification and npm publication.
- 2026-09-02, Platform Engineering: Preserve the installed released `0.7.0` plugin until npm, tag, GitHub release, and remote marketplace `0.8.0` are all verified; then replace it atomically and verify the installed MCP before removing any obsolete cache.
- 2026-09-02, Platform Engineering: Do not upgrade the Codex CLI itself in this task. “Update in Codex” means replace and verify the Web Debug plugin/MCP on the current Codex host; host application upgrades remain a separate user-controlled action.

## Outcomes & Retrospective

Pending publication and installed-plugin verification.

## Context and Orientation

Release identity is distributed across `package.json`, `package-lock.json`, `src/core/version.ts`, release-identity tests, README and compatibility docs, `plugins/web-debug/.mcp.json`, both plugin manifests, both marketplace files, harness assertions, and release notes under `docs/releases/`. The working tree is promoted to final `0.8.0`; immutable public package/plugin baseline remains `0.7.0` until publication. The completed [`mcp-binding-fail-closed-recovery.md`](../completed/mcp-binding-fail-closed-recovery.md) contains the implementation evidence being promoted.

## Plan of Work

Authenticate npm, promote every live identity to final `0.8.0`, and run the complete release gate. Commit and push that final source before packing. Create one owned temporary release directory, pack the clean commit once, record the archive entry count/shasum/integrity, and exercise its stdio initialization/tool schemas under Node 20, 22, and 24. Publish that exact tarball, set both `latest` and `next` to `0.8.0`, push an annotated tag that peels to the release commit, and create the GitHub release from checked-in notes.

After public npm/GitHub verification, upgrade the configured `web-debug` marketplace and install the released plugin. Verify the installed plugin build, three skills, `.mcp.json` pin, one enabled MCP registration, `web_project_detect` first in the exact 13-tool catalog, schema availability, and clean close. If replacement fails, retain/reinstall the known-good released `0.7.0` plugin; do not delete broad Codex configuration or caches.

## Concrete Steps

1. Restore npm authentication with the supported web login if required and verify package ownership.
2. Update final 0.8.0 package, plugin, marketplace, documentation, tests, harness, and release-note identities.
3. Run focused/full deterministic gates, typecheck/build, production audit, native harness, three skill validators, plugin validator, relevant browser/lifecycle smokes, and diff hygiene.
4. Commit/push final source; pack once into an owned temporary directory; verify the exact archive under Node 20/22/24 and record immutable metadata.
5. Publish the exact archive; converge npm tags; create/push annotated tag and GitHub release; verify public empty-cache installation.
6. Upgrade the Codex marketplace/plugin, verify one installed released plugin/MCP and the Gate 0 tool catalog, then complete this plan and repository evidence in a final documentation commit if external outcomes must be recorded after publication.

## Validation and Acceptance

- `npm test`, `npm run typecheck`, `npm run build`, `npm run harness:check`, `npm audit --omit=dev`, three skill validators, plugin validator, and `git diff --check` pass.
- Relevant lifecycle/stdio and available live browser/framework smokes pass, or an exact environment blocker is recorded without converting it into a pass.
- The exact clean-commit archive initializes as `0.8.0`, lists the canonical 13 tools with concrete output schemas, and closes cleanly under Node 20, 22, and 24.
- npm `latest` and `next`, package/lock/runtime, peeled tag, GitHub release, plugin manifests/marketplaces, bundled MCP pin, and installed Codex plugin agree on `0.8.0` or one timestamped `0.8.0+codex.*` build.
- The installed workflow skill contains Gate 0 and `MCP_CLIENT_BINDING_UNAVAILABLE`; the installed MCP catalog begins with `web_project_detect` and contains exactly 13 tools.
- Local and remote `main` agree, no historical tag/version moves, and no owned temporary archive, command-owned process, or unintended working-tree change remains.

## Idempotence and Recovery

All prepublication checks are rerunnable. Stop before npm/tag/release writes on any gate failure. After npm publication, never unpublish or overwrite `v0.8.0`; repair forward. Codex replacement removes only the exact installed `web-debug@web-debug` plugin after public replacement is available. Rollback reinstalls public `0.7.0` through the retained marketplace state if `0.8.0` installation or handshake fails. Temporary release directories are exact owned paths and are removed only after all required metadata is persisted.

## Artifacts and Notes

- Public baseline at preflight: npm/package/plugin `0.7.0`; npm `latest=next=0.7.0`; `v0.8.0` absent.
- Release implementation source: `2a79f4fe1febd30611a5d51ad09429be5a1cd6aa`.
- Official plugin documentation: <https://developers.openai.com/plugins> and <https://learn.chatgpt.com/docs/build-plugins>.

## Interfaces and Dependencies

Change no dependency version. Keep the exact 13 public tool names, concrete output schemas, stdio stdout purity, registry safety policy, and three bundled skills. Add no release-only runtime, hosted service, remote browser authority, or compatibility shim.

## Revision History

- (2026-09-02 12:18Z) Change: Created and registered the stable 0.8.0 release plan after npm/GitHub/Codex preflight. Reason: Make authorized immutable publication and installed-plugin replacement auditable and recoverable.
