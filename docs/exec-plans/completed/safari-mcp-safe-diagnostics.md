<!-- harness-plan:v1
id: safari-mcp-safe-diagnostics
status: completed
created: 2026-08-31
updated: 2026-08-31
completed: 2026-08-31
owner: Web Debug maintainers
-->

# Use Safari MCP only for handle-scoped optional diagnostics

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). Preserve the current source-next worktree and add no release, install, branch, GitHub, production, credential, remote-browser, or marketplace action.

## Purpose / Big Picture

Safari MCP failed the full transport cutover gate, but its handle-scoped tab lifecycle, console-summary, and network-summary tools are useful when Safari 27 MCP is already configured. Extend the existing `web-debug-workflow` skill—not the core MCP server—to use that subset as a separate opt-in diagnostic session. WebDriver/BiDi remains the authoritative Safari adapter, Safari MCP output remains diagnostic-only, and evidence from the two sessions is never presented as one session or as qualification PASS.

## Progress

- [x] (2026-08-31 14:15Z) Reviewed the caller-provided Safari 27 gate and selected only tools with explicit owned handles.
- [x] (2026-08-31 14:25Z) Added one focused workflow reference and concise routing instructions.
- [x] (2026-08-31 14:30Z) Added deterministic skill/harness checks and updated only affected architecture/security/compatibility wording.
- [x] (2026-08-31 14:37Z) Ran skill, focused, full, typecheck/build, harness, and diff gates; completed with literal `not live-run on this host` status.

## Surprises & Discoveries

- The safe subset is `create_tab`, `navigate_to_url(tab_uuid)`, `browser_console_messages(tab_handle)`, `list_network_requests(tab_handle)`, and `close_tab(handle)`.
- `page_info`, `page_interactions`, `get_page_content`, `screenshot`, `evaluate_javascript`, `set_viewport_size`, and `wait_for_navigation` lack an owned-tab handle in the observed Safari 27 schemas and cannot be used by this route.
- `get_network_request` includes headers and bodies and remains prohibited.

## Decision Log

- 2026-08-31, user and Web Debug maintainers: Use Safari MCP only as an explicitly selected, separate diagnostic session when the safe tool subset is present. Rationale: retain useful vendor console/network summaries without weakening target ownership or creating a second internal Safari transport.
- 2026-08-31, Web Debug maintainers: Implement this in skill guidance only. Rationale: no core public tool or adapter can safely merge a second Safari tab's state with the authoritative WebDriver session.

## Outcomes & Retrospective

Implemented as skill guidance only. A separately configured Safari 27 MCP may now be used for one owned diagnostic tab with handle-scoped navigation, console summaries, network summaries, and close. Ambient/full-detail tools remain forbidden; WebDriver/BiDi stays authoritative and Safari MCP evidence remains separate and diagnostic-only. This host did not run the external route because it has Safari 26.6.2 without `--mcp`; the contract is backed by the reviewed caller-provided Safari 27 schema artifact, not a local live claim.

Validation: workflow skill `quick_validate.py` passed through a temporary PyYAML environment; focused plugin-skill tests passed 15/15; the full suite passed 32 files/161 tests; typecheck/build passed; `npm run harness:check` passed 596 checks with stale-candidate certification; `git diff --check` passed.

## Context and Orientation

`plugins/web-debug/skills/web-debug-workflow/SKILL.md` owns browser-diagnostic routing. `test/plugin-skill-contract.test.ts` and `scripts/harness-check.mjs` enforce bundled skill decisions. `ARCHITECTURE.md`, `README.md`, `docs/COMPATIBILITY.md`, and `docs/SECURITY.md` currently state that Safari MCP is not an internal transport. The completed Safari gate summary is [`../evidence/safari-27-mcp-feasibility-2026-08-31.json`](../evidence/safari-27-mcp-feasibility-2026-08-31.json).

## Plan of Work

Add `plugins/web-debug/skills/web-debug-workflow/references/safari-mcp-diagnostics.md` and link it only from the Safari diagnostic branch in `SKILL.md`. Require explicit opt-in, an already configured Safari 27 MCP server, one newly created owned tab, exact loopback URL validation, handle-bearing calls only, summary-only console/network evidence, forbidden-tool exclusion, owned-tab close, and separate provenance/reporting. Missing tools or any handle mismatch skips this route and leaves WebDriver/BiDi unchanged.

Add deterministic checks that require the safe allowlist, forbid ambient/full-detail tools, preserve diagnostic-only/native-runner wording, and keep exactly 13 public Web Debug MCP tools. Update only durable text that currently implies Safari MCP is unusable rather than rejected for full cutover.

## Concrete Steps

1. Add one Safari MCP diagnostic reference under `web-debug-workflow` and route to it conditionally.
2. Freeze the exact handle-scoped allowlist and forbidden ambient/full-detail tools in focused tests and the native harness.
3. Update affected architecture/security/compatibility wording and run skill, focused, full, type/build, harness, and diff gates.

## Validation and Acceptance

```bash
python3 /Users/marlonjd/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/web-debug/skills/web-debug-workflow
npx vitest run test/plugin-skill-contract.test.ts
npm test
npm run typecheck
npm run build
npm run harness:check
git diff --check
```

Acceptance requires no core TypeScript/runtime changes, no new public MCP tool, no change to SafariAdapter authority, no qualification PASS from Safari MCP, and exact skill text that uses only the safe handle-scoped subset. Live Safari MCP execution is not claimed on this host; the route is contract-backed by the caller-provided Safari 27 artifact and remains conditional on tool availability at use time.

## Idempotence and Recovery

The implementation changes instructions, tests, and documentation only. If validation fails, correct or remove only this plan's exact edits. Do not touch existing source-next runtime changes. Future skill execution must close only its own tab and must not enumerate, switch, inspect, or close user tabs.

## Artifacts and Notes

- Safari 27 gate summary: [`../evidence/safari-27-mcp-feasibility-2026-08-31.json`](../evidence/safari-27-mcp-feasibility-2026-08-31.json).
- Safe subset: owned `create_tab`, `navigate_to_url`, console/network summaries, and `close_tab`; no live execution claimed on this Safari 26 host.

## Interfaces and Dependencies

Add no dependency, script, generator, adapter, transport, server, or public schema. The existing Web Debug MCP remains at exactly 13 tools. Safari MCP stays external and optional.

## Revision History

- (2026-08-31 14:15Z) Change: Created the plan. Reason: Reuse the safe Safari MCP subset without weakening the rejected full-cutover decision.
- (2026-08-31 14:37Z) Change: Completed the handle-scoped optional diagnostic route, mechanical policy checks, and bounded documentation. Reason: Preserve useful Safari MCP console/network summaries without adding a second internal transport or evidence authority.
  Semantic-Review: reviewer=Web Debug maintainers; reviewed-at=2026-08-31 14:37Z; content-sha256=dd0ddee9820ee7fc3fc687b5f842d435d59b2711f66e023ffbe187cbd8fc6d94; evidence=Reviewed the exact owned-handle allowlist, forbidden tools, separate-session labeling, diagnostic-only qualification boundary, validators, full suite, harness, and diff evidence.
