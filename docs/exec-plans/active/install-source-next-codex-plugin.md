<!-- harness-plan:v1
id: install-source-next-codex-plugin
status: active
created: 2026-08-31
updated: 2026-08-31
completed:
owner: Web Debug maintainers
-->

# Commit, push, and install the verified source-next plugin locally

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). The user explicitly authorized commit, push, update, and Codex installation. Do not publish npm, create a tag/GitHub release, update the public marketplace, or change branches.

## Purpose / Big Picture

Deliver the verified `0.7.0-next.0` source-next work to `origin/main` and replace the installed `web-debug@web-debug` `0.6.0` plugin with a local source-next installation that uses an immutable locally packed runtime. Keep the configured remote `web-debug` marketplace for rollback and future releases. The installed plugin must expose all three skills and exactly 13 updated MCP tools without relying on an unpublished npm version or mutable Git ref.

## Progress

- [x] (2026-08-31) Verified current GitHub CLI authentication, `main` branch, remote, installed plugin `0.6.0+codex.20260831002920`, and configured remote marketplace.
- [x] (2026-08-31) Built and packed the verified source-next package into stable prefix `/Users/marlonjd/.codex/local-runtimes/web-debug-source-next/b58bf248e9846fa201947b17dfcf1e6de47b9ed3`; MCP handshake returned `0.7.0-next.0`, exact 13 tools, and 13 concrete schemas.
- [x] (2026-08-31) Created and validated local `web-debug-source-next` marketplace overlay with all three skills and the exact local runtime command.
- [x] (2026-08-31) Replaced installed `web-debug@web-debug` with enabled `web-debug@web-debug-source-next` `0.7.0-next.0+codex.20260831144834`; the released plugin remains available for rollback and only one `web-debug-mcp` registration is enabled.
- [ ] Complete repository gates, create Conventional Commit(s), push `main`, and verify exact remote SHA.

## Surprises & Discoveries

- The repository plugin correctly remains pinned to public `web-debug-mcp@0.6.0`; installing it directly would expose new skills but run the old MCP schema.
- The package intentionally has no `prepare` script and `dist/` is untracked, so a Git dependency cannot provide the source-next runtime safely. A real local tarball install is required unless npm publication is separately authorized.

## Decision Log

- 2026-08-31, Web Debug maintainers: Install a local immutable tarball runtime through a separate local marketplace rather than publish npm or mutate the remote marketplace. Rationale: satisfy the explicit local Codex installation request without expanding authority to a public release.
- 2026-08-31, Web Debug maintainers: Keep the remote `web-debug` marketplace configured and snapshot the prior plugin identity. Rationale: one-command rollback to released `0.6.0` if local installation fails.

## Outcomes & Retrospective

The immutable local runtime and source-next plugin are installed and enabled. Codex reports one installed Web Debug plugin, all three skill trees in its cache, and one enabled `web-debug-mcp` transport pointing to the content-addressed local binary. The remote `web-debug` marketplace and released `0.6.0` plugin remain available but not installed. Repository commit/push evidence is recorded by the final delivery step after this plan file is committed.

## Context and Orientation

The current installed plugin is `web-debug@web-debug` `0.6.0+codex.20260831002920`, enabled from the Git marketplace at `https://github.com/MarlonJD/web-debug-mcp.git`. Repository source is `0.7.0-next.0`; `.mcp.json` remains pinned to released npm `0.6.0`. Codex CLI installs plugins only from configured marketplace snapshots. The local overlay will live under `/Users/marlonjd/.codex/local-marketplaces/web-debug-source-next`, while the packed runtime/prefix will live under `/Users/marlonjd/.codex/local-runtimes/web-debug-source-next` with a content-derived directory name.

## Plan of Work

Run final repository gates, build one real tarball into a command-owned temporary directory, parse its exact shasum, and install it into a stable shasum-named prefix. Exercise that binary with MCP initialize/tools-list and require server version `0.7.0-next.0`, the canonical exact 13 names, and concrete schemas.

Snapshot installed plugin and marketplace JSON. Build a stable local marketplace overlay by copying `plugins/web-debug`, changing only its local installation identity and MCP command, and adding a local marketplace manifest named `web-debug-source-next`. The MCP command points directly to the stable installed binary. Remove `web-debug@web-debug`, add/refresh the local marketplace, install `web-debug@web-debug-source-next`, and verify it is enabled with three skills. If any step fails, remove the partial local plugin/marketplace and reinstall `web-debug@web-debug` from the unchanged remote marketplace.

Record bounded evidence, complete this plan, commit all repository changes with Conventional Commit messages, and push current `main` using sanitized GitHub authentication. Verify `origin/main` equals local `HEAD`. Do not publish, tag, or open a GitHub release.

## Validation and Acceptance

```bash
npm test
npm run typecheck
npm run build
npm run harness:check
git diff --check
env -u GH_TOKEN -u GITHUB_TOKEN gh auth status
```

Acceptance requires a stable installed runtime handshake returning `0.7.0-next.0`, exact 13 tools and concrete schemas; exactly one installed/enabled Web Debug plugin (`web-debug@web-debug-source-next`) with all three skill directories; the old remote marketplace still configured but old plugin not installed; no duplicate standalone Web Debug MCP config; clean command-owned process/temp cleanup; committed repository state; and local/remote `main` SHA equality.

## Idempotence and Recovery

Use content-derived stable paths and refuse path drift. Remove only the exact source-next overlay/runtime created by this plan. Before replacing the installed plugin, retain prior identity `web-debug@web-debug` `0.6.0+codex.20260831002920`. Rollback removes the source-next plugin and local marketplace, then reinstalls the released plugin from the unchanged remote marketplace. Never delete broad Codex cache/config directories.

## Interfaces and Dependencies

Use existing Node/npm/Codex/GitHub CLIs and the existing MCP SDK. Add no repository dependency or public runtime. Local overlay files are installation state, not repository source.

## Revision History

- (2026-08-31) Change: Created the plan. Reason: Deliver the verified source-next runtime and skills to Codex without an unauthorized public release.
- (2026-08-31) Change: Completed local pack, handshake, marketplace overlay, plugin replacement, and duplicate-registration verification. Reason: Install the verified source-next runtime and skills without publishing npm or mutating the public marketplace.
