---
id: web-debug-routing-0.3.2
status: complete
owner: Platform Engineering
created: 2026-08-28
completed: 2026-08-28
---

# Clarify Web Debug routing and publish 0.3.2/0.3.3 correction

## Purpose / Big Picture

Make the Web Debug plugin a focused browser-evidence complement to Build Web Apps and repository-native Vitest, Go, and Playwright runners. The bundled skill routes explicit `@Web Debug` requests and browser-grounded uncertainty to the Web Debug MCP, while leaving exact deterministic runner failures with their native tools. The requested `0.3.2` release was published, then a fresh-prefix handshake exposed stale MCP server metadata; immutable correction `web-debug-mcp@0.3.3` was published and installed in Codex.

## Scope and safety boundaries

- Keep the existing MCP API, browser safety policy, and single-facade architecture unchanged.
- Do not copy the Build Web Apps workflow or add a generic Vitest/Go test skill to this plugin.
- Do not create, switch, rename, or delete branches.
- Preserve `v0.3.0`, `v0.3.1`, and `v0.3.2`; create only the exact `v0.3.3` correction tag/release.
- Do not run provider-backed qualification or production attestation for this local plugin release. If qualification tooling is explicitly needed, use only its exact accepted `namibia/dev` or `namibia/demo` target/confirmation boundary.
- Preserve pre-existing processes and user files; command-owned temporary artifacts were removed by exact path.

## Progress

- [x] Add explicit routing and handoff rules to `web-debug-workflow`.
- [x] Update plugin prompts/descriptions, current documentation, harness assertions, and package/runtime version surfaces to `0.3.2`.
- [x] Run deterministic tests, typecheck, build, harness, skill/plugin validation, and package dry-run checks.
- [x] Commit and push the routing implementation on the existing `main` branch.
- [x] Create and push exact-SHA tag `v0.3.2`, publish npm `0.3.2`, and publish the matching GitHub release.
- [x] Complete the initial fresh-prefix 13-tool handshake; it exposed stale `serverInfo.version: 0.3.1` in `0.3.2`.
- [x] Correct MCP release metadata and move current package/plugin/runtime surfaces to `0.3.3`.
- [x] Run correction gates, create and push exact-SHA tag `v0.3.3`, publish npm `0.3.3`, and publish the matching GitHub release.
- [x] Refresh the `web-debug` Codex marketplace and install/verify enabled plugin build `0.3.3+codex.20260828123311` without a duplicate standalone MCP configuration.
- [x] Record release and Codex evidence and leave a clean worktree.

## Decision Log

- Decision: Keep one cohesive Web Debug execution workflow and add a routing boundary before splitting into more skills. Rationale: project detection, session ownership, evidence capture, replay, and fix verification share one safety/provenance contract; duplicating Build Web Apps would increase skill collisions.
- Decision: Position Web Debug as complementary, not a replacement. Rationale: Build Web Apps owns frontend authoring and generic rendered QA; repository-native runners own deterministic tests; Web Debug owns browser-grounded runtime evidence and bounded verification.
- Decision: Release `0.3.2` as a patch version, then release `0.3.3` as a forward-only metadata correction after fresh-prefix verification found the MCP server still advertising `0.3.1`. Rationale: npm versions and tags are immutable, so the original artifact remains intact and the corrected artifact uses a new patch version.

## Validation and Acceptance

The local gates passed: `npm test` (61 tests), `npm run typecheck`, `npm run build`, `npm run harness:check` (234 checks), the skill validator, the plugin validator, JSON/syntax checks, and `npm pack --dry-run --json`. Public npm metadata reports `web-debug-mcp@0.3.3` with `latest=0.3.3`; a fresh-prefix public package install completed an MCP stdio handshake with `serverInfo.version: 0.3.3` and all 13 tools. Release commit `c711123cd885d2429cd643eeb28fe49ee72662b2`, tag `v0.3.3`, and GitHub release target are equal; `main` later advanced only with this evidence-only documentation commit. Codex reports `web-debug@web-debug` installed and enabled at `0.3.3+codex.20260828123311`, with the bundled runtime pinned to `web-debug-mcp@0.3.3`; no standalone `web-debug-mcp` entry exists in the Codex config.

## Idempotence and Recovery

No existing npm version or tag was moved or unpublished. The stale public `0.3.2` artifact remains immutable; the forward-only `0.3.3` correction is the installed/recommended version. Codex marketplace/plugin state was snapshotted before mutation, refreshed from the pushed repository, and verified after installation. No provider-backed qualification, OIDC target, hosted deployment, or production authority was used.

## Outcomes & Retrospective

The Web Debug skill now explicitly routes `@Web Debug` and browser-evidence requests, keeps Build Web Apps as the frontend authoring/general QA complement, and leaves exact Vitest/Go/project Playwright failures with native runners. The first `0.3.2` release exposed a pre-existing hard-coded MCP server version; `0.3.3` corrects that metadata and adds a harness assertion to prevent recurrence. The plugin is published and installed in Codex with no duplicate standalone server configuration. This is verified locally; it is not a production-readiness or provider-attestation claim.

## Revision History

- (2026-08-28 12:13Z) Created the plan from the requested Web Debug/Build Web Apps routing change and `0.3.2` release.
- (2026-08-28 12:17Z) Added explicit Web Debug/native-runner/Build Web Apps routing and updated current plugin/runtime surfaces to `0.3.2`; deterministic gates, skill/plugin validators, and package dry-run passed.
- (2026-08-28 12:21Z) Pushed implementation commit `d3dfb738`, exact tag `v0.3.2`, and GitHub release.
- (2026-08-28 12:33Z) Published npm `0.3.2`; fresh-prefix handshake found stale MCP server version metadata.
- (2026-08-28 12:35Z) Prepared and verified the `0.3.3` metadata correction.
- (2026-08-28 12:41Z) Committed/pushed `c711123`, tagged/pushed `v0.3.3`, published npm and GitHub release, refreshed Codex marketplace, and installed/enabled `0.3.3+codex.20260828123311`.
