# Release Web Debug 0.11.0 and update Codex

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). The user explicitly authorized the new npm release and Codex plugin update. Work on existing `main`; do not create or switch branches.

## Purpose / Big Picture

Publish the agent-readable interactive UI capture feature as stable `0.11.0`, update the matching plugin/runtime metadata, and install the resulting Web Debug plugin in Codex. The package, npm metadata, release tag, plugin manifests, marketplaces, and bundled MCP pin must identify one immutable runtime; the public MCP catalog remains exactly 13 tools.

## Progress

- [x] (2026-09-09 10:15Z) Confirmed a clean `main` at the post-`0.10.0` interactive UI capture commit and verified npm `latest`/`next` remain `0.10.0`.
- [x] (2026-09-09 10:16Z) Selected `0.11.0` as the semver-minor release for the new bounded `interactiveElements` feature and recorded the release plan.
- [x] (2026-09-09 11:05Z) Promoted current source and plugin identities to `0.11.0`, ran deterministic, security, skill/plugin, Chromium/framework, Safari, and local-fidelity release gates, and created the release note.
- [x] (2026-09-09 11:26Z) Committed/pushed source `601ff637`, packed one exact 160-file archive with shasum `5f46746a6431cfde632eab055ae104de6b924f77`, published npm `0.11.0` as `latest`, created/pushed annotated `v0.11.0`, created the GitHub release, and passed the public fresh-cache handshake.
- [x] (2026-09-09 11:26Z) Refreshed the configured Codex marketplace and installed/enabled `web-debug@web-debug` `0.11.0+codex.20260909101709`; verified the three skills, bundled `web-debug-mcp@0.11.0` pin, and single active plugin registration.

## Surprises & Discoveries

- npm web login completed for `marlonjd`; npm `latest` now resolves to public `0.11.0`. The separate legacy `next` preview tag remains `0.10.0` and is not required for stable installs.
- Codex CLI `0.153.4` is installed. The configured Git marketplace was refreshed and now has `web-debug@web-debug` `0.11.0+codex.20260909101709` enabled.

## Decision Log

- 2026-09-09, user and Platform Engineering: Publish the new version to npm and update the Codex plugin.
- 2026-09-09, Platform Engineering: Use `0.11.0` rather than a patch release because `interactiveElements` is a new user-visible capture capability.
- 2026-09-09, Platform Engineering: Pack once after the final release commit is pushed, publish that exact archive, and never overwrite an immutable npm version or Git tag.
- 2026-09-09, Platform Engineering: Keep Figma design parity deferred under DEBT-008; it is not part of this release or the plugin runtime.

## Outcomes & Retrospective

The stable `0.11.0` package, annotated tag, GitHub release, public registry install, and released Codex plugin are live. The exact archive is `/private/tmp/web-debug-release-0.11.0.MvyOMh/packed/web-debug-mcp-0.11.0.tgz`, with 160 files, shasum `5f46746a6431cfde632eab055ae104de6b924f77`, and integrity `sha512-wBJKfTMIa1E8pfU60X6LI3txab5p+o6d4uTYQXBWwwwlrpBBKHTH9sMldW6QuzujDqNkg06Rq7slIY962AUjYw==`. The exact archive and public fresh-cache package both completed the 13-tool/13-output-schema stdio handshake under Node 24.18.0; Node 20.20.2 and 22.23.2 remain blocked because they are not installed.

Codex has one enabled `web-debug@web-debug` plugin at `0.11.0+codex.20260909101709`, with all three bundled skills and `web-debug-mcp@0.11.0`. npm `latest` is `0.11.0`; the unrelated legacy `next` preview tag remains `0.10.0`. Figma design parity, production authority, provider authority, and current-task MCP rebinding are not claimed.

## Context and Orientation

Release identity is distributed across `package.json`, `package-lock.json`, `src/core/version.ts`, current compatibility/reliability documents, `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`, `plugins/web-debug/.codex-plugin/plugin.json`, `plugins/web-debug/.claude-plugin/plugin.json`, and both bundled MCP configuration files. `test/release-identity.test.ts` enforces the current final version. Codex uses the Git marketplace named `web-debug`; its update path is `codex plugin marketplace upgrade web-debug --json` followed by `codex plugin add web-debug@web-debug --json`.

## Plan of Work

First promote all current, non-historical release surfaces to `0.11.0`, add `docs/releases/0.11.0.md`, and update compatibility/evidence text to describe the new interactive capture feature without rewriting historical `0.10.0` records. Run deterministic tests, type checks, build, audit, skill/plugin validators, and applicable smokes before any irreversible publication.

Next commit and push the release source, create one task-owned `npm pack --json` archive, and verify its version, contents, 13-tool/13-schema stdio handshake, and available Node runtime coverage. Publish only that archive as npm `latest`, leave the unrelated legacy `next` preview tag unchanged, create/push `v0.11.0`, and create the matching GitHub release if the release identity gate remains green.

