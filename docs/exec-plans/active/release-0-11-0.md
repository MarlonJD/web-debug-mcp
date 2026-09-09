<!-- harness-plan:v1
id: release-0-11-0
status: active
created: 2026-09-09
updated: 2026-09-09
completed:
owner: Platform Engineering
-->

# Release Web Debug 0.11.0 and update Codex

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). The user explicitly authorized the new npm release and Codex plugin update. Work on existing `main`; do not create or switch branches.

## Purpose / Big Picture

Publish the agent-readable interactive UI capture feature as stable `0.11.0`, update the matching plugin/runtime metadata, and install the resulting Web Debug plugin in Codex. The package, npm metadata, release tag, plugin manifests, marketplaces, and bundled MCP pin must identify one immutable runtime; the public MCP catalog remains exactly 13 tools.

## Progress

- [x] (2026-09-09 10:15Z) Confirmed a clean `main` at the post-`0.10.0` interactive UI capture commit and verified npm `latest`/`next` remain `0.10.0`.
- [x] (2026-09-09 10:16Z) Selected `0.11.0` as the semver-minor release for the new bounded `interactiveElements` feature and recorded the release plan.
- [x] (2026-09-09 11:05Z) Promoted current source and plugin identities to `0.11.0`, ran deterministic, security, harness, skill/plugin, Chromium/framework, Safari, and local-fidelity release gates, and created the release note.
- [ ] Commit/push the release source, pack one exact archive, publish npm, create the immutable tag/release, and verify the public package.
- [ ] Refresh the configured Codex marketplace, install/enable the new plugin build, and verify the bundled MCP pin, three skills, and single active registration.

## Surprises & Discoveries

- npm web login completed for `marlonjd`; the exact archive can now be published after the final release commit.
- Codex CLI `0.153.4` is installed. The configured `web-debug` marketplace is a Git snapshot of this repository and currently has `web-debug@web-debug` `0.10.0+codex.20260908065431` enabled.

## Decision Log

- 2026-09-09, user and Platform Engineering: Publish the new version to npm and update the Codex plugin.
- 2026-09-09, Platform Engineering: Use `0.11.0` rather than a patch release because `interactiveElements` is a new user-visible capture capability.
- 2026-09-09, Platform Engineering: Pack once after the final release commit is pushed, publish that exact archive, and never overwrite an immutable npm version or Git tag.
- 2026-09-09, Platform Engineering: Keep Figma design parity deferred under DEBT-008; it is not part of this release or the plugin runtime.

## Outcomes & Retrospective

Complete after npm publication and Codex installation. Record the exact source/tag/package/plugin identities, archive integrity, public 13-tool handshake, Codex installed build, and any unavailable Node/browser/host evidence literally. Do not claim Figma, production, provider authority, or current-task MCP rebinding unless separately verified.

## Context and Orientation

Release identity is distributed across `package.json`, `package-lock.json`, `src/core/version.ts`, current compatibility/reliability/harness documents, `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`, `plugins/web-debug/.codex-plugin/plugin.json`, `plugins/web-debug/.claude-plugin/plugin.json`, and both bundled MCP configuration files. `test/release-identity.test.ts` and `scripts/harness-check.mjs` enforce the current final version. Codex uses the Git marketplace named `web-debug`; its update path is `codex plugin marketplace upgrade web-debug --json` followed by `codex plugin add web-debug@web-debug --json`.

## Plan of Work

First promote all current, non-historical release surfaces to `0.11.0`, add `docs/releases/0.11.0.md`, and update compatibility/evidence text to describe the new interactive capture feature without rewriting historical `0.10.0` records. Run deterministic tests, type checks, build, audit, harness, skill/plugin validators, and applicable smokes before any irreversible publication.

Next commit and push the release source, create one task-owned `npm pack --json` archive, and verify its version, contents, 13-tool/13-schema stdio handshake, and available Node runtime coverage. Publish only that archive, converge npm `latest` and `next`, create/push `v0.11.0`, and create the matching GitHub release if the release identity gate remains green.

