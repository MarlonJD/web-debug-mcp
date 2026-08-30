<!-- harness-plan:v1
id: complete-0-5-0-release
status: completed
created: 2026-08-30
updated: 2026-08-31
completed: 2026-08-31
owner: Platform Engineering
-->

# Complete the 0.5.0 security and plugin release

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). The user explicitly authorized fixing the confirmed redaction and process-registry lifecycle defects, publishing final `0.5.0`, creating the matching GitHub release, and updating the Codex plugin and bundled MCP runtime.

## Purpose / Big Picture

Turn the public `0.5.0-next.0` package into one truthful final `0.5.0` release. Before publication, close the confirmed text-redaction bypasses and make process-registry session accounting an idempotent projection of live `SessionManager` state. Then align package, MCP, npm, Git tag, GitHub release, plugin manifests, marketplaces, bundled workflow, and installed Codex plugin on final `0.5.0`.

Success is observable when Basic/Digest authorization, cookie headers, quoted sensitive fields, and equivalent structured text no longer leak through public evidence or error paths; repeated and failed session lifecycle calls cannot drift the registry count; all deterministic and relevant live gates pass; a tested final tarball and public fresh-cache install report `serverInfo.version: 0.5.0` with 13 tools; npm `latest`, Git tag, GitHub release, marketplace metadata, bundled MCP pin, and installed Codex plugin agree on the final release.

## Progress

- [x] (2026-08-30 20:03Z) Confirm clean `main` at `07cf126`, public npm `next=0.5.0-next.0`, GitHub/Codex baseline, and current npm authentication blocker.
- [x] (2026-08-30 20:04Z) Reproduce the redaction and registry defects and complete independent read-only boundary, lifecycle, and release-surface investigations.
- [x] (2026-08-30 20:24Z) Implement focused redaction and registry fixes with malicious-input, legitimate-control, idempotency, concurrency, and fault-injection tests.
- [x] (2026-08-30 20:25Z) Complete the required independent bypass/regression review, resolve its four concrete redaction findings, and pass 124 deterministic tests plus typecheck/build/native harness.
- [x] (2026-08-30 20:30Z) Promote every current package, documentation, plugin, marketplace, workflow, and harness surface to final `0.5.0`; native and formal harnesses pass with historical certification kept stale.
- [x] (2026-08-30 20:52Z) Build and exercise the exact final archive, all relevant live smokes including Safari 26.6.2, comparison demo, Node 20/22/24 handshakes, plugin validators, audit, and clean-process checks.
- [x] (2026-08-30 21:00Z) Commit/push frozen source `4c0cb075`, create/push exact `v0.5.0`, publish the tested archive with npm `latest=0.5.0`, create the GitHub release, and complete public fresh-cache verification.
- [x] (2026-08-30 21:14Z) Move npm `next` from `0.5.0-next.0` to final `0.5.0` after completing the required web authorization; both public dist-tags now resolve to final.
- [x] (2026-08-30 21:00Z) Refresh/install the Codex plugin, verify one enabled `0.5.0+codex.20260830202439` build with bundled `web-debug-mcp@0.5.0`, and confirm no duplicate standalone runtime; a newly started session is required to load the updated catalog.

## Surprises & Discoveries

