<!-- harness-plan:v1
id: web-debug-routing-0-3-2
status: completed
created: 2026-08-28
updated: 2026-08-28
completed: 2026-08-28
owner: Platform Engineering
-->

# Clarify Web Debug routing and publish 0.3.2/0.3.3 correction

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md).

## Purpose / Big Picture

Make the Web Debug plugin a focused browser-evidence complement to Build Web Apps and repository-native Vitest, Go, and Playwright runners. The bundled skill routes explicit `@Web Debug` requests and browser-grounded uncertainty to the Web Debug MCP, while leaving exact deterministic runner failures with their native tools. The requested `0.3.2` release was published, then a fresh-prefix handshake exposed stale MCP server metadata; immutable correction `web-debug-mcp@0.3.3` was published and installed in Codex.

### Scope and safety boundaries

- Keep the existing MCP API, browser safety policy, and single-facade architecture unchanged.
- Do not copy the Build Web Apps workflow or add a generic Vitest/Go test skill to this plugin.
- Do not create, switch, rename, or delete branches.
- Preserve `v0.3.0`, `v0.3.1`, and `v0.3.2`; create only the exact `v0.3.3` correction tag/release.
- Do not run provider-backed qualification or production attestation for this local plugin release. If qualification tooling is explicitly needed, use only its exact accepted `namibia/dev` or `namibia/demo` target/confirmation boundary.
- Preserve pre-existing processes and user files; command-owned temporary artifacts were removed by exact path.

## Progress

- [x] (2026-08-28 12:17Z) Add explicit routing and handoff rules to `web-debug-workflow`.
- [x] (2026-08-28 12:17Z) Update plugin prompts/descriptions, current documentation, harness assertions, and package/runtime version surfaces to `0.3.2`.
- [x] (2026-08-28 12:17Z) Run deterministic tests, typecheck, build, harness, skill/plugin validation, and package dry-run checks.
- [x] (2026-08-28 12:21Z) Commit and push the routing implementation on the existing `main` branch.
- [x] (2026-08-28 12:21Z) Create and push exact-SHA tag `v0.3.2`, publish npm `0.3.2`, and publish the matching GitHub release.
- [x] (2026-08-28 12:33Z) Complete the initial fresh-prefix 13-tool handshake; it exposed stale `serverInfo.version: 0.3.1` in `0.3.2`.
- [x] (2026-08-28 12:35Z) Correct MCP release metadata and move current package/plugin/runtime surfaces to `0.3.3`.
- [x] (2026-08-28 12:41Z) Run correction gates, create and push exact-SHA tag `v0.3.3`, publish npm `0.3.3`, and publish the matching GitHub release.
- [x] (2026-08-28 12:41Z) Refresh the `web-debug` Codex marketplace and install/verify enabled plugin build `0.3.3+codex.20260828123311` without a duplicate standalone MCP configuration.
- [x] (2026-08-28 12:43Z) Record release and Codex evidence and leave a clean worktree.

## Surprises & Discoveries

- The initial `0.3.2` npm publication succeeded, but a real empty-prefix MCP handshake exposed `serverInfo.version: 0.3.1`; local source checks alone had not caught the hard-coded runtime identity.
- npm versions and Git tags are immutable, so the metadata defect required the forward-only `0.3.3` correction rather than editing or moving `0.3.2`.
- Codex marketplace refresh and plugin installation converged on one enabled plugin-owned runtime with no duplicate standalone MCP registration.

## Decision Log

- Decision: Keep one cohesive Web Debug execution workflow and add a routing boundary before splitting into more skills. Rationale: project detection, session ownership, evidence capture, replay, and fix verification share one safety/provenance contract; duplicating Build Web Apps would increase skill collisions.
- Decision: Position Web Debug as complementary, not a replacement. Rationale: Build Web Apps owns frontend authoring and generic rendered QA; repository-native runners own deterministic tests; Web Debug owns browser-grounded runtime evidence and bounded verification.
- Decision: Release `0.3.2` as a patch version, then release `0.3.3` as a forward-only metadata correction after fresh-prefix verification found the MCP server still advertising `0.3.1`. Rationale: npm versions and tags are immutable, so the original artifact remains intact and the corrected artifact uses a new patch version.

## Outcomes & Retrospective

The Web Debug skill explicitly routes `@Web Debug` and browser-evidence requests, keeps Build Web Apps as the frontend authoring/general QA complement, and leaves exact Vitest/Go/project Playwright failures with native runners. The first `0.3.2` release exposed a pre-existing hard-coded MCP server version; `0.3.3` corrects that metadata and adds a harness assertion to prevent recurrence. The plugin is published and installed in Codex with no duplicate standalone server configuration. This is verified locally; it is not a production-readiness or provider-attestation claim.

