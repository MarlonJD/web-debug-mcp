# Release Web Debug 0.12.0 and update the local plugin

## Purpose / Big Picture

The user authorized commit, push, a new release, and the necessary local plugin/MCP update. Preserve the current branch and publish one immutable, tested archive that includes source/execution diagnostics and real Safari console collection without losing the published 0.11.0 WebMCP, interactive capture, selective evidence, or registry recovery features.

## Progress

- [x] Verify public and installed baselines; back up and commit the local work as `e44dc86`.
- [x] Fetch the 16 upstream commits through `289aa6a` and resolve the source/docs merge on existing main.
- [x] Pass 228 deterministic tests, typecheck/build, audit zero, all nine browser/framework smokes, six comparison scenarios and the three plugin skill validators with final 0.12.0 identities. Exact archive checks follow the source commit.
- [ ] Commit and push the release source; pack and verify one exact archive.
- [ ] Publish npm latest and the matching GitHub tag/release; verify public integrity and a fresh install.
- [ ] Update the local plugin and remove only an obsolete duplicate Web Debug MCP override if the bundled connection is sufficient.
- [ ] Verify cleanup and record final publication/install evidence.

## Surprises & Discoveries

The worktree began at 0.6.0 (`36450ec`), while npm latest, upstream main, and the installed plugin were already 0.11.0. Publishing directly would lose later work. The task snapshot is `/private/tmp/web-debug-release-0.12.0-gufhEh/task-workspace.tar.gz`; generated Angular cache is excluded. The upstream tip intentionally removed the old harness infrastructure; this release preserves that removal and uses repository-native tests and live evidence.

GitHub owner authentication is available. npm initially returned E401; the user completed the official web login and npm whoami now confirms marlonjd. The installed plugin is `0.11.0+codex.20260909101709`. A separate enabled MCP override currently points at `github:MarlonJD/web-debug-mcp#main`; the final installation must resolve one immutable 0.12.0 runtime rather than keep duplicate controllers.

## Decision Log

- Use semver minor 0.12.0 for new diagnostic capabilities and the Safari 27+ transport/API change. Do not overwrite older releases or tags.
- Merge upstream on the existing main without branch creation, switching, force push, or history rewriting. Preserve the upstream feature and security contracts.
- Keep the 13-tool facade and schema-6 capture/verification contracts. Diagnostics remain explanatory; direct WebMCP actions stay authorized, one-shot, opaque and non-replayable.
- Publish the exact committed archive; leave the unrelated legacy npm next channel unchanged.
- Refresh the configured Git marketplace and install the plugin through Codex CLI. Verify the bundled MCP pin before removing the redundant mutable-main override. Keep native standalone Safari MCP and all unrelated plugins unchanged.

## Validation and Acceptance

Require integrated `npm test`, typecheck/build, production dependency audit, the three skill/plugin contract checks, all affected browser/framework smokes, and diff validation. Verify archive contents, package/server identity, 13 tools and 13 concrete schemas using a fresh prefix and installed Node runtimes. After publication, registry integrity, Git tag/release SHA, plugin build and bundled runtime must agree. Do not claim new-session tool rebinding solely from installation metadata.

## Outcomes & Retrospective

The integrated release candidate is locally verified. Publication and installed-plugin replacement remain pending. The source preservation commit is e44dc86; the merged release commit has not yet been created.

## Revision History

- 2026-10-13: Started the authorized release after discovering and preserving the newer public/upstream baseline.

- 2026-10-13: Integrated 0.11.0, retained the harness removal, fixed short-input diagnostic redaction and debugger read/pause races, and bounded macOS EPERM cleanup with read-only exit proof. Browser HMR waits for an observed new source identity. Final local gates pass; SDK 1.32.1 and compatible transitive patches reduce the production audit to zero.
