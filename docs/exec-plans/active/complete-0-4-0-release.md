<!-- harness-plan:v1
id: complete-0-4-0-release
status: active
created: 2026-08-29
updated: 2026-08-29
completed:
owner: Platform Engineering
-->

# Complete the 0.4.0 release and harness migration

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). The user explicitly authorized committing, pushing, publishing `0.4.0`, updating the released plugin, repairing the historical formal-harness debt, and running an approved external-CDP check when a concrete endpoint is available.

## Purpose / Big Picture

Turn the verified `0.4.0-next.0` source checkpoint into one truthful `0.4.0` release. Before publication, remove the 24 known formal plan/index errors so the repository can distinguish a clean structural lifecycle from stale certification. Then align package, MCP, npm, Git tag, GitHub release, marketplace metadata, bundled skill, and installed Codex plugin on the same immutable release, without fabricating npm authentication or an external browser endpoint.

Success is observable when the formal harness reports zero errors, the final source and plugin identities are `0.4.0`, deterministic and live gates pass, a real tarball/fresh-prefix handshake reports 13 tools and output schemas, `main` and `v0.4.0` are pushed to the exact release commit, npm/GitHub report that immutable version, and Codex reports the updated plugin enabled. If npm login or an approved external CDP endpoint is unavailable, keep those exact steps active and report the literal blocker rather than weakening the release contract.

## Progress

- [x] (2026-08-29 20:24Z) Commit the verified source-next checkpoint as `6499aca` and capture GitHub/npm/plugin preflight state.
- [x] (2026-08-29 20:30Z) Migrate the five historical completed plans and registry row without changing recorded product outcomes; the formal harness now reports zero errors and zero warnings.
- [x] (2026-08-29 20:36Z) Promote package, public docs, plugin manifests, marketplace metadata, bundled runtime, and workflow skill from the prerelease/released `0.3.3` split to final `0.4.0`.
- [x] (2026-08-29 20:41Z) Run 106 deterministic tests, typecheck/build, native and zero-error formal harnesses, plugin validation, all five live smokes, the six-scenario comparison demo, and real final tarball/fresh-prefix checks; no approved external-CDP endpoint exists on this host.
- [ ] Commit and push the release source, create/push exact `v0.4.0`, publish npm and GitHub release artifacts, then refresh/install and verify the Codex plugin.
- [ ] Record exact evidence, unresolved authority blockers, cleanup, and semantic review before completing this plan.

## Surprises & Discoveries

- GitHub CLI keyring authentication succeeds for `MarlonJD` with repository scope; GitHub currently lists `v0.3.3` as latest and no local `v0.4.0` tag exists.
- `npm whoami` returns `E401 Unauthorized`. No npm publication may be claimed until an authenticated account and any required OTP/web approval succeed.
- The user completed npm web login; `npm whoami` now reports `marlonjd`, registry ping succeeds, and package ownership is confirmed.
- The installed Codex plugin is enabled at `0.3.3+codex.20260828123311` from the `web-debug` marketplace.
- The formal harness baseline is exactly 24 errors across five historical completed plans and one registry date mismatch; the newly completed trust-hardening plan adds no error.
- No configured environment variable, repository `.env` file, or running command-owned browser exposes an approved external CDP endpoint; remote live attachment remains unavailable rather than inferred from loopback evidence.

## Decision Log

- Decision: Repair historical plan documents semantically rather than suppressing or grandfathering validator errors. Rationale: the user requested the full follow-up, and zero formal errors is required before a fresh structural release claim. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Keep release publication forward-only at `0.4.0`; never move existing `0.3.x` tags or npm versions. Rationale: npm and Git tags are immutable release evidence. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Continue local release preparation while npm authentication is unavailable, but stop before any success claim that depends on npm. Rationale: missing credentials do not block local work, while authentication cannot be invented. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Run an external-CDP smoke only with a concrete explicitly approved endpoint. Rationale: `allowRemote` is authority, not discovery permission. Date/Owner: 2026-08-29 / Platform Engineering.

## Outcomes & Retrospective

Active. Replace this with achieved release identities, exact verification, remaining blockers, and rollback facts before completion.

## Context and Orientation

Commit `6499aca` on `main` contains the completed source-next contract and a clean working tree. `package.json` reports `0.4.0-next.0` while package metadata records released plugin runtime `0.3.3`; plugin manifests and `.mcp.json` are deliberately still `0.3.3`. The formal plan errors are in `docs/exec-plans/completed/adaptive-flake-verification.md`, `local-fidelity-and-session-lifecycle.md`, `npm-publication-0-3-1.md`, `web-debug-mcp-mvp.md`, `web-debug-routing-0-3-2.md`, plus one completed-date row in `docs/exec-plans/index.md`.

Release surfaces include `package.json`, `package-lock.json`, `src/core/version.ts`, `plugins/web-debug/.mcp.json`, both plugin manifests, both marketplace files, the bundled workflow skill, README/product/security/harness documentation, and release identity tests. Existing completed release plans record the prior npm/GitHub/Codex command and rollback patterns.

## Plan of Work

