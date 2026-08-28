<!-- harness-plan:v1
id: npm-publication-0.3.1
status: active
created: 2026-08-28
updated: 2026-08-28
completed:
owner: Platform Engineering
-->

# Publish the first npm package as 0.3.1

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md).

## Purpose / Big Picture

Publish a runnable `web-debug-mcp` package to the public npm registry, then update the Codex/ChatGPT/Claude Code plugin to resolve the immutable npm version. The GitHub-only `v0.3.0` release remains unchanged. The npm patch is `0.3.1` because npm 11 rejects the released manifest's `./bin/web-debug-mcp.mjs` entry and would silently remove the CLI executable.

## Progress

- [x] (2026-08-28 10:37Z) Authenticate to npm as `marlonjd` through the web login flow.
- [x] (2026-08-28 10:37Z) Abort the initial publish before registry mutation after npm reported that it would remove the invalid `bin` entry.
- [ ] Correct package metadata, bump package/plugin/runtime surfaces to `0.3.1`, and switch the bundled runtime from GitHub `v0.3.0` to immutable npm `web-debug-mcp@0.3.1`.
- [ ] Run deterministic gates, plugin validation, a real pack/fresh-prefix binary handshake, and registry/tag/release preflight.
- [ ] Commit and push, tag `v0.3.1`, publish npm, publish the GitHub release, refresh/install the Codex plugin, and verify all published identities.

## Surprises & Discoveries

- npm 11 normalizes repository URLs and rejects a `bin` target beginning with `./`; continuing would have published a package without the `web-debug-mcp` executable.
- `web-debug-mcp` is currently absent from npm, so `0.3.1` will be the first registry version. npm authentication is now available on this host.

## Decision Log

- Decision: publish `0.3.1` rather than rewriting `v0.3.0`. Rationale: GitHub tag/release `v0.3.0` is immutable historical evidence; the packaging correction is a patch release. Date/Author: 2026-08-28 / Platform Engineering.
- Decision: use `npx -y web-debug-mcp@0.3.1` in the bundled plugin. Rationale: npm versions are immutable and avoid GitHub package resolution after the first registry publication. Date/Author: 2026-08-28 / Platform Engineering.

## Validation and Acceptance

Acceptance requires `npm test`, typecheck, build, harness, plugin validation, warning-free `npm pack`, fresh-prefix `npx`/binary MCP handshake, public npm metadata for exactly `0.3.1`, GitHub main/tag/release SHA agreement, Codex installed/enabled at the `0.3.1` plugin build, and a clean worktree. Never move `v0.3.0`.

## Idempotence and Recovery

Preflight npm and GitHub identities before irreversible writes. If npm publication fails before registry mutation, fix forward without moving existing tags. If npm succeeds but a later GitHub or Codex step fails, retain the immutable npm version and complete the remaining release steps; do not unpublish.

## Outcomes & Retrospective

Pending implementation and publication.

## Revision History

- (2026-08-28 10:37Z) Created after the npm 11 prepublish check prevented a broken first registry release.
