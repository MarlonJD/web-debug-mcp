<!-- harness-plan:v1
id: webmcp-hybrid-authoring-and-safari-mcp
status: completed
created: 2026-08-31
updated: 2026-08-31
completed: 2026-08-31
owner: Web Debug maintainers
-->

# Add direct-only WebMCP actions and gate a forward-only Safari 27 MCP cutover

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). Work on the current branch, preserve unrelated changes, and do not publish, release, install into Codex, update a marketplace, or write to GitHub under this plan.

## Purpose / Big Picture

Web Debug should use the smallest complete path for a local web task. Chromium remains owned by `ChromiumAdapter` through Playwright/CDP. A page's `document.modelContext` may add one direct semantic action, but in this increment it is untrusted callable page API, not browser-native provenance, a replay program, or an adaptive verification primitive. Safari remains represented by `SafariAdapter`. A real Safari 27 beta or compatible Safari Technology Preview gate decides whether the only internal Safari transport can be cut forward from WebDriver/BiDi to `safaridriver --mcp`.

The plugin adds one minimal `webmcp-tool-authoring` skill for a legitimate, approved product capability and strengthens `manual-parity-qualification` without inventing another execution class, runner, generator, or self-approval path. WebMCP-only qualification stays `contract-only`; a hybrid WebMCP/UI case stays `ui-required` and retains the existing visible and independent domain facets. Safari MCP and Web Debug evidence remain diagnostic; only a target repository's native runner can award qualification PASS.

The smallest complete vertical slice is one source-backed fixture capability whose direct Chrome WebMCP call has a bounded/redacted opaque result, visible UI evidence, and an independent state oracle. The same user-visible journey is exercised by a native Safari runner. The public MCP catalog remains the same exact 13-tool set. Safari MCP is retained only when the compatibility gate passes completely; a failed gate terminates in an explicit no-cutover decision with WebDriver/BiDi unchanged.

## Progress

- [x] (2026-08-31 11:30Z) Agreed the browser, skill, safety, simplicity, native-runner, and forward-only Safari 27 product boundaries.
- [x] (2026-08-31 11:45Z) Created the active umbrella ExecPlan and registry entry before implementation.
- [x] (2026-08-31 12:10Z) Completed the two independent `gpt-5.6-sol` plan reviews. Both returned NO-GO/repair-required; their merged packet contained no unresolved disagreement.
- [x] (2026-08-31 12:30Z) Repaired this plan in the requested separate `gpt-5.6-sol` `xhigh` pass. The plan now has independent hard Chrome and Safari feasibility gates, a direct-only WebMCP contract, exact wire/version effects, and explicit rollback rules.
- [x] (2026-08-31 13:05Z) Passed the real Chrome 151 WebMCP feasibility probe in both headless and visible command-owned sessions. The enabled `WebMCP` flag exposed `document.modelContext`, same-origin registration/discovery, `window === window`, and the documented JSON-string `executeTool(tool, argumentsJson, { signal })` call; the retained direct-only contract and smoke cover the safe vertical slice.
- [x] (2026-08-31 13:20Z) Reviewed the caller-provided Safari 27.0 MCP feasibility artifact from the other MacBook Pro. The gate returned `failed`: 36/53 rows passed, 10 failed, and 7 were blocked; no Safari MCP runtime code was retained.
- [x] (2026-08-31 13:35Z) Implemented and verified the direct-only Chromium WebMCP vertical slice: one fixture tool, bounded/redacted opaque result, visible UI plus independent read-back, non-restorable replay, screenshot suppression, fixed errors, and exact source-next schemas.
- [x] (2026-08-31 13:40Z) Rejected the Safari MCP cutover because the gate failed owned-handle, schema strictness, origin quarantine, bounds, freshness, and native parity requirements. `SafariAdapter` keeps WebDriver/BiDi as its sole transport.
- [x] (2026-08-31 13:50Z) Added the minimal `webmcp-tool-authoring` skill/reference, updated manual-parity routing, and added direct-action exclusion/adversarial contract tests.
- [x] (2026-08-31 14:05Z) Ran all eight disposable target-repository behavioral/adversarial cases with generated decision artifacts, a command-owned native-runner stub where applicable, and the existing validator. UI-sufficient/no-tool, approved capability gap, lying `readOnlyHint`, Safari without WebMCP, and native-runner ownership produced native-runner PASS with validator `ok: true`; candidate-only remained `crosswalkReady: false` with no native run; tool/domain disagreement and mutation timeout produced native-runner `inconclusive` with validator-computed `inconclusive`. No diagnostic/tool output was promoted to qualification evidence.
- [x] (2026-08-31 14:10Z) Updated source-next contracts and ran deterministic tests, Chrome/WebDriver live smokes, skill validation, isolated local-pack handshake, harness, and cleanup checks. Safari MCP cutover remains blocked and no candidate Safari transport was retained.

## Surprises & Discoveries

