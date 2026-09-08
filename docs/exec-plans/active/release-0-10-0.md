<!-- harness-plan:v1
id: release-0-10-0
status: active
created: 2026-09-08
updated: 2026-09-08
completed:
owner: Platform Engineering
-->

# Release Web Debug 0.10.0 and update Codex

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). The user explicitly authorized stable npm and GitHub publication, plugin marketplace promotion, and installation of the resulting Web Debug plugin/MCP in Codex. Work on existing `main`; do not create or switch branches.

## Purpose / Big Picture

Publish the two feature commits after `v0.8.0` as stable `0.10.0`. npm, GitHub, the Codex and Claude plugin manifests, both marketplaces, and the installed Codex plugin must name the same immutable runtime. The public MCP catalog remains 13 tools.

## Progress

- [x] (2026-09-08) Confirmed `main` is clean, `v0.8.0` is the published npm `latest`/`next` baseline, and the locally installed Codex plugin is `0.8.0+codex.20260902122251`.
- [x] (2026-09-08) Promoted package, lockfile, marketplace, manifests, bundled MCP runtime, documentation, harness, and release identity tests to `0.10.0`; Codex manifest build is `0.10.0+codex.20260908065431`.
- [x] (2026-09-08) Passed 34 files/198 tests, typecheck, build, audit, 623-check harness, three skill validators, plugin validator, Chromium/WebMCP/React/Vite/Vue/Vite/Angular/Next/local-fidelity smokes, and one-run comparison demo. Safari smoke is blocked with the literal aborted-operation result.
- [x] (2026-09-08) Packed one exact `0.10.0` archive (`156` entries; shasum `51bc949b7bb972771840c791ae239b2551970a1b`; integrity `sha512-+0yAfnQmPbJ5vO8DxBWV6FlNM0XTAgkYWnihuHIIKgFMD96K1wgFKO3kEx+0bbMseoYzYOn72a3EiBcxZPc/hg==`) and passed the 13-tool/13-schema stdio handshake under the available Node `24.18.0`; Node 20/22 are unavailable on this host and remain explicitly blocked.
- [x] (2026-09-08) Committed and pushed the release source at `3fcf9c07cab29591a94a566724b52f9fdf8fd538`, published the exact archive to npm, converged `latest`/`next` on `0.10.0`, pushed annotated tag `v0.10.0`, and created the GitHub release.
- [x] (2026-09-08) Refreshed the `web-debug` marketplace, installed/enabled `web-debug@web-debug` `0.10.0+codex.20260908065431`, verified all three bundled skills, and pinned the enabled direct `web_debug_mcp` registration to npm `web-debug-mcp@0.10.0` while leaving the bundled duplicate disabled.

## Surprises & Discoveries

- `v0.8.0..HEAD` contains `feat!: streamline evidence capture and agent skill workflows`; the user selected the next stable package identity, `0.10.0`.
- The prior `0.8.0` release is already public and installed, so it remains the recoverable plugin/runtime baseline until the new immutable package is verified.
- The local Safari smoke returned `This operation was aborted`; this release records it as blocked rather than treating prior Safari evidence as a pass.

## Decision Log

- 2026-09-08, user and Platform Engineering: Publish the current `main` and install it in Codex.
- 2026-09-08, user and Platform Engineering: Release `0.10.0`. Rationale: the user explicitly selected this next stable package identity.
- 2026-09-08, Platform Engineering: Pack once only after the final source commit is pushed; publish that exact archive and never overwrite an immutable version.

## Outcomes & Retrospective

