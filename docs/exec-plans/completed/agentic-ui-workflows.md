# Add agent-readable interactive UI capture and workflow recipes

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). Work on the existing checkout and branch; do not create or switch branches.

## Purpose / Big Picture

Give agents a compact, bounded view of currently actionable web UI elements while preserving the existing 13-tool MCP facade. Document a Marionette-inspired interactive smoke workflow, clarify exploration-to-native-test handoff, and keep WebMCP product-authoring boundaries explicit. Figma remains a deferred optional design-parity feature, not a core dependency.

## Progress

- [x] (2026-09-08 22:40Z) Add and validate the bounded `interactiveElements` capture contract and Chromium/Safari adapters.
- [x] (2026-09-08 22:40Z) Update the existing bundled workflow skills and related documentation without adding a fourth skill or Figma connector.
- [x] (2026-09-08 22:44Z) Run focused tests, full tests, typecheck, build, verification, all relevant browser/framework smokes, and diff hygiene.

## Surprises & Discoveries

- The repository already has exact semantic locators, computed Chromium accessibility diagnostics, replay, adaptive verification, and direct-only WebMCP. The new surface should compose these boundaries rather than add a second tool or generic page hook.
- Safari supports DOM/JavaScript evaluation but not computed accessibility diagnostics; interactive-element collection can remain DOM-derived and report its own capability truthfully.

## Decision Log

- 2026-09-09, user and Platform Engineering: Do not add a new general-purpose skill. Extend `web-debug-workflow` and `manual-parity-qualification`; keep `webmcp-tool-authoring` limited to approved product capabilities.
- 2026-09-09, user and Platform Engineering: Add `interactiveElements` as a selected `web_issue_capture` surface, not a new MCP tool. Keep it bounded, action-oriented, locator-aware, and safe for both Chromium and Safari where the transport permits.
- 2026-09-09, user and Platform Engineering: Keep Figma as deferred optional design parity, with an approved source and comparison thresholds required before implementation.

## Outcomes & Retrospective

Implemented and locally verified for both Chromium and Safari. `web_issue_capture` now exposes a selected-only, bounded `interactiveElements` surface through the existing 13-tool facade. Chromium reports existing semantic/test-id/label/text locators and live probe counts; Safari reports only stable CSS locators from `id`/`data-testid` and discloses that semantic AX diagnostics are unavailable. Both transports omit hidden/non-actionable candidates, bound names/text/geometry, report enabled/checked state where available, and never expose input values. Summary captures continue to skip the map unless it is explicitly selected; full/include/delta projections can request it.

The explore-to-native-test handoff is documented in the existing workflow and manual-parity skills: agents may use the map for discovery and then commit typed deterministic selectors/assertions to the native test runner. WebMCP remains limited to approved product capabilities and is not used as a generic test hook. Figma support was not implemented; DEBT-008 remains the deferred future-feature record and still requires an approved source and comparison thresholds.

Validation passed: `npm test` (35 files / 202 tests), `npm run typecheck`, `npm run build`, `git diff --check`, `npm run smoke:live`, `npm run smoke:safari`, `npm run smoke:react-vite`, `npm run smoke:vue-vite`, `npm run smoke:angular`, `npm run smoke:next`, `npm run smoke:webmcp`, and `npm run smoke:local-fidelity`. No production, remote-browser, hosted-MCP, Figma, release, or plugin-publication claim is made.

## Context and Orientation

`src/index.ts` owns the single MCP facade and the 13 public tools. `BrowserSnapshot` and `CaptureDetails` in `src/domain/types.ts`, the wire schemas in `src/domain/wire-schemas.ts`, `ChromiumAdapter`/`SafariAdapter`, and `src/core/session-evidence.ts` own the capture path. `web_issue_capture` already supports summary/full/include/delta profiles and bounded cursors. The bundled skills live under `plugins/web-debug/skills/`.

The interactive surface is a compact, visible-action map: bounded element kind/role/name/text, a preferred existing `BrowserLocator`, live match count/uniqueness, enabled/checked state where applicable, and bounded viewport geometry. It must never include input values, arbitrary page objects, or untrusted page instructions.

## Plan of Work

1. Extend the domain and wire contracts with `interactiveElements`, shared bounds, locator metadata, and explicit bounds. Add adapter collection for Chromium and Safari using DOM-visible interactive candidates and existing locator probes where practical.
2. Thread the surface through capture projection, collection states, digests, evidence bounds, schemas, and tests without changing the MCP tool catalog or making it default summary evidence.
3. Add the interactive smoke recipe to `web-debug-workflow`, strengthen the native-test handoff language in `manual-parity-qualification`, and preserve the WebMCP product/test-hook boundary.
4. Update the public contract/reliability/examples only where the supported surface or workflow changes. Keep the deferred Figma record intact.
5. Run focused capture/routing/session tests, then `npm test`, `npm run typecheck`, `npm run build`, `npm test`, and `git diff --check`.

## Concrete Steps

1. Work from `/Users/marlonjd/Developer/monorepos/web-debug-mcp` and preserve the existing uncommitted Figma tracker row.
2. Add the smallest shared type/schema surface and adapter implementation. Reject duplicate/unknown surfaces through existing validation and retain existing summary/full size limits.
3. Add deterministic unit/contract coverage for visible and hidden candidates, duplicate locators, disabled/checked controls, truncation, Safari capability behavior, include/delta projection, and output-schema discovery.
4. Update skill prose and examples; do not add a fourth skill directory or a Figma connector.
5. Run the validation commands. If a live browser is unavailable, report the exact blocked smoke without substituting an unapproved browser route.

## Validation and Acceptance

- `CAPTURE_SURFACES` contains `interactiveElements`; `web_issue_capture` accepts it through include/full/delta and advertises it in its concrete output schema.
- Each returned element is bounded, contains only an existing locator kind, and reports whether that locator matched uniquely at capture; private input values never appear.
- Hidden/non-actionable DOM content is excluded; disabled/checked state and geometry are truthful when available; truncation is explicit.
- Chromium and Safari preserve their existing capability boundaries and do not claim computed AX semantics for Safari.
- The MCP catalog remains exactly 13 tools and all existing contracts remain valid.
- Skill/plugin validators, focused tests, full tests, typecheck, build, verification, and `git diff --check` pass, or a literal environment blocker is recorded.

## Idempotence and Recovery

The surface is additive and selected explicitly; existing captures remain valid. A failed optional collector returns an unavailable/warning state without failing the browser session. If a schema or adapter change exceeds bounds, narrow the element list or remove optional geometry before changing global result limits. Revert only the exact implementation/docs changes if validation cannot be restored; do not alter release tags or published artifacts.

## Artifacts and Notes

- Deferred Figma item: [`tech-debt-tracker.md`](../tech-debt-tracker.md), DEBT-008.
- Existing evidence examples: [`examples-evidence.md`](../../examples-evidence.md).

## Interfaces and Dependencies

Reuse `BrowserLocator`, `LocatorProbeResult`, existing browser adapter `snapshot`, `web_issue_capture` profiles, Zod wire schemas, redaction, and bounded evidence utilities. Add no dependency, public tool, remote target, hosted service, production test hook, or Figma connector.

## Revision History

- (2026-09-08 22:30Z) Change: Created the implementation plan. Reason: Record the user-authorized cross-cutting interactive capture and workflow update.
- (2026-09-08 22:44Z) Change: Completed the bounded interactive capture implementation, skill/documentation updates, and local verification sweep. Reason: All promised acceptance checks passed; Figma remains deferred as DEBT-008.