- The official Chrome guide observed on 2026-08-31 calls `document.modelContext.executeTool(tool, JSON.stringify(arguments), { signal })`: the second parameter is a valid JSON string, the discovered tool object is the first parameter, and the result is a string or `null` when navigation occurs. The implementation must not substitute a guessed object calling convention.
- `getTools()` returns callable page-provided metadata including a `Window` reference. A page can patch or imitate `document.modelContext`, so Web Debug can truthfully report only `webmcp-page-api` provenance. It must never infer browser-native provenance from that spoofable property.
- The current repository has capture schema 4, runtime-capability schema 1, session-summary schema 2, environment-fingerprint schema 3, scenario/verification schema 5, and an unversioned action result. Adding public action/capture/capability contracts therefore requires an explicit source-next schema cascade rather than silently extending final `0.6.0` shapes.
- `BrowserAction` currently feeds direct action, replay, scenario execution, `serverStateReset`, hashing, and adaptive retries. A single widened union would accidentally make WebMCP executable by all of them; the direct and replayable/scenario action types must be mechanically separated first.
- The qualification validator already freezes the execution-class enum to `ui-required`, `api-only`, `contract-only`, and `manual-only`, with facets including `visible-ui`, `api-readback`, `domain-state`, `history`, `audit`, `outbox`, and `privacy`. Hybrid behavior must compose those existing values, not add a `hybrid` enum member.
- Safari MCP exposes `get_network_request`, which includes headers and bodies. It is prohibited because Web Debug's current network contract is metadata-only.
- The inspected host has Safari 26.6.2 and no Safari Technology Preview. No compatible Safari 27 MCP host has yet been proven reachable, so the Safari feasibility milestone is currently blocked on external environment availability.
- The requested Safari task `01a05767-1676-7202-a0f0-c581e187a5fc` was not readable on host `local` (`No Codex thread found`), and `/usr/bin/safaridriver --mcp` on Safari 26.6.2 returns `unrecognized option '--mcp'`; no Safari 27 beta/STP is installed. This is the literal Safari feasibility blocker.
- The caller-provided other-MacBook artifact exercised Safari 27.0 build `22625.1.29.11.25` and initialized `Safari/1.0.0` MCP successfully, but the strict cutover matrix returned 36 passed, 10 failed, and 7 blocked rows. Decisive failures included ambient tools without owned handles, permissive schemas, absent origin quarantine, result/screenshot/inbound bound violations, missing freshness cursors/epochs, and blocked native WebDriver parity. Vendor availability therefore did not establish product safety or parity.
- A command-owned Chrome 151.0.7922.174 run with `--enable-features=WebMCP` passed both headless and visible modes against `http://127.0.0.1:4173/`; response status was 200, the API exposed `getTools`/`executeTool`/`registerTool`, and execution returned the registered opaque string. The browser still reports page-provided metadata only; this is not native provenance evidence.
- The source-next pack handshake returned `serverInfo.version: "0.7.0-next.0"`, exactly 13 canonical tool names, 13 concrete output schemas, and concrete WebMCP action/capture schema fields from an isolated local tarball install. The immutable `0.6.0` plugin/runtime was not contacted or changed.
- The eight forward cases were executed under one command-owned temporary root and each decision was read back from its generated `artifacts/manual-parity/decisions/decision.json`: `ui-sufficient-no-tool` (PASS), `candidate-only-source` (candidate/validator ready=false/native not run), `approved-capability-gap` (PASS), `lying-read-only-hint` (PASS while treated mutating), `tool-domain-disagreement` (inconclusive), `mutation-timeout` (inconclusive/no retry), `safari-without-webmcp` (native UI PASS), and `native-runner-verdict-ownership` (native PASS with Web Debug diagnostic-only). All validator invocations exited 0 with the expected computed verdict; the candidate case intentionally had no run record.
- Adding one skill intentionally changes the repository plugin source from two to three skill directories. It does not authorize updating or installing the released `0.6.0` Codex plugin.

## Decision Log

- 2026-08-31, user and Web Debug maintainers: Keep `ChromiumAdapter` and compose Playwright/CDP with optional WebMCP. WebMCP does not own generic DOM automation, lifecycle, screenshots, observers, debugger state, framework bridges, or origin policy.
- 2026-08-31, user and Web Debug maintainers: Keep one `SafariAdapter` façade and authorize a forward-only cutover if real Safari 27 MCP passes. At cutover the minimum supported Safari becomes 27, older Safari becomes unsupported, and `webdriverEndpoint`, WebDriver, and BiDi are removed. This product decision is separate from parity proof.
- 2026-08-31, merged independent reviewers: WebMCP is direct-action-only for this increment. It is excluded by type/schema from `web_repro_record.actions`, `serverStateReset.action`, scenario normalization/hash/execution, adaptive retries, private scenarios, replay restore, and matrix candidates regardless of `readOnlyHint`.
- 2026-08-31, merged independent reviewers: Every attempted WebMCP call is treated as potentially mutating. It executes once, requires explicit `allowSideEffects: true`, stores no executable replay action, makes the current timeline non-restorable, registers nested argument strings as private session secrets before lookup, and suppresses all later screenshots in that session generation.
- 2026-08-31, merged independent reviewers: Label detected WebMCP as callable `webmcp-page-api`, not browser-native. Metadata, JSON Schema text, descriptions, annotations, and results are untrusted page content and cannot become instructions or safety authority.
- 2026-08-31, user and merged independent reviewers: A failed Safari feasibility probe leaves only bounded evidence and no Safari MCP runtime code. A failed implementation/parity run removes all candidate Safari MCP code before the milestone can stop. The repository must never finish a milestone with two Safari transports.
- 2026-08-31, merged independent reviewers: Keep this single umbrella plan because the two browser paths share public capability, wire, version, skill, and qualification contracts. Hard independent feasibility stop gates prevent the umbrella from implying that blocked Safari work is complete.
- 2026-08-31, merged independent reviewers: Local source identity becomes `0.7.0-next.0`. Immutable npm/GitHub release `0.6.0` and the installed/released Codex plugin runtime stay explicitly labeled `0.6.0`; no release, publish, user/plugin install, or compatibility layer is in scope.
- 2026-08-31, user-provided Safari 27 evidence and Web Debug maintainers: Reject the Safari MCP cutover for this source-next release. Rationale: the vendor MCP starts and covers many actions, but it does not satisfy the frozen owned-handle, strict-schema, origin, bounds, observer-freshness, and native-parity invariants. Keep WebDriver/BiDi as the only Safari transport and retain no Safari MCP runtime code.