## Context and Orientation

The routing contract is owned by `plugins/web-debug/skills/web-debug-workflow/SKILL.md`, the plugin prompts/manifests and marketplaces, README installation/routing guidance, MCP server release metadata, and native harness checks. Release verification spans package metadata, fresh-prefix stdio initialization/tool listing, npm/GitHub identities, and Codex installed/enabled state.

## Plan of Work

Clarify ownership among Web Debug, Build Web Apps, and deterministic runners without adding a second skill or MCP catalog. Align all `0.3.2` package/plugin surfaces, verify a real install, then correct forward to `0.3.3` when the installed runtime exposes stale metadata. Preserve every prior immutable release.

## Concrete Steps

Edit the routing skill, plugin prompts, docs, package/runtime metadata, and harness assertions on `main`; run deterministic and packaging gates; commit/push; tag and publish; install from a fresh prefix; if runtime identity differs, prepare a new patch release rather than moving existing artifacts; finally refresh/install Codex and verify one plugin-owned runtime.

## Validation and Acceptance

The local gates passed: `npm test` (61 tests), `npm run typecheck`, `npm run build`, `npm run harness:check` (234 checks), the skill validator, the plugin validator, JSON/syntax checks, and `npm pack --dry-run --json`. Public npm metadata reports `web-debug-mcp@0.3.3` with `latest=0.3.3`; a fresh-prefix public package install completed an MCP stdio handshake with `serverInfo.version: 0.3.3` and all 13 tools. Release commit `c711123cd885d2429cd643eeb28fe49ee72662b2`, tag `v0.3.3`, and GitHub release target are equal; `main` later advanced only with this evidence-only documentation commit. Codex reports `web-debug@web-debug` installed and enabled at `0.3.3+codex.20260828123311`, with the bundled runtime pinned to `web-debug-mcp@0.3.3`; no standalone `web-debug-mcp` entry exists in the Codex config.

## Idempotence and Recovery

No existing npm version or tag was moved or unpublished. The stale public `0.3.2` artifact remains immutable; the forward-only `0.3.3` correction is the installed/recommended version. Codex marketplace/plugin state was snapshotted before mutation, refreshed from the pushed repository, and verified after installation. No provider-backed qualification, OIDC target, hosted deployment, or production authority was used.

## Artifacts and Notes

Release commit `c711123cd885d2429cd643eeb28fe49ee72662b2`, tag `v0.3.3`, GitHub release, npm `latest=0.3.3`, fresh-prefix `serverInfo.version: 0.3.3`, and installed Codex build `0.3.3+codex.20260828123311` were observed. The stale `0.3.2` artifact remains immutable historical evidence.

## Interfaces and Dependencies

The release retains the existing 13-tool MCP facade and dependencies. The workflow skill is a routing layer, not another server. The plugin uses immutable public npm over stdio, while native Vitest/Go/Playwright and Build Web Apps keep their existing ownership boundaries.

## Revision History

- (2026-08-28 12:13Z) Change: Created the plan from the requested Web Debug/Build Web Apps routing change and `0.3.2` release. Reason: Define routing ownership and a forward-only release path before mutation.
- (2026-08-28 12:17Z) Change: Added explicit Web Debug/native-runner/Build Web Apps routing and updated current plugin/runtime surfaces to `0.3.2`; deterministic gates, skill/plugin validators, and package dry-run passed. Reason: Make the workflow boundary and release identity mechanically discoverable.
- (2026-08-28 12:21Z) Change: Pushed implementation commit `d3dfb738`, exact tag `v0.3.2`, and GitHub release. Reason: Freeze the requested routing release on one source identity.
- (2026-08-28 12:33Z) Change: Published npm `0.3.2`; fresh-prefix handshake found stale MCP server version metadata. Reason: Record the installed-runtime defect literally instead of accepting source-only evidence.
- (2026-08-28 12:35Z) Change: Prepared and verified the `0.3.3` metadata correction. Reason: Repair forward without moving immutable `0.3.2` artifacts.
- (2026-08-28 12:41Z) Change: Committed/pushed `c711123`, tagged/pushed `v0.3.3`, published npm and GitHub release, refreshed Codex marketplace, and installed/enabled `0.3.3+codex.20260828123311`. Reason: Converge source, registry, release, and installed plugin on the corrected runtime identity.
  Semantic-Review: reviewer=Platform Engineering; reviewed-at=2026-08-29 20:30Z; content-sha256=fb103c2b3eeb39445267e2ccacf704b8f6e958a2c3eded6505135e90b0b1a253; evidence=Reviewed routing ownership, checked 0.3.2 and forward-only 0.3.3 milestones, installed-runtime defect evidence, immutable release recovery, exact source/npm/GitHub/Codex identities, and non-production scope.
