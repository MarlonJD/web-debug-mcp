# Release Web Debug 0.13.0

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md).

## Purpose / Big Picture

The user explicitly authorized committing and pushing all Web Debug changes and publishing a new release on 2026-10-15. Publish one immutable 0.13.0 npm archive and matching GitHub release containing the six locally completed improvements and benchmark infrastructure. Keep the existing main branch; do not change installed client settings or the installed plugin.

## Progress

- [x] Inspect the worktree, upstream main and npm baseline; preserve the complete tracked/untracked source snapshot. GitHub keyring authentication succeeds; npm whoami returns E401 and the first official web login expired while local checks ran; a fresh login is required for publication.
- [x] Aligned package/lock/plugin/marketplace identities and current documentation for 0.13.0; reviewed the source changes and checked for accidental credential material.
- [x] Passed 262 tests/40 files, typecheck/build, zero production audit findings, three skill validators, ten live browser/framework/workflow smokes and six comparison scenarios. All observed owned processes exited; no new test-browser/crashpad processes remain.
- [ ] Commit all authorized source on existing main; pack and verify one exact archive under Node 20/22/24 with 13 concrete tools and project detection.
- [ ] Push the source, publish the exact npm archive, publish the matching immutable Git tag/GitHub release, and verify public identities and fresh public installation.
- [ ] Verify owned-process cleanup, record final evidence, update the registry and close this plan.

## Surprises & Discoveries

- Public npm latest and upstream main remain 0.12.0/f96443f. The unrelated npm next channel is 0.10.0.
- npm credentials expired since the previous publication. Started the official npm CLI web login while preparing the release. Its session expired (done endpoint 404) before authorization, after which npm fell back to a username prompt and exited. Request a fresh official link at the final publication boundary; no secret is requested through chat.
- The prior model comparison measured a frozen candidate source. Later privacy/contract fixes passed separate local controls. Neither publication nor version promotion changes those model outcomes or claims that the experiments ran against the final release.

## Decision Log

- Use minor 0.13.0 for the schema-7 reproduction/verification summary contract and additive verification capabilities. Do not move older releases/tags or change the unrelated next channel.
- Keep exactly 13 public tools, full authoritative evaluation, resource-only reproduction/verification pixels, loopback/origin policy and truthful unavailable observations.
- Commit and push on existing main without branch creation/switching, force push or history rewriting. npm publication and GitHub release are explicitly authorized; unrelated installed plugin/client configuration changes are outside this task.
- Publish the exact tested archive from a committed source. Keep raw release logs outside Git under the ignored Avia task state.

## Context and Orientation

Repository: `/Users/marlonjd/Developer/monorepos/web-debug-mcp`. Starting HEAD: `f96443f481c0f394ff552edbbb44c2d7e969c927`. Completed implementation: [`../completed/agent-workflow-efficiency.md`](../completed/agent-workflow-efficiency.md). All task data and the pre-release source snapshot are under `/Users/marlonjd/Developer/monorepos/avia/.state/web-debug-release-0.13.0-20261015`.

## Plan of Work

Promote the current package and immutable plugin MCP pins together, document migration from summary schema 6 to 7 and retained resources, refresh current compatibility evidence without relabeling old results, and run the native release checks. Review the package contents before any npm mutation. After source commitment, verify an exact tarball with fresh prefixes and the installed supported Node runtimes, publish the same bytes, then independently read public registry integrity/tag/release state and run a fresh public install handshake.

## Concrete Steps

1. Update release identity files, README/product/security/compatibility documentation, release notes and expected release identities in existing tests.
2. Run `npm test`, `npm run typecheck`, `npm run build`, `npm audit --omit=dev`, all three skill validators and affected repository-native live checks. Record each actual outcome.
3. Run `git diff --check`; inspect tracked and new source files and the package file list. Commit all authorized repository changes with Conventional Commits.
4. Build and pack the committed source once; install that exact archive into fresh prefixes and perform public stdio identity/schema/detection handshakes using Node 20, 22 and 24.
5. Verify upstream main before the normal push, publish that exact archive to npm latest, publish v0.13.0/GitHub notes for the same source, compare public checksums, and verify a fresh public install.
6. Inspect owned browser/fixture/verification processes, record cleanup and final publication evidence, and commit/push final release documentation.

## Validation and Acceptance

Required local gates must pass; blocked/failed checks remain literal. The archive version, plugin pins, serverInfo version, tag/source commit and npm/GitHub release must agree. Verify 13 advertised concrete output schemas plus project detection in each exact-archive handshake. Public archive integrity must equal the tested bytes. A local plugin installation or an already-running task rebinding is not part of this release acceptance. No provider/production, external browser or live Antigravity authority is inferred.

## Idempotence and Recovery

Keep older tags/releases and the npm next channel unchanged. Query public registry state after any uncertain publish before attempting a retry; never overwrite version 0.13.0 with different bytes. Retain failed check logs and diagnose failures before rerunning. Clean up only command-owned PID/start identities and isolated test profiles, preserving normal user browsing. The pre-release snapshot preserves the prior worktree.

## Outcomes & Retrospective

In progress. Record exact source/archive/publication identities and verification limits before closing.

## Artifacts and Notes

- Source snapshot: `pre-release-worktree.tar.gz`; starting identity: `baseline.json` in task state.
- Previous benchmark PDF and raw model runs remain unchanged in `web-debug-improvements-20261014`.

## Interfaces and Dependencies

Use the existing npm CLI, GitHub CLI keyring session, MCP SDK and repository smoke scripts. Authenticated GitHub operations unset GH_TOKEN and GITHUB_TOKEN. No new dependency, remote infrastructure, workflow, branch or browser authority is needed.

## Revision History

- 2026-10-15: Started the explicitly authorized 0.13.0 commit/push/publication task and recorded the npm reauthentication requirement.