## Outcomes & Retrospective

Safe source-next slices are implemented and verified locally: direct-only Chromium WebMCP, source/version/capture contracts, fixture smoke, skill guidance, and qualification exclusion boundaries. Safari 27 MCP was evaluated through the caller-provided other-MacBook artifact and failed the frozen cutover gate. No candidate Safari MCP runtime was retained, no compatibility layer was added, and WebDriver/BiDi remains the sole Safari transport. This is a completed rejection decision, not a claim that Safari MCP parity passed.

Validation record: `npm test` passed (32 files/161 tests), `npm run typecheck` passed, `npm run build` passed, `git diff --check` passed, and `npm run harness:check` passed (`harness-check: PASS (591 checks; certification: stale-candidate)`). `npm run smoke:webmcp`, `smoke:live`, `smoke:react-vite`, `smoke:next`, `smoke:vue-vite`, `smoke:angular`, `smoke:local-fidelity`, and pre-cutover `smoke:safari` all returned `passed: true`; source-next isolated tarball stdio handshake returned exact 13 tools/13 concrete schemas. Skill validation passed in a temporary PyYAML-enabled Python environment; the base Python environment lacked PyYAML (`ModuleNotFoundError`) and was not modified. The eight forward cases above all produced the expected native/validator outcomes under a deleted temporary root.

## Context and Orientation

`src/index.ts` is the only MCP boundary and currently registers 13 tools. `src/domain/types.ts` and `src/domain/wire-schemas.ts` define the public action, target, session, capture, replay, scenario, verification, and capability shapes. `src/core/session-manager.ts` currently routes the same `BrowserAction` through direct execution, private scenarios, adaptive retries, server reset, and replay. `src/core/session-replay.ts`, `src/core/scenario-contract.ts`, `src/core/private-values.ts`, and `src/core/session-evidence.ts` own executable replay state, canonical scenario hashing, secrets, capture projection, and pruning. `src/adapters/chromium.ts` owns selected-page Playwright/CDP policy.

`src/adapters/browser.ts`, `src/adapters/safari.ts`, and `src/adapters/runtime-capabilities.ts` currently expose `webdriverEndpoint`, `safari-webdriver`, `safari-bidi`, and Performance Resource Timing fallback behavior. `src/core/doctor.ts`, `bin/web-debug-mcp.mjs`, `scripts/live-safari-smoke.mjs`, `README.md`, `ARCHITECTURE.md`, `docs/COMPATIBILITY.md`, `docs/RELIABILITY.md`, and `docs/SECURITY.md` describe or verify that transport. These exact surfaces must move together if the cutover passes.

`plugins/web-debug/skills/manual-parity-qualification/` owns reviewed qualification orchestration and its existing structural validator. `test/plugin-skill-contract.test.ts` and `scripts/harness-check.mjs` currently enforce exactly two plugin skills. The new `plugins/web-debug/skills/webmcp-tool-authoring/` may contain only `SKILL.md` and at most `references/tool-quality-and-security.md`; it gets no script, generator, assets, or runner.

The released baseline is `0.6.0`. `package.json`, `package-lock.json`, release-identity tests, README, compatibility/reliability evidence, harness rules, and the repository plugin source currently assume that final identity. Implementation must separate the local `0.7.0-next.0` source from the immutable npm/GitHub/installed-plugin `0.6.0` baseline rather than relabeling old evidence.

### Frozen WebMCP Contract

The public direct action added to `web_browser_action` is exactly:

```ts
type WebMcpDirectAction = {
  kind: "webmcp";
  origin: string;             // canonical URL origin; must equal the selected session origin
  name: string;               // exact, case-sensitive tool name
  arguments: Record<string, JsonValue>;
  allowSideEffects: true;     // required for every call; annotations never waive it
  timeoutMs?: number;         // integer 1..30000; default 30000
};
```

`arguments` is a JSON object with at most 64 keys per object, depth 8, 128 aggregate nodes, 100 characters per key, 2,000 UTF-8 bytes per string leaf, and 16,384 serialized UTF-8 bytes total. Validate those bounds and register every nested string leaf as a private session secret before discovery or execution. Serialize the validated object exactly once with `JSON.stringify` and pass that string to the live API. Do not accept a caller-supplied discovered-tool object.

Split the existing action contract into `ReplayableBrowserAction` (the current ten kinds) and `DirectBrowserAction = ReplayableBrowserAction | WebMcpDirectAction`. `BrowserAdapter.act` and `web_browser_action` accept the direct union. Replay, scenario actions, `serverStateReset`, scenario normalization/hash/public projection, matrices, and adaptive verification accept only `ReplayableBrowserAction`. Their Zod schemas must be distinct, and negative tests must prove that `kind: "webmcp"` is rejected at every excluded boundary.

Before the one attempted execution, set a session-generation flag that permanently makes the replay timeline `restorable: false` with `restoreBlockedReason: "webmcp-direct-action"`; append only a non-executable action frame with `action: null`; and set screenshot suppression for every later capture. These effects remain after not-found, ambiguous, rejection, timeout, cancellation, navigation, or origin failure. Never store the tool name, arguments, JSON argument string, discovered tool object, or callback as executable replay or scenario state.