First normalize each historical plan to the exact thirteen-section schema while preserving dates, decisions, evidence, and remaining debt. Check every progress item, add a substantive revision history and digest-bound semantic review, synchronize the registry, and require the formal checker to reach zero errors.

Next promote source identity to final `0.4.0`, align plugin/runtime/docs and restore the new workflow guidance that was intentionally withheld from released `0.3.3`. Run the complete deterministic gates, package install/handshake, plugin validators, and live browser/framework smokes. Search only configured environment and repository evidence for an approved external CDP endpoint; do not probe arbitrary hosts.

Finally commit the release, push `main`, create and push `v0.4.0`, publish npm with authenticated authority, create the matching GitHub release, refresh the repository marketplace, install the updated plugin, and verify exact source/tag/npm/GitHub/plugin equality. Preserve before-state and stop with a literal blocker if npm authentication or any immutable publication step fails.

## Concrete Steps

Work in `/Users/marlonjd/Developer/monorepos/web-debug-mcp` on the existing `main` branch. Do not create or switch branches.

1. Run the formal harness after each historical plan migration and keep product history unchanged.
2. Update release identities and run `npm test`, `npm run typecheck`, `npm run build`, `npm run harness:check`, `git diff --check`, real `npm pack`/fresh-prefix stdio, and relevant live smokes.
3. Sanitize GitHub CLI authentication with `env -u GH_TOKEN -u GITHUB_TOKEN`; treat npm web/OTP login as a user-interaction gate.
4. Commit/push the verified release source, then create/push the exact tag. Publish npm/GitHub and update Codex only after source identity is frozen.
5. Inspect and clean only command-owned temporary files/processes; retain pre-existing MCP and user Chrome state.

Expected signals are formal harness zero errors, native `harness-check: PASS`, 13 tools with output schemas from the packed binary, all invoked live smokes reporting `passed: true`, npm/GitHub version `0.4.0`, and one enabled Codex plugin build whose bundled runtime is pinned to `web-debug-mcp@0.4.0`.

## Validation and Acceptance

- Historical plan migration preserves substantive outcome/evidence and yields zero formal plan/index errors.
- Package, lockfile, MCP handshake, process registry, cleanup report, plugin manifests, marketplaces, bundled `.mcp.json`, npm, Git tag, GitHub release, and installed plugin agree on `0.4.0` or its timestamped Codex build identity.
- Deterministic tests, source/test typecheck, build, native harness, diff checks, local archive install, and 13-tool stdio handshake pass.
- Chromium, React/Vite, Next, Safari, and local-fidelity live checks pass on command-owned local targets; external CDP is verified only if an explicitly approved endpoint is supplied.
- No existing tag/version is moved, no connector-authored GitHub comment is created, no production claim is made, and all temporary browser/fixture processes are gone.

## Idempotence and Recovery

Historical Markdown migration, tests, builds, packing, and local smokes are safe to rerun. The local prerelease checkpoint remains recoverable as commit `6499aca`. Before plugin mutation, preserve marketplace/plugin JSON state. If a release preflight fails, do not create the tag or publish. If npm publication succeeds but a later GitHub/plugin step fails, keep `0.4.0` immutable, repair forward, and report partial release state rather than attempting deletion or tag movement.

Do not run `npm login` or external-browser attachment silently when user interaction or target approval is missing. Never delete the shared registry directory, user browser profile, or unregistered processes during cleanup.

## Artifacts and Notes

- Source-next checkpoint: `6499aca` on local `main`.
- Preflight: GitHub keyring authenticated as `MarlonJD`; npm authentication blocked with `E401`; installed plugin `0.3.3+codex.20260828123311` enabled.
- Formal harness baseline: 24 errors, 0 warnings, 5 info items; no error belongs to `trust-and-contract-hardening.md`.
- Formal harness after migration: 0 errors, 0 warnings, 5 informational capability/manual-review items.
- Public baseline: npm/GitHub latest `0.3.3`; no `v0.4.0` tag.
- Final local archive: `web-debug-mcp-0.4.0.tgz`, shasum `c7daee55f175d113503d4e662ea8bc418da149ea`, integrity `sha512-lCff9jIQZpPVOiiJIOjHX/pLZ5Ch2Ir4k38u1H8ih/hYpCcT2HBdIcETsnC45x3vN1ET5t0a48CKscreaB3Pww==`, 100 entries, fresh-prefix version `0.4.0`, 13 tools, and output schemas on every tool.

## Interfaces and Dependencies

Keep the existing `@modelcontextprotocol/sdk`, `playwright-core`, and `zod` versions. Do not add release dependencies. Use repository-native scripts, npm CLI, sanitized GitHub CLI, Codex CLI, and the configured formal harness. The package version remains the source for MCP/process identity; package metadata names the released plugin runtime during prerelease and converges to `0.4.0` at final release.

## Revision History

- (2026-08-29 20:24Z) Change: Created the release-and-harness completion plan after committing the verified source-next checkpoint and running authentication/plugin preflight. Reason: Make the authorized external and historical follow-up restartable without inventing npm credentials or an external CDP target.