- `0.5.0-next.0` is already public on npm from exact `gitHead` `07cf126`, despite current README/compatibility language calling it source-only. Final `0.5.0` is absent; npm `latest`, GitHub releases, and the installed plugin remain `0.4.0`.
- `npm whoami` currently returns `E401`; local work can continue, but immutable npm publication requires interactive web authentication before the publish gate.
- The user completed a fresh npm web login; `npm whoami` now reports `marlonjd`, registry ping and package ownership succeed, and final `0.5.0` remains absent before publication.
- `redactText` removes only the first token from raw Basic/Digest authorization and whitespace-containing sensitive values. It is the shared enforcement boundary for browser, framework, replay, error, doctor, and Vite text paths.
- Registry session hooks are non-idempotent deltas after manager mutation. Besides false `INTERNAL_ERROR` results, a repeated close can decrement twice and make an active second session look idle.
- The first regex extension passed the original examples but an independent reviewer found marker-prefix, escaped/nested JSON, cross-line whitespace, and alias-parity bypasses. Replacing that extension with a deterministic assignment scanner closed the complete reviewed family while preserving JSON structure and ordinary lines.
- Final archive distribution handshakes pass under Node 20.20.2, 22.23.2, and 24.18.0 with `serverInfo.version: 0.5.0`, 13 tools, and output schemas. Broader deterministic/live work remains on Node 24.
- Chromium, React/Vite, Vue/Vite, Angular, Next, local-fidelity, and all six comparison scenarios pass. Safari updated from 26.5.2 to 26.6.2 on this host; two runs correctly reported the disabled-automation blocker, then the rerun passed after the user re-enabled remote automation.
- Publishing the exact tarball sets npm shasum/integrity correctly but does not populate registry `gitHead`; release provenance therefore uses the tested archive digest plus the exact peeled Git/GitHub tag instead of inventing absent metadata.

## Decision Log

- Decision: Release forward as final `0.5.0`; do not move or rewrite `0.5.0-next.0` or any prior tag. Rationale: Angular/Vue behavior is already public as a prerelease, and the user authorized the final package/plugin promotion. Date/Owner: 2026-08-30 / Platform Engineering.
- Decision: Fix raw sensitive text at `redactText`, preserving ordinary prose without key/value syntax and preserving non-sensitive fields after structural delimiters. Rationale: this is the narrowest common boundary for the confirmed output paths. Date/Owner: 2026-08-30 / Platform Engineering.
- Decision: Remove handler-level session-count deltas and reconcile an absolute manager-derived count inside request finalization. Rationale: request accounting already prevents idle shutdown during mutation; absolute reconciliation is idempotent across retries, concurrent close, artifact-policy refinement, and uncertain prior writes. Date/Owner: 2026-08-30 / Platform Engineering.
- Decision: Keep unrelated product enhancements out of this release. Rationale: the authorized outcome is a secure, truthful final release, not a broader architecture or tool-surface redesign. Date/Owner: 2026-08-30 / Platform Engineering.

## Outcomes & Retrospective

Release `0.5.0` is complete within the repository-owned local/npm/GitHub/Codex scope. The reviewed sensitive-text family no longer leaks through direct, Next-log, or MCP-error paths; ordinary prose, sibling fields, line boundaries, standalone base64, and structured output shapes remain intact. Process-registry state now derives its absolute session count during locked request finalization, so repeated/concurrent close and registry-finalization failures no longer create false public failures or premature idle state.

The exact release source and peeled annotated tag are `4c0cb075ee9e6a2e32cdf2d1cdc942bdb416d05b`. npm `latest` and `next` both resolve to `0.5.0`; the public archive shasum/integrity match the tested local artifact. GitHub release `v0.5.0` is public. Codex has one installed/enabled `0.5.0+codex.20260830202439` plugin whose bundled and configured MCP runtime is `web-debug-mcp@0.5.0`; no duplicate standalone registration exists. Per official plugin lifecycle behavior, already-open sessions retain their original catalog and a new session loads the update.

Verification passed with 124 deterministic tests, source/test typecheck, build, native harness 544, formal harness zero errors/warnings, plugin/skill validation, production dependency audit with zero vulnerabilities, exact local/public fresh-prefix installs, Node 20/22/24 distribution handshakes, Chromium, React/Vite, Vue/Vite, Angular, Next, Safari 26.6.2, local-fidelity, and all six comparison scenarios. Claude runtime verification remains not run because the CLI is absent. Approved external CDP and provider production authority remain unavailable. The historical `0.4.0` HMAC window is still stale; no current `CERT000` is claimed and DEBT-003 remains open.

## Context and Orientation