Immediately before execution, call `document.modelContext.getTools()` without `fromOrigins`. Select exactly one entry whose `origin` equals the action and session origin, whose name equals the requested name, and whose `window === window` in the selected top-level document. Zero matches is `WEBMCP_TOOL_NOT_FOUND`; more than one, including duplicate same-origin iframe registrations, is `WEBMCP_TOOL_AMBIGUOUS`. Re-discovery and re-register races do not cause a retry. Pass the exact freshly discovered object to `executeTool(tool, argumentsJson, { signal })` once. Check the selected top-level origin before discovery and in `finally` after completion/rejection/cancellation; cross-origin drift quarantines the session with existing `NAVIGATION_ORIGIN_BLOCKED` behavior.

The public action result becomes a versioned discriminated union. Existing action kinds return `{ schemaVersion: 1, kind, url, title }`. WebMCP success returns exactly `{ schemaVersion: 1, kind: "webmcp", url, title, toolResult: string | null }`. `null` is preserved only when the page API returns `null` for navigation. A string remains an opaque string even when it looks like JSON; do not parse, merge, or structurally interpret it. Reject every other result type. Raw result text is limited to 8,192 UTF-8 bytes before public projection, then default redaction and all registered session-secret replacement apply. Echoed secrets must become the existing redaction marker.

WebMCP failures use the existing tool error envelope with `isError: true` and exact structured content `{ ok: false, error: { code, message }, artifacts: [], warnings: [] }`: no `data`, page-controlled `details`, or copied arguments/result. Freeze codes to `WEBMCP_UNAVAILABLE`, `WEBMCP_ARGUMENTS_INVALID`, `WEBMCP_ARGUMENTS_LIMIT`, `WEBMCP_TOOL_NOT_FOUND`, `WEBMCP_TOOL_AMBIGUOUS`, `WEBMCP_EXECUTION_REJECTED`, `WEBMCP_RESULT_INVALID`, and `WEBMCP_RESULT_LIMIT`; cancellation remains `REQUEST_CANCELLED` and origin drift remains `NAVIGATION_ORIGIN_BLOCKED`. Error messages are fixed bounded server text. No failure is retried.

Capture may discover but never execute tools. Add `webmcp` to the explicit capture surfaces. Summary adds exactly `webmcp: { state: RuntimeCapabilityState, callableTools: number, truncated: boolean }`. Full/include/delta detail adds:

```ts
type WebMcpCaptureDetail = {
  provenance: "webmcp-page-api";
  observedAt: string;
  total: number;
  truncated: boolean;
  tools: Array<{
    origin: string;
    name: string;
    title: string | null;
    description: string;
    inputSchemaJson: string | null;
    annotations: { readOnlyHint: boolean | null; untrustedContentHint: boolean | null };
    untrusted: true;
  }>;
};
```

Sort tools by `origin`, then `name`; keep at most 16. Bound origin to 2,048 characters, name to 100, title to 200, description to 500, and each canonical schema string to 8,192 UTF-8 bytes. The WebMCP detail budget is 32,768 serialized bytes. Prune deterministically by setting `inputSchemaJson` to `null` from the last tool backward, then blanking descriptions from the last tool backward, then removing tools from the end; preserve `total`, `truncated`, provenance, state, and summary counts. After that WebMCP-specific pruning, retain the existing capture-wide order: optional framework/accessibility detail, reduced Next detail, console/network/replay tails, then DOM detail. Never prune decisive state/provenance first. Metadata and schema text stay visibly `untrusted: true` and never become agent instructions.

Capability provenance adds only `webmcp-page-api`. It means a structurally callable page API was observed, not that Chrome supplied an unmodified native implementation. Fake/page-patched API tests must receive the same truthful label. `readOnlyHint` is captured as untrusted metadata only and never enables restore, retry, scenario use, screenshot capture, or weaker independent evidence.

### Public Schema and Source-Identity Cascade

This source-only change deliberately bumps nested public shapes together:

- `BrowserTarget` gains `schemaVersion: 1`; action results gain `schemaVersion: 1`; replay-seek results gain `schemaVersion: 1`. A successful Safari cutover replaces target mode `webdriver` with `safari-mcp`.
- `BrowserRuntimeCapabilities` moves 1 to 2 and adds `webmcp` plus `webmcp-page-api`; its transport still describes Playwright/CDP or Safari MCP, not the page API. A successful Safari cutover replaces transport/provenance values `safari-webdriver`, `safari-bidi`, and `performance-resource-timing` with truthful `safari-mcp` values.
- `DebugSessionSummary` moves 2 to 3 because it nests the target and runtime capabilities.
- `IssueCaptureResult` moves 4 to 5 and adds the exact WebMCP summary/detail and replay-restorability fields.
- `EnvironmentFingerprint` moves 3 to 4. `PublicReproScenario` and `VerificationResult` move 5 to 6 because they nest the fingerprint/capabilities, while their action arrays remain the old replayable-only union.
- Every affected Zod wire schema, tool output schema, MCP input schema, test fixture, README example, architecture/reliability/security statement, compatibility evidence label, and harness assertion moves atomically. Do not accept legacy shapes or add a compatibility parser.