Finally refresh the configured Codex marketplace and install the released `web-debug@web-debug` plugin. Compare before/after plugin JSON state, verify the timestamped Codex build contains the three skills and pins `web-debug-mcp@0.11.0`, confirm no duplicate standalone registration is enabled, and note that an already-running task may require MCP restart or a new task to bind the new catalog.

## Concrete Steps

1. Work from `/Users/marlonjd/Developer/monorepos/web-debug-mcp` on `main`; preserve historical release plans and the deferred DEBT-008 Figma row.
2. Update versioned package/plugin/current-doc surfaces to `0.11.0` and create the release note; do not alter published historical evidence except by adding a new current record.
3. Run `npm test`, `npm run typecheck`, `npm run build`, `npm audit --omit=dev`, the three skill validators, the plugin validator, relevant Chromium/framework/Safari smokes, and `git diff --check`. Stop before publication on any failure.
4. Commit/push the verified source. Pack exactly once into an owned temporary directory with `npm pack --json --pack-destination <owned-temp-dir>`, record shasum/integrity, and run a fresh-prefix stdio handshake under each installed Node runtime; record missing runtimes as blocked.
5. Publish the exact archive with `npm publish <archive>` as `latest`, verify public metadata/fresh-cache handshake, create/push annotated `v0.11.0`, and create the GitHub release from `docs/releases/0.11.0.md`; the legacy `next` preview tag remains outside this stable release.
6. Capture Codex marketplace/plugin state before mutation, run `codex plugin marketplace upgrade web-debug --json`, then `codex plugin add web-debug@web-debug --json`; verify the installed version/build, skills, runtime pin, enabled state, and duplicate-registration boundary.

## Validation and Acceptance

- Package, lockfile, plugin manifests, marketplaces, bundled MCP, current docs, and tests agree on `0.11.0` (Codex manifest may add a timestamped `+codex.YYYYMMDDHHMMSS` suffix).
- The exact archive reports `0.11.0`, contains the runnable binary and built distribution, and completes a clean 13-tool/13-schema stdio handshake under every installed Node runtime.
- npm `latest` and package metadata resolve to `0.11.0`; the legacy `next` preview tag remains `0.10.0` and is not part of the stable release. Public archive integrity, `v0.11.0`, and the GitHub release agree on the same immutable source/package identity.
- Codex reports one enabled `web-debug@web-debug` build for `0.11.0`, three bundled skills, bundled/configured `web-debug-mcp@0.11.0`, and no duplicate standalone Web Debug MCP connection.
- All local gates and relevant live smokes pass, with unavailable environment coverage labeled `blocked` rather than inferred.

## Idempotence and Recovery

All local checks, pack inspection, marketplace refresh, and plugin listing are repeatable. If a pre-publication gate fails, repair it before commit/publication. After npm or GitHub publication, do not unpublish, overwrite, or retag; use a forward release. Keep `0.10.0` as the rollback package until the public `0.11.0` handshake and Codex installation are proven. If the plugin update fails, preserve the captured marketplace/plugin state and use the documented remove/add rollback only against the exact failed installation.

## Artifacts and Notes

- Prior public baseline: [`release-0-10-0` ExecPlan](release-0-10-0.md) and [`0.10.0` release note](../../releases/0.10.0.md).
- Release note: [`../../releases/0.11.0.md`](../../releases/0.11.0.md).
- Deferred Figma scope: [`tech-debt-tracker.md`](../tech-debt-tracker.md), DEBT-008.
- Release source/tag: `601ff637cd8bd1e2fd0af25d526c25386d285e8c`; GitHub release: <https://github.com/MarlonJD/web-debug-mcp/releases/tag/v0.11.0>.
- Exact archive: 160 entries; shasum `5f46746a6431cfde632eab055ae104de6b924f77`; integrity `sha512-wBJKfTMIa1E8pfU60X6LI3txab5p+o6d4uTYQXBWwwwlrpBBKHTH9sMldW6QuzujDqNkg06Rq7slIY962AUjYw==`.
- Installed Codex: one enabled `web-debug@web-debug` `0.11.0+codex.20260909101709`, three skills, bundled `web-debug-mcp@0.11.0`, and no duplicate registration.

## Interfaces and Dependencies

The npm package runs locally over stdio and requires Node.js 20+, npm, and network access for first `npx` resolution. The Codex plugin consumes the repository marketplace and bundled `.mcp.json`; plugin installation is a local Codex state change. No new public MCP tool, hosted endpoint, remote browser, or Figma connector is introduced by this release.

## Revision History

- (2026-09-09 10:16Z) Change: Created the `0.11.0` release plan after the user requested npm publication and Codex update. Reason: Make version promotion, immutable archive publication, and plugin installation restartable and auditable.
- (2026-09-09 11:26Z) Change: Completed npm/GitHub publication, public registry verification, and Codex marketplace/plugin update. Reason: Deliver stable `0.11.0` while keeping the separate legacy `next` preview channel unchanged and preserving literal unavailable-runtime/Figma boundaries.
