<!-- harness-plan:v1
id: npm-publication-0-3-1
status: completed
created: 2026-08-28
updated: 2026-08-28
completed: 2026-08-28
owner: Platform Engineering
-->

# Publish the first npm package as 0.3.1

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md).

## Purpose / Big Picture

Publish a runnable `web-debug-mcp` package to the public npm registry, then update the Codex/ChatGPT/Claude Code plugin to resolve the immutable npm version. The GitHub-only `v0.3.0` release remains unchanged. The npm patch is `0.3.1` because npm 11 rejects the released manifest's `./bin/web-debug-mcp.mjs` entry and would silently remove the CLI executable.

## Progress

- [x] (2026-08-28 10:37Z) Authenticate to npm as `marlonjd` through the web login flow.
- [x] (2026-08-28 10:37Z) Abort the initial publish before registry mutation after npm reported that it would remove the invalid `bin` entry.
- [x] (2026-08-28 10:40Z) Correct package metadata, remove install-time scripts, bump package/plugin/runtime surfaces to `0.3.1`, and switch the bundled runtime from GitHub `v0.3.0` to immutable npm `web-debug-mcp@0.3.1`.
- [x] (2026-08-28 10:40Z) Run 61 deterministic tests, typecheck, build, harness (`232 checks`), plugin validation, warning-free real pack/fresh-prefix install, 13-tool stdio handshake, and registry/tag/release preflight.
- [x] (2026-08-28 10:50Z) Commit and push `e97bab0`, tag `v0.3.1`, publish npm with `latest=0.3.1`, publish the GitHub release, refresh/install Codex plugin `0.3.1+codex.20260828103736`, and verify all published identities.

## Surprises & Discoveries

- npm 11 normalizes repository URLs and rejects a `bin` target beginning with `./`; continuing would have published a package without the `web-debug-mcp` executable.
- `web-debug-mcp` is currently absent from npm, so `0.3.1` will be the first registry version. npm authentication is now available on this host.
- npm 11's exec resolver prefers the same-named local root package when invoked inside this repository, so registry `npx` verification must run from an empty working directory. Empty-directory/empty-cache execution passed and listed all 13 tools.

## Decision Log

- Decision: publish `0.3.1` rather than rewriting `v0.3.0`. Rationale: GitHub tag/release `v0.3.0` is immutable historical evidence; the packaging correction is a patch release. Date/Author: 2026-08-28 / Platform Engineering.
- Decision: use `npx -y web-debug-mcp@0.3.1` in the bundled plugin. Rationale: npm versions are immutable and avoid GitHub package resolution after the first registry publication. Date/Author: 2026-08-28 / Platform Engineering.
- Decision: remove `prepare` and keep `prepack`. Rationale: the npm artifact ships built `dist/`; consumers need no install-time script, while publication still rebuilds deterministically. Date/Author: 2026-08-28 / Platform Engineering.

## Outcomes & Retrospective

`web-debug-mcp@0.3.1` became the first public npm package with a valid executable, no install-time build, and an immutable plugin runtime pin. A real tarball and the public package both completed the 13-tool MCP handshake, and release source/tag/GitHub/plugin identities agreed. The aborted initial attempt prevented a broken registry mutation and demonstrated that npm's normalized manifest must be inspected before publishing.

## Context and Orientation

The release changed `package.json`, the lockfile, npm binary metadata, plugin manifests and marketplaces, the bundled `.mcp.json`, README installation commands, and package/release verification. The prior GitHub-only `v0.3.0` remained immutable. npm CLI, sanitized GitHub CLI, fresh temporary prefixes, and Codex marketplace/plugin commands were the release surfaces.

## Plan of Work

Validate the npm-normalized manifest before publication, correct the executable and install-script contract, align every `0.3.1` source/plugin identity, run repository and real-package gates, then publish forward-only and verify npm/GitHub/Codex equality. Stop before registry mutation if npm removes or rewrites a required field.

## Concrete Steps

Work on the existing `main` branch. Authenticate npm through web login; run the package gates and real tarball install; commit and push the source; create the exact tag; publish npm and GitHub release; refresh/install the plugin; then query all public and local identities from an empty directory so the repository package cannot shadow registry resolution.

## Validation and Acceptance

Acceptance requires `npm test`, typecheck, build, harness, plugin validation, warning-free `npm pack`, fresh-prefix `npx`/binary MCP handshake, public npm metadata for exactly `0.3.1`, release-source/tag/GitHub-release SHA agreement, Codex installed/enabled at the `0.3.1` plugin build, and a clean worktree. An evidence-only follow-up commit may advance `main`; never move `v0.3.0` or `v0.3.1`.

## Idempotence and Recovery

Preflight npm and GitHub identities before irreversible writes. If npm publication fails before registry mutation, fix forward without moving existing tags. If npm succeeds but a later GitHub or Codex step fails, retain the immutable npm version and complete the remaining release steps; do not unpublish.

## Artifacts and Notes

`web-debug-mcp@0.3.1` is public on npm with `latest=0.3.1`, executable `bin/web-debug-mcp.mjs`, shasum `67a8c85607b7c1cfc961bd586677f2cd3b9c488f`, and no install-time script. A real tarball and the public registry package both installed into fresh directories and completed a 13-tool MCP handshake. Release source commit, annotated tag `v0.3.1`, and GitHub release resolve to `e97bab0c2deea5c7ec98dc7d1eaf96727dbc9276`; the evidence-only documentation commit `d328451` then advanced `main` without changing release contents. Codex reports `web-debug@web-debug` installed/enabled at `0.3.1+codex.20260828103736`, whose bundled MCP runtime is pinned to `web-debug-mcp@0.3.1`.

## Interfaces and Dependencies

The package retains the existing MCP SDK, Playwright, Zod, Node, and npm dependencies. `bin/web-debug-mcp.mjs` is the only package executable, `dist/` is shipped, `prepack` builds the archive, and consumers run no `prepare` script. The plugin starts the immutable public package over stdio rather than a GitHub branch.

## Revision History

- (2026-08-28 10:37Z) Change: Created the publication plan after the npm 11 prepublish check prevented a broken first registry release. Reason: Preserve the aborted mutation and define a forward-only corrected package contract.
- (2026-08-28 10:50Z) Change: Completed npm, GitHub, and Codex publication with exact registry/runtime identity verification. Reason: Record the first working public npm release and its immutable source/plugin evidence.
  Semantic-Review: reviewer=Platform Engineering; reviewed-at=2026-08-29 20:30Z; content-sha256=24f485bb707f115ecd2a544270ba96526ed7064628bd4a5f8a1761fd12504024; evidence=Reviewed the aborted broken publish, forward-only packaging correction, checked release milestones, fresh-prefix and public-registry handshakes, immutable identities, and post-publication recovery boundary.