Set `package.json` and the root lockfile package identity to `0.7.0-next.0`, set `webDebug.releaseStatus` to `source-next`, add/preserve `webDebug.releasedPackageVersion: "0.6.0"`, and preserve `webDebug.releasedPluginRuntimeVersion: "0.6.0"`. Give the repository plugin source an explicit `0.7.0-next.0` source identity for validation, but leave the installed Codex plugin and immutable npm/GitHub artifacts labeled `0.6.0` and do not update them. No release note, tag, publish, GitHub write, global install, Codex install, or marketplace action belongs to this plan.

## Plan of Work

### Milestone 0: Repaired-plan gate

This repair is the gate. Do not begin runtime implementation until `git diff --check` and `npm run harness:check` pass with the active registry showing `Browser feasibility`. If later live evidence contradicts a frozen calling convention, schema, or safety assumption, stop, update this plan, and obtain another read-only review before code proceeds.

### Milestone 1A: Real Chrome feasibility, no retained runtime code

Use a command-owned loopback fixture and a real compatible Chrome build with the documented origin trial or local-development flag actually active. Exercise both visible and headless modes. Record the browser build, activation, response headers proving origin isolation, `tools` Permissions Policy, `document.domain` behavior, selected target identity, and whether `document.modelContext`, `getTools`, and `executeTool` match the frozen JSON-string convention.

The matrix must cover real registration/execution; `tool.window === window`; exact origin and case-sensitive unique name; duplicate names in same-origin iframes; cross-origin iframe exclusion; origin isolation and permission denial; fake/page-patched APIs; unregister/re-register races; same-origin and cross-origin navigation; null-on-navigation; rejected promises; cancellation honored and ignored by page code; metadata/schema/result prompt injection; oversized metadata, arguments, and results; echoed secrets; and post-call origin checks after success, rejection, timeout, and cancellation. A `readOnlyHint: true` fixture must still be non-restorable, non-retryable, screenshot-suppressing, and independent-evidence-required.

The feasibility artifact must show the observed call shape and exact pass/fail row for both headless and visible runs. A fake property may prove structural behavior but never native provenance. Any mismatch blocks implementation until the plan is repaired; do not retain an adapter implementation to explore around a failed gate.

### Milestone 1B: Real Safari MCP feasibility, no retained runtime code

Use a reachable Safari 27 beta or compatible Safari Technology Preview with external-agent automation enabled. Spawn only an owned `safaridriver --mcp` child. At every start, initialize MCP, re-list tools, and strictly validate the exact required schemas for `create_tab`, `page_info`, `navigate_to_url`, `page_interactions`, `get_page_content`, `browser_console_messages`, `list_network_requests`, `screenshot`, `evaluate_javascript`, `set_viewport_size`, `wait_for_navigation`, and `close_tab`. The first passing feasibility artifact freezes the complete canonical schema objects and their digests; implementation validates exact property names, types, required arrays, additional-property policy, and handle fields on every start, not merely tool-name presence. Extra vendor tools may exist but remain unreachable. Never call `list_tabs`, `switch_tab`, `get_network_request`, `browser_dialogs`, or `set_emulated_media` from the product transport.

The feasibility client accepts at most a 12 MiB inbound JSON-RPC frame, 256 KiB serialized non-screenshot tool content/result, 8 MiB base64 screenshot text, and a 4 MiB decoded PNG with a valid PNG signature. Reject oversize before retention/write and expose no raw vendor result. Startup/initialize/list calls get 5 seconds each, normal tool calls get at most 30 seconds and the remaining outer operation deadline, cancellation is wired to every call, ignored cancellation gets a 1-second grace before the owned child is terminated, and shutdown gets 5 seconds before owned-process escalation. Every response is strictly validated before projection.

Create exactly one tab and retain its returned handle. Every allowed call must accept and use that owned handle; if a required schema or runtime operation depends on ambient active-tab state, enumeration, or switching, the gate fails. Never enumerate, read, navigate, change, or close a foreign tab. Use a separately controlled sentinel tab to prove pre-existing tabs stay unchanged and to test active-tab drift. Until concurrency isolation is proven, enforce one process-wide active Safari MCP session; a second start fails with `SAFARI_SESSION_CONFLICT` before spawning.

The matrix must cover exact-schema drift at a later start; malformed JSON-RPC; malformed/oversized/unexpected MCP content; unexpected tool result shapes; screenshot decode/signature/size failures; child exit; stderr flooding; partial initialize/start cleanup; request cancellation; non-cooperative shutdown; owned-tab close; pre-existing foreign tabs; ambient active-tab drift; observer freshness and cursor/action epochs; same-origin redirects; cross-origin navigation quarantine; explicit no-call proof for `get_network_request`; and the global concurrent-session prohibition. A compatible host that is unreachable, a schema without explicit owned-handle targeting, or any failed invariant records bounded evidence only and leaves Safari work blocked.

### Milestone 2: Implement one direct-only Chromium WebMCP slice

After Milestone 1A passes, first split direct and replayable action types/schemas. Then add one target-scoped internal WebMCP component behind `ChromiumAdapter`, the frozen capability/capture projection, session secret/screenshot/replay flags, stable result/error projection, and one deterministic fixture tool. No framework helper, cross-origin discovery, bulk tool support, new public MCP tool, or second fixture is in scope.

Tests must prove every exclusion boundary, one-attempt behavior, fixed error envelopes, opaque JSON-looking result strings, navigation null, echoed-secret redaction, rejection, cancellation, non-cooperative page code, post-call origin checks, metadata/result injection containment, capture non-execution, capture pruning order, fake API provenance, and exact wire versions.

### Milestone 3: Cut Safari forward only after full parity

