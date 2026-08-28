---
id: web-debug-routing-0.3.2
status: active
owner: Platform Engineering
created: 2026-08-28
---

# Clarify Web Debug routing and publish 0.3.2

## Purpose / Big Picture

Make the Web Debug plugin a focused browser-evidence complement to Build Web Apps and repository-native Vitest, Go, and Playwright runners. The bundled skill must route explicit `@Web Debug` requests and browser-grounded uncertainty to the Web Debug MCP, while leaving exact deterministic runner failures with their native tools. Publish the change as immutable `web-debug-mcp@0.3.2`, update the Codex/Claude plugin metadata and runtime pin, and install the new Codex plugin build from the repository marketplace.

## Scope and safety boundaries

- Keep the existing MCP API, browser safety policy, and single-facade architecture unchanged.
- Do not copy the Build Web Apps workflow or add a generic Vitest/Go test skill to this plugin.
- Do not create, switch, rename, or delete branches.
- Preserve `v0.3.0` and `v0.3.1`; create only the new exact `v0.3.2` tag/release.
- Do not run provider-backed qualification or production attestation for this local plugin release. If qualification tooling is explicitly needed, use only its exact accepted `namibia/dev` or `namibia/demo` target/confirmation boundary.
- Preserve pre-existing processes and user files; command-owned temporary artifacts must be removed by exact path.

## Progress

- [x] Add explicit routing and handoff rules to `web-debug-workflow`.
- [x] Update plugin prompts/descriptions, current documentation, harness assertions, and package/runtime version surfaces to `0.3.2`.
- [ ] Run deterministic tests, typecheck, build, harness, skill/plugin validation, and package/stdio checks.
- [ ] Commit and push the intended source revision on the existing `main` branch.
- [ ] Create and push exact-SHA tag `v0.3.2`, publish npm `web-debug-mcp@0.3.2`, and publish the matching GitHub release.
- [ ] Refresh the `web-debug` Codex marketplace and install/verify the new enabled plugin build without a duplicate standalone MCP registration.
- [ ] Record release and Codex evidence, close this plan, and leave a clean worktree.

## Decision Log

- Decision: Keep one cohesive Web Debug execution workflow and add a routing boundary before splitting into more skills. Rationale: project detection, session ownership, evidence capture, replay, and fix verification share one safety/provenance contract; duplicating Build Web Apps would increase skill collisions.
- Decision: Position Web Debug as complementary, not a replacement. Rationale: Build Web Apps owns frontend authoring and generic rendered QA; repository-native runners own deterministic tests; Web Debug owns browser-grounded runtime evidence and bounded verification.
- Decision: Release `0.3.2` as a patch version. Rationale: the change is skill/documentation/plugin metadata behavior and does not change the public MCP tool contract.

## Validation and Acceptance

Acceptance requires `npm test`, `npm run typecheck`, `npm run build`, `npm run harness:check`, the skill validator, warning-free `npm pack`, a fresh-prefix package/binary MCP handshake listing all tools, exact public npm metadata for `0.3.2`, source/main/tag/GitHub-release SHA equality, and Codex reporting `web-debug@web-debug` installed and enabled at the timestamped `0.3.2+codex.*` build. The skill must explicitly distinguish Web Debug, Build Web Apps, and native deterministic runners, and must state that an explicit Web Debug request cannot be silently substituted.

## Idempotence and Recovery

Preflight npm, GitHub, tag, marketplace, and installed-plugin state before external writes. Never unpublish npm or move an existing tag. If npm succeeds and a later GitHub or Codex step fails, retain the immutable package and complete or report the remaining step. Before Codex mutation, capture the exact marketplace/plugin state; if refresh/install/handshake fails, restore the captured prior plugin state and verify it.

## Outcomes & Retrospective

Pending implementation and release verification.

## Revision History

- (2026-08-28 12:13Z) Created the active plan from the requested Web Debug/Build Web Apps routing change and `0.3.2` release.
- (2026-08-28 12:17Z) Added explicit Web Debug/native-runner/Build Web Apps routing and updated all current plugin/runtime surfaces to `0.3.2`; deterministic gates, skill/plugin validators, and package dry-run passed.