Published `web-debug-mcp@0.10.0` is immutable and serves both npm `latest` and `next`. The exact archive was verified locally under Node `24.18.0` and from a fresh public npm cache with 13 tools and 13 output schemas (`web_project_detect` first, `web_session_close` last). The release source and annotated tag point to commit `3fcf9c07cab29591a94a566724b52f9fdf8fd538`; the GitHub release is [`v0.10.0`](https://github.com/MarlonJD/web-debug-mcp/releases/tag/v0.10.0). Codex now has `web-debug@web-debug` `0.10.0+codex.20260908065431` enabled with `manual-parity-qualification`, `web-debug-workflow`, and `webmcp-tool-authoring`; its enabled direct MCP entry resolves `web-debug-mcp@0.10.0`. Node 20/22 exact handshakes remain blocked only because those runtimes are not installed on this host, and a newly opened Codex task may be needed for the current process to bind the updated MCP entry.

## Context and Orientation

Release identity lives in `package.json`/`package-lock.json`, plugin manifests and marketplace files, `plugins/web-debug/.mcp.json`, `README.md`, the release identity test, and `scripts/harness-check.mjs`. Historical `0.8.0` plans and evidence remain immutable records. The new release must update only current contracts and add a separate `docs/releases/0.10.0.md` note.

## Plan of Work

Promote versioned source and plugin metadata together, then run deterministic tests, type checking, build, production audit, harness, skill/plugin validation, and the relevant bounded smoke suite. Commit and push the clean release source. Pack once into a task-owned temporary directory, verify the packed runtime and 13-tool schema with each installed Node runtime, then publish that exact artifact and converge npm `latest` and `next`. Create/push an annotated tag and GitHub release. Finally update the configured marketplace and install the corresponding Codex plugin; verify one active Web Debug registration without deleting broad configuration or caches.

## Concrete Steps

1. Update release identities, release note, current documentation, tests, and harness assertions to `0.10.0`; use a timestamped Codex manifest build generated at release time.
2. Run `npm test`, `npm run typecheck`, `npm run build`, `npm run harness:check`, `npm audit --omit=dev`, the three skill validators, plugin validator, applicable smoke commands, and `git diff --check`. Stop before external writes on a failure.
3. Commit and push the verified source. Pack exactly once with `npm pack --json --pack-destination <owned-temp-dir>`, record its shasum/integrity, and perform empty-prefix stdio schema handshakes under each installed Node runtime; record unavailable Node 20/22 runtimes as blocked.
4. Publish that tarball, assign `latest` and `next` to `0.10.0`, create/push annotated `v0.10.0`, and create the GitHub release from the checked-in notes.
5. Update the `web-debug` marketplace, reinstall/enable only `web-debug@web-debug`, and confirm its runtime pin, three skills, a single active MCP registration, and the 13-tool catalog.

## Validation and Acceptance

- All local release gates pass and any unavailable live environment is recorded literally as blocked.
- The exact archive reports `0.10.0`, starts over stdio, exposes 13 concrete output schemas with `web_project_detect` first, and exits cleanly under the available Node `24.18.0`; Node 20/22 are unavailable and recorded as blocked rather than inferred.
- npm `latest`/`next`, package metadata, tag, GitHub release, marketplace entries, plugin manifests, and the installed Codex plugin all agree on `0.10.0` (or its timestamped Codex build).
- No duplicate `web-debug-mcp`/`web_debug_mcp` connection remains enabled after installation, and no unrelated local configuration is removed.

## Idempotence and Recovery

All pre-publication gates are safely repeatable. If a gate fails, repair before any publication. After npm publication, do not unpublish or retag; use a forward release for repairs. Keep `0.8.0` available until the updated plugin is installed and its package pin is verified. Remove only task-owned temporary archives after their recorded verification is complete.

## Artifacts and Notes

- Prior public baseline: [`release-0-8-0.md`](release-0-8-0.md).
- Release note to add: `docs/releases/0.10.0.md`.

## Interfaces and Dependencies

The npm package runs locally over stdio and needs Node.js 20+, npm, and network access for first `npx` resolution. The plugin consumes only its bundled `.mcp.json`; direct Codex MCP configuration may separately use `required = true` but that field must not be placed in the plugin manifest.

## Revision History

- (2026-09-08) Change: Created the release plan for the post-`v0.8.0` source and revised the target to user-selected `0.10.0`. Reason: Make immutable publication and Codex installation restartable and auditable.
- (2026-09-08) Change: Recorded npm/GitHub/Codex publication evidence and the unavailable Node 20/22 follow-up boundary. Reason: Close the release path with verifiable immutable identities while keeping missing runtime coverage literal.