After Milestone 1B passes, implement the bounded stdio client behind `SafariAdapter` and rerun the complete deterministic and live Safari contract against the required subset. Preserve loopback-only/same-origin policy, exact selected handle, one action at a time, strict response validation, observer freshness, artifact bounds, and owned cleanup.

If every row passes, remove `webdriverEndpoint` from startup/doctor/CLI/types/schemas, delete WebDriver HTTP/BiDi/Performance Resource Timing code and tests, remove their environment variables/provenance/transport enums, set minimum supported Safari to 27, and update the exact startup, doctor, README, architecture, compatibility, reliability, security, smoke, and harness contracts in the same change. `SafariAdapter` stays as the policy façade and `safari-mcp` becomes its only transport.

If implementation or parity fails, use `git diff` to identify and remove all candidate Safari MCP runtime/tests/docs while preserving unrelated and already-complete Chrome/skill work. Record only bounded feasibility evidence and the blocker. Do not close the milestone, claim Safari implementation, lower the gate, retain a feature flag, or leave two transports.

### Milestone 4: Add minimal product authoring guidance

Create `plugins/web-debug/skills/webmcp-tool-authoring/SKILL.md` and at most one focused reference. Use the repository's `skill-creator` guidance during implementation. The skill may edit production WebMCP code only when the capability is backed by an already-approved reviewed requirement or the user's explicit current-turn request for that capability. Current UI behavior, inferred convenience, a test gap, or candidate discovery is not authority.

When the UI is sufficient, create no tool. When only candidate sources exist, propose or create only a visibly candidate, non-gating skeleton if requested; do not edit production registration. When authority exists, reuse an existing business/domain function and author one atomic tool, bounded JSON Schema, runtime validation, lifecycle cleanup, cancellation/error behavior, and native contract test. Do not add a generator, script, second validator/runner, assets, generic templates, framework library, or production tool used only as a test hook.

### Milestone 5: Strengthen qualification without changing its enum

Keep execution classes exactly `ui-required`, `api-only`, `contract-only`, and `manual-only`. A WebMCP-only test is `contract-only`. A hybrid test is `ui-required`, requires `visible-ui`, and for every attempted mutation requires independent `api-readback`, `domain-state`, or the applicable `history`/`audit`/`outbox` evidence. Tool output is never that oracle. Output/domain disagreement and mutation timeout are failed or inconclusive according to authoritative state, never retried into PASS.

Target-owned Chrome native tests may call `document.modelContext` directly; they need not route through Web Debug. Safari without WebMCP uses the repository's native Safari runner for the user-visible journey. Safari MCP/Web Debug artifacts may diagnose failure but never award qualification PASS. Candidate discovery may propose a non-gating skeleton only. Product-code handoff to `webmcp-tool-authoring` requires the authority described in Milestone 4.

Acceptance is behavioral rather than wording-only. Run forward cases in disposable target repositories for: UI sufficient/no tool; candidate-only source; approved capability gap; lying `readOnlyHint`; tool-output/domain disagreement; mutation timeout; Safari without WebMCP; and native-runner verdict ownership. Inspect resulting code/artifacts and validator/native-runner outcomes. Static string-presence checks may supplement but cannot satisfy these cases.

### Milestone 6: Integrate exact contracts and prove source-next completion

Update only the paths named in Context and Orientation plus focused tests/fixtures required by the frozen contracts. Preserve the public tool count and exact names. Do not add a release path, portable MCP scenario, qualification DSL, cross-session runner, remote target, credentialed profile, or hosted behavior.

Pack from a clean command-owned temporary directory. An isolated tarball install/unpack used solely for the fresh-prefix handshake is the only permitted installation-like verification and must be deleted afterward; never touch the user's global packages or Codex plugins. Initialize stdio, assert `serverInfo.version === "0.7.0-next.0"`, assert concrete updated input/output schemas, and compare the sorted listed tool names for exact equality with:

```text
web_breakpoint_set
web_browser_action
web_debug_control
web_debug_evaluate
web_fix_verify
web_issue_capture
web_next_inspect
web_project_detect
web_replay_seek
web_repro_record
web_session_close
web_session_start
web_session_status
```

Count-only, subset, or unsorted comparisons do not pass. Also prove the immutable released npm/GitHub and installed plugin runtime remain labeled `0.6.0` without contacting or mutating them.

## Concrete Steps

Work in `/Users/marlonjd/Developer/monorepos/web-debug-mcp` on the current branch.

1. Before each milestone run `git status --short --branch`; preserve unrelated changes and never perform branch operations.
2. Finish this plan-repair gate with `git diff --check` and `npm run harness:check`; the observable signal is no diff error and `harness-check: PASS`.
3. Run Chrome and Safari feasibility from command-owned temporary fixtures/processes. Record exact versions, schemas, commands, pass/fail rows, and bounded non-sensitive output. Retain no runtime code from a failed gate.
4. Implement Chrome in the order: action-type split, secret/replay/screenshot state, adapter call, result/errors, capability/capture, then focused tests. Run the focused suite after each layer.
5. Implement Safari only after its gate. Run focused schema/transport/lifecycle tests, then the full current Safari contract. Cut over and delete WebDriver/BiDi only on a complete pass; otherwise remove candidate Safari changes.
6. Implement the two skill changes, then run all eight disposable-repository forward cases and the existing structural validator/plugin contract tests.
7. Apply the schema/version cascade and exact durable documentation updates; run package identity and tool-catalog tests before the full suite.
8. Run all acceptance commands, delete command-owned temporary prefixes/profiles/tabs/processes, verify no leftover automation process, and update Progress/Outcomes with literal `verified locally`, `blocked`, or `not run` labels.