Finally refresh the configured Codex marketplace and install the released `web-debug@web-debug` plugin. Compare before/after plugin JSON state, verify the timestamped Codex build contains the three skills and pins `web-debug-mcp@0.11.0`, confirm no duplicate standalone registration is enabled, and note that an already-running task may require MCP restart or a new task to bind the new catalog.

## Concrete Steps

1. Work from `/Users/marlonjd/Developer/monorepos/web-debug-mcp` on `main`; preserve historical release plans and the deferred DEBT-008 Figma row.
2. Update versioned package/plugin/current-doc surfaces to `0.11.0` and create the release note; do not alter published historical evidence except by adding a new current record.
3. Run `npm test`, `npm run typecheck`, `npm run build`, `npm run harness:check`, `npm audit --omit=dev`, the three skill validators, the plugin validator, relevant Chromium/framework/Safari smokes, and `git diff --check`. Stop before publication on any failure.
4. Commit/push the verified source. Pack exactly once into an owned temporary directory with `npm pack --json --pack-destination <owned-temp-dir>`, record shasum/integrity, and run a fresh-prefix stdio handshake under each installed Node runtime; record missing runtimes as blocked.
5. Publish the exact archive with `npm publish <archive>`, set `latest` and `next` to `0.11.0`, verify public metadata/fresh-cache handshake, create/push annotated `v0.11.0`, and create the GitHub release from `docs/releases/0.11.0.md`.
6. Capture Codex marketplace/plugin state before mutation, run `codex plugin marketplace upgrade web-debug --json`, then `codex plugin add web-debug@web-debug --json`; verify the installed version/build, skills, runtime pin, enabled state, and duplicate-registration boundary.

## Validation and Acceptance

- Package, lockfile, plugin manifests, marketplaces, bundled MCP, current docs, tests, and harness agree on `0.11.0` (Codex manifest may add a timestamped `+codex.YYYYMMDDHHMMSS` suffix).
- The exact archive reports `0.11.0`, contains the runnable binary and built distribution, and completes a clean 13-tool/13-schema stdio handshake under every installed Node runtime.
- npm `latest`/`next`, package metadata, public archive integrity, `v0.11.0`, and GitHub release agree on the same immutable source/package identity.
- Codex reports one enabled `web-debug@web-debug` build for `0.11.0`, three bundled skills, bundled/configured `web-debug-mcp@0.11.0`, and no duplicate standalone Web Debug MCP connection.
- All local gates and relevant live smokes pass, with unavailable environment coverage labeled `blocked` rather than inferred.

## Idempotence and Recovery

All local checks, pack inspection, marketplace refresh, and plugin listing are repeatable. If a pre-publication gate fails, repair it before commit/publication. After npm or GitHub publication, do not unpublish, overwrite, or retag; use a forward release. Keep `0.10.0` as the rollback package until the public `0.11.0` handshake and Codex installation are proven. If the plugin update fails, preserve the captured marketplace/plugin state and use the documented remove/add rollback only against the exact failed installation.

## Artifacts and Notes

- Prior public baseline: [`release-0-10-0` ExecPlan](release-0-10-0.md) and [`0.10.0` release note](../../releases/0.10.0.md).
- Release note: [`../../releases/0.11.0.md`](../../releases/0.11.0.md).
- Deferred Figma scope: [`tech-debt-tracker.md`](../tech-debt-tracker.md), DEBT-008.

## Interfaces and Dependencies

The npm package runs locally over stdio and requires Node.js 20+, npm, and network access for first `npx` resolution. The Codex plugin consumes the repository marketplace and bundled `.mcp.json`; plugin installation is a local Codex state change. No new public MCP tool, hosted endpoint, remote browser, or Figma connector is introduced by this release.

## Revision History

- (2026-09-09 10:16Z) Change: Created the `0.11.0` release plan after the user requested npm publication and Codex update. Reason: Make version promotion, immutable archive publication, and plugin installation restartable and auditable.