`src/core/redaction.ts` is the shared defensive sanitizer. Its outputs feed browser/framework evidence, replay, errors, doctor output, and Vite metadata. `src/index.ts` is the MCP facade; `respond()` wraps each request with `ProcessRegistry.beginRequest/endRequest`. `src/core/process-registry.ts` owns persisted request/session counts and idle shutdown. `SessionManager.list()` exposes the active in-memory session projection.

Release identity originates in `package.json` and flows through `src/core/version.ts`. Final release surfaces include `package-lock.json`, `README.md`, architecture/security/compatibility/product/harness documentation, `docs/releases/0.5.0.md`, release/compatibility tests, `scripts/harness-check.mjs`, both plugin manifests and marketplaces, `plugins/web-debug/.mcp.json`, and the bundled workflow skill.

## Plan of Work

First add focused regressions and repair the two confirmed boundaries. Challenge the candidate with one independent read-only bypass/regression review and rerun malicious and legitimate controls before broad tests.

Next promote the verified source and plugin metadata to final `0.5.0`, remove stale source-only claims, add release notes, and make release-identity/harness checks enforce equality. Build one real archive in a command-owned directory and use that exact artifact for fresh-prefix handshake and npm publication.

Finally freeze source identity, push the release commit and annotated tag, publish npm/GitHub, update the marketplace and installed Codex plugin, verify a new-session MCP handshake, and record exact evidence. Stop before immutable publication if any required local gate or authentication check fails.

## Concrete Steps

Work in `/Users/marlonjd/Developer/monorepos/web-debug-mcp` on the existing `main` branch. Do not create or switch branches.

1. Patch redaction, registry reconciliation, and focused tests; run focused Vitest files and typecheck.
2. Run the independent candidate review, confirm any concrete finding, and rerun the original triggers plus legitimate controls.
3. Promote all current release surfaces to `0.5.0`; run deterministic tests, build, native/formal harnesses, diff checks, plugin/skill validation, package dry-run, and exact archive checks.
4. Run Chromium, React/Vite, Vue/Vite, Angular, Next, Safari, local-fidelity, and comparison flows with command-owned targets. Restore tracked fixtures in `finally` and confirm a clean tree/process list.
5. Reauthenticate npm with web approval if required. Commit/push final source, create/push exact annotated `v0.5.0`, publish the tested archive with `latest`, point `next` to final `0.5.0`, and create the GitHub release from checked-in notes.
6. Refresh the `web-debug` marketplace, reinstall/update the plugin, verify one enabled final build and bundled MCP pin, and verify the final public MCP from a new session or isolated client.

## Validation and Acceptance

- Raw Authorization/Proxy-Authorization and Cookie/Set-Cookie logical fields, quoted sensitive values, JSON-style quoted keys, sensitive query text, and equivalent error/evidence paths contain no original secret. Ordinary prose, standalone base64, `view=checkout`, `customerId=c-1`, and non-sensitive fields after structural delimiters remain intact.
- Manager and registry counts agree after successful/failed start, first/repeated/concurrent close, artifact deletion refinement, and unknown-session errors. Registry bookkeeping failure never turns a completed manager operation into a false public failure or permits premature idle cleanup.
- `npm test`, `npm run typecheck`, `npm run build`, `npm run harness:check`, formal harness, plugin/skill validators, `git diff --check`, final archive/fresh-prefix checks, and every invoked live smoke pass.
- Package, lock, serverInfo, cleanup/doctor identity, npm, peeled Git tag, GitHub release, plugin manifests, marketplaces, bundled `.mcp.json`, and installed Codex plugin agree on final `0.5.0` or its timestamped Codex build.
- No previous version/tag is moved, no connector-authored GitHub comment is created, no production/provider claim is made, and no command-owned browser/fixture process remains.

## Idempotence and Recovery

Tests, builds, validation, archive creation, and local smokes are safe to rerun. Before tag/npm publication, stop on any failure without creating immutable identities. After npm succeeds, never unpublish or move `v0.5.0`; repair subsequent failures forward. npm dist-tags and local plugin installation are reversible, but published versions and pushed tags are not.