## Validation and Acceptance

Deterministic repository gates:

```bash
npm test
npm run typecheck
npm run build
npm run harness:check
git diff --check
```

Expected signals are Vitest exit 0, TypeScript with no diagnostics, successful `dist/`, `harness-check: PASS`, and no whitespace errors.

Required focused/live gates after their feasibility milestones pass:

```bash
npm run smoke:live
npm run smoke:react-vite
npm run smoke:next
npm run smoke:webmcp
npm run smoke:safari-mcp
```

Run the existing `npm run smoke:safari` only as the pre-cutover WebDriver baseline. After a successful cutover, replace that contract with the Safari MCP smoke rather than maintaining both. Chrome acceptance requires the complete Milestone 1A matrix plus the direct-only exclusion/result/capture tests. Safari acceptance requires the complete Milestone 1B matrix, all existing supported Safari action/probe/DOM/console/network-summary/screenshot/evaluation/viewport/origin/cleanup behaviors, and deletion of WebDriver/BiDi.

Validate all three plugin skills with `quick_validate.py`, validate the plugin in an isolated Python environment if YAML is unavailable, run the focused plugin-skill contract suite, and complete the eight behavioral/adversarial forward cases. Wording-only tests do not pass skill acceptance.

Run the fresh-pack stdio handshake described in Milestone 6. It must prove source-next version, exact canonical sorted tool-set equality, 13 concrete updated output schemas, rejected legacy WebMCP-in-scenario/server-reset shapes, and the new direct action/capture/version shapes.

This plan completes only when the Chrome/skill/source-next bullets pass and the Safari gate ends in one of two truthful terminal outcomes:

- real Chrome passes the frozen feasibility matrix and one direct WebMCP call is single-attempt, bounded, redacted, opaque, non-restorable, non-screenshotable afterward, and independently verified when mutating;
- Chrome without callable WebMCP remains fully functional through Playwright/CDP and reports `unsupported` or `degraded` with truthful `webmcp-page-api` semantics;
- either real Safari 27 MCP passes every gate and WebDriver/BiDi is removed, or the gate fails and no Safari MCP runtime code is retained while WebDriver/BiDi remains the sole transport;
- the authoring/qualification skills pass all forward cases without self-approval, false PASS, tool-output oracle reuse, or a second runner/generator;
- source is `0.7.0-next.0`, released/installed artifacts remain `0.6.0`, the exact 13-tool/schema handshake passes, and every command-owned browser/MCP process and temporary artifact is cleaned up.

The caller-provided Safari 27 artifact selected the second terminal outcome: cutover rejected, no Safari MCP runtime retained, and WebDriver/BiDi preserved. Do not reinterpret that rejection as Safari MCP verification.

## Idempotence and Recovery

Feasibility probes use only command-owned loopback fixtures, browser profiles, child processes, and tabs. Track exact process IDs and tab handles. Close only owned resources and never broadly kill Safari, Chrome, WebDriver, MCP, or user browser processes. Re-running a probe uses a fresh namespace and fresh owned tab.

WebMCP direct calls are never automatically retried. On timeout, cancellation, rejection, null navigation, or ambiguous outcome, inspect independent state only when the user-authorized flow provides it; otherwise report inconclusive. The session remains screenshot-suppressed and replay-non-restorable after the attempt. Use a fresh session for another explicitly requested call.

On Chrome feasibility mismatch, retain no runtime implementation and repair/re-review the plan. On Safari feasibility failure, retain evidence only. On Safari implementation/parity failure, remove all candidate Safari MCP code/tests/docs before stopping and leave WebDriver/BiDi as the sole existing transport; do not claim the milestone. On successful Safari parity, delete WebDriver/BiDi and all obsolete endpoint/provenance/docs in the same change; do not retain rollback code or compatibility parsing.

No branch operation, release, npm publish, GitHub write, Codex/plugin install, marketplace update, production target, credentialed profile, remote browser, or external message belongs to this plan.

## Artifacts and Notes

- Chrome WebMCP overview: <https://developer.chrome.com/docs/ai/webmcp>
- Chrome imperative API and observed JSON-string execution convention: <https://developer.chrome.com/docs/ai/webmcp/imperative-api>
- Chrome tool security: <https://developer.chrome.com/docs/ai/webmcp/secure-tools>
- WebMCP draft: <https://webmachinelearning.github.io/webmcp/>
- Safari MCP announcement and catalog: <https://webkit.org/blog/18136/introducing-the-safari-mcp-server-for-web-developers/>
- Bounded Safari 27 gate summary: [`../evidence/safari-27-mcp-feasibility-2026-08-31.json`](../evidence/safari-27-mcp-feasibility-2026-08-31.json)
- Existing qualification boundary: [`../../design-docs/manual-parity-qualification.md`](../../design-docs/manual-parity-qualification.md)
- Existing scenario boundary: [`../../design-docs/scenario-persistence-boundary.md`](../../design-docs/scenario-persistence-boundary.md)

### Safari MCP feasibility/parity prompt for the other MacBook Pro

The following bounded, read-only prompt is prepared for a Codex task on a separate MacBook Pro. It must not be treated as evidence until the returned artifact is reviewed against this plan:

> Run a read-only Safari MCP feasibility and parity probe for `web-debug-mcp` on this MacBook Pro. Do not edit this repository, install/update plugins or marketplaces, publish, release, write GitHub, use production/remote/credentialed targets, or retain runtime code. Use only a command-owned loopback fixture, one owned `safaridriver --mcp` child, one owned tab, and a separately controlled sentinel tab. First report the exact Safari/Safari Technology Preview version, driver path, external-agent automation state, and whether `safaridriver --mcp` starts; if no compatible Safari 27 beta or Safari Technology Preview is installed/reachable, return `status: "blocked"` with the literal command/error and stop.
>
> If a compatible host is reachable, initialize MCP and re-list tools on every fresh start. Strictly validate the exact schemas (property names/types, required arrays, additional-property policy, and owned-handle fields) for only `create_tab`, `page_info`, `navigate_to_url`, `page_interactions`, `get_page_content`, `browser_console_messages`, `list_network_requests`, `screenshot`, `evaluate_javascript`, `set_viewport_size`, `wait_for_navigation`, and `close_tab`. Do not call `list_tabs`, `switch_tab`, `get_network_request`, `browser_dialogs`, or `set_emulated_media`. Freeze canonical schema JSON and SHA-256 digests only after the first complete pass; prove a later start detects exact-schema drift.
>
> Enforce inbound JSON-RPC ≤12 MiB, non-screenshot serialized content/results ≤256 KiB, screenshot base64 text ≤8 MiB, decoded PNG ≤4 MiB with a valid PNG signature, 5-second initialize/list/start and shutdown bounds, ≤30-second normal calls within the outer deadline, cancellation on every call, a 1-second grace before terminating an owned child when cancellation is ignored, and no raw vendor result retention. Create exactly one tab and pass its returned handle to every allowed call; prove ambient active-tab drift, a closed owned tab, foreign sentinel-tab immutability, and that no enumeration/switching/ambient state is required. Start a second session concurrently and prove it fails with `SAFARI_SESSION_CONFLICT` before spawning.
>
> Exercise the full safety/parity matrix with disposable loopback pages: malformed JSON-RPC/content/results, oversized results and screenshots, child exit/stderr flooding, partial startup cleanup, cancellation and non-cooperative shutdown, observer freshness/cursor/action epochs, same-origin redirects, cross-origin quarantine, and explicit no-call proof for `get_network_request`. Compare every supported WebDriver behavior required by this plan (actions, CSS probes/DOM, screenshot, evaluate, console/network summary, viewport, origin, cleanup) with native Safari runner evidence. Safari MCP/Web Debug artifacts are diagnostic only; the target repository's native runner owns any qualification verdict.
>
> Return one bounded JSON artifact containing `status`, exact browser/driver versions, activation, allowed tool schemas and digests, per-row `passed`/`failed`/`blocked` results with literal bounded errors, owned tab/child cleanup evidence, forbidden-tool call log (which must be empty), and a final `cutover: "pass"|"blocked"|"failed"` decision. A single failed invariant, missing owned-handle targeting, schema drift, unsafe bound, parity gap, or unreachable host is not a partial pass: return bounded evidence and `cutover: "blocked"` or `"failed"`. Do not propose or retain Safari MCP implementation code.

## Interfaces and Dependencies

Keep `@modelcontextprotocol/sdk`, `playwright-core`, and `zod` as the runtime dependency set. Use the existing MCP SDK for the Safari stdio client. Add no WebMCP runtime dependency; feature-detect the page API and define bounded internal types.

`SessionManager` remains the sole session/evidence policy façade. `ChromiumAdapter` remains the Playwright/CDP owner and may expose only the bounded `webmcp-page-api` component. `SafariAdapter` remains the Safari policy façade and has exactly one transport at a time. Neither adapter bypasses loopback/same-origin, deadline, redaction, artifact, or ownership policy.

The 13 public MCP tool names remain stable. Public direct action, target, runtime-capability, session, capture, replay-seek, fingerprint, scenario, and verification schemas change only through the explicit source-next cascade above. Qualification JSON remains non-executable and is never accepted by `web_repro_record`; its execution-class enum remains unchanged. The new plugin skill count is exactly three in repository source after the intentional contract update.

## Revision History

- (2026-08-31 11:45Z) Change: Created the active plan from the agreed WebMCP, Safari MCP, hybrid authoring, security, simplicity, and verification decisions. Reason: Establish a restartable implementation contract before independent review.
- (2026-08-31 12:30Z) Change: Repaired the plan after two independent NO-GO reviews and the merged `gpt-5.6-sol` repair packet. Reason: Make WebMCP direct-only and non-restorable, freeze result/capture/version contracts, add real-browser adversarial gates, authorize only a forward Safari 27 cutover, preserve qualification/native-runner authority, and prevent blocked Safari from being reported as implemented.
- (2026-08-31 14:10Z) Change: Completed the plan after reviewing the caller-provided Safari 27 MCP artifact and rejecting cutover. Reason: The Chrome/skill/source-next work passed locally, while Safari MCP failed the frozen safety/parity gate; keeping WebDriver/BiDi and retaining no Safari MCP runtime is the plan's truthful terminal outcome.
  Semantic-Review: reviewer=Web Debug maintainers; reviewed-at=2026-08-31 14:10Z; content-sha256=03b903af0d506cdbafe864eb03dd8a38be73107c7abd07c6e37a4089739b3057; evidence=Reviewed both independent plan audits, repaired direct-only contracts, Chrome live WebMCP, Safari gate rejection, eight behavioral cases, full deterministic/live gates, package handshake, and cleanup evidence.