Capture Codex marketplace/plugin state before mutation. If plugin refresh/install fails after public release, keep `0.5.0` immutable, restore the captured local plugin snapshot if necessary, and retry the marketplace/install step without changing the release tag. Clean only exact command-owned temporary directories and processes.

## Artifacts and Notes

- Baseline source: `07cf1260a355d0780bd0dfdb3f652faf30921fc2`.
- Public prerelease: `web-debug-mcp@0.5.0-next.0`, npm `next`, exact same `gitHead`, 13-tool public handshake.
- Released baseline/plugin: `0.4.0`; installed Codex build `0.4.0+codex.20260829203143`.
- Authentication: GitHub keyring succeeds as `MarlonJD`; npm web login succeeds as owner `marlonjd` after the initial `E401` preflight.
- Final local archive: `/tmp/web-debug-release-0.5.0.wA7WGE/web-debug-mcp-0.5.0.tgz`; 116 entries; shasum `e5bc37a37ad6f8efb35b79944ce6548e5aaa1068`; integrity `sha512-IveD2t6DR1xP2PkbTLDN8sG6ZeVLJWUwPBGfl+6jH2hIzPIyYmyVHuEcRd5qXpUjSPV7yeyCwZpJ9R/PozjSUg==`; fresh-prefix install added 96 packages and passed version/tool/schema/help/doctor/cleanup checks.
- Local release gates: 124 tests; typecheck/build; native harness 544; formal harness 0 errors/0 warnings; plugin and skill validators; production dependency audit 0 vulnerabilities; Chromium, React/Vite, Vue/Vite, Angular, Next, Safari 26.6.2, local-fidelity, and all six demo scenarios passed.
- Git/GitHub: release commit and peeled local/remote annotated tag are `4c0cb075ee9e6a2e32cdf2d1cdc942bdb416d05b`; GitHub release is `https://github.com/MarlonJD/web-debug-mcp/releases/tag/v0.5.0`.
- Public npm: `latest=0.5.0`; shasum/integrity match the tested archive; empty-directory/fresh-cache install added 96 packages and passed the 13-tool/output-schema plus Angular/Vue detection handshake. Registry `gitHead` is absent because publication used the exact prebuilt tarball.
- Codex: `web-debug@web-debug` is installed/enabled at `0.5.0+codex.20260830202439`; its immutable cache `.mcp.json` and `codex mcp list` both pin `web-debug-mcp@0.5.0`, with no second standalone registration.
- npm dist-tags: `latest=0.5.0` and `next=0.5.0` after the final web-authorized tag update.

## Interfaces and Dependencies

Keep the existing `@modelcontextprotocol/sdk`, `playwright-core`, and `zod` versions. Add no runtime dependency. Preserve the 13-tool MCP catalog and canonical structured envelope. Redaction remains defensive and bounded; registry reconciliation remains internal bookkeeping; the package version remains the single MCP/process/cleanup identity source.

## Revision History

- (2026-08-30 20:04Z) Change: Created the security-and-release completion plan after public-version, authentication, plugin, redaction, registry, and release-surface preflight. Reason: Make the authorized final `0.5.0` publication and plugin/MCP update restartable without weakening the security or release boundary.
- (2026-08-30 21:14Z) Change: Completed the reviewed security/lifecycle fixes, final package/plugin promotion, exhaustive local and distribution validation, exact Git/npm/GitHub publication, npm dist-tag convergence, Codex marketplace refresh/install, and public evidence closeout. Reason: Deliver the user-authorized `0.5.0` release while keeping unavailable Claude/external-CDP/provider authority and stale HMAC certification literal.
  Semantic-Review: reviewer=Platform Engineering; reviewed-at=2026-08-30 21:14Z; content-sha256=1a5a1928aa329214f4380bcb14f6c574a27fa132c00003a613829ecdf0dd2067; evidence=Reviewed every checked security, lifecycle, version, deterministic, live-browser, exact-archive, public npm, GitHub, dist-tag, Codex plugin/MCP, rollback, cleanup, and evidence milestone; immutable identities agree and all unavailable authority remains explicit.
