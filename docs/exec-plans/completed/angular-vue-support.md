<!-- harness-plan:v1
id: angular-vue-support
status: completed
created: 2026-08-29
updated: 2026-08-30
completed: 2026-08-30
owner: Platform Engineering
-->

# Add bounded Angular and Vue 3 runtime evidence

Implementation status: complete locally; release promotion remains a separate follow-up.

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). The immutable `0.4.0` source/tag/npm release is complete at commit `94328c05af5f2263a2f64edec1b3267e44aae915`; subsequent harness-attestation documentation commits do not reopen that release boundary. This plan names the unreleased feature line `0.5.0-next.0`, remains source-only, and must not rewrite `0.4.0`, move `v0.4.0`, publish a package, promote plugin metadata, or change the installed `0.4.0` plugin.

## Purpose / Big Picture

Extend the existing one-facade Web Debug workflow so an agent can detect Angular and Vue 3 projects and receive bounded development-runtime component evidence from an explicitly selected Chromium target. Generic DOM, console, network, screenshot, debugger, replay, and fix-verification behavior already works independently of framework; the new user-visible result is optional `browser.angular` or `browser.vue` evidence joined to that existing browser record.

The first complete increment is deliberately narrower than Angular DevTools or Vue DevTools. Angular support reports a DOM-hosted component tree plus safely sampled component state and state changes through Angular's documented development globals. Vue support reports applications, component trees, props/state, source file hints, update counts, and sampled changes through the Vue 3 development hook contract. It does not claim Angular injector/router trees, exact change-detection profiling, Vue Router/Pinia timelines, time travel, production-build introspection, or full DevTools parity.

Success is observable when:

- `web_project_detect` returns deterministic `angular` and `vue` framework/capability flags without starting a server;
- `web_issue_capture` keeps the 13-tool MCP catalog and returns evidence schema version 3 with nullable `angular` and `vue` fields;
- command-owned Chromium sessions against deterministic Angular CLI and Vue/Vite development fixtures expose bounded, redacted component evidence after a user interaction;
- Vue/Vite captures continue to include the existing Vite module/HMR provenance when `webDebugVitePlugin()` is installed, while Angular CLI makes no Vite-provenance claim;
- Safari keeps generic browser evidence and explicitly reports Angular/Vue runtime enrichment as unavailable;
- existing Chromium, React/Vite, Next, Safari, replay, lifecycle, artifact, and scenario contracts remain passing.

## Progress

- [x] (2026-08-29 20:47Z) Inspect the released `0.4.0` architecture, evidence/replay contracts, React/Vite seams, official Angular/Vue development tooling surfaces, and current registry versions.
- [x] (2026-08-29 20:55Z) Register this plan after the completed `0.4.0` release closeout and preserve the immutable release boundary.
- [x] (2026-08-29 21:49Z) Establish source-only `0.5.0-next.0`, evidence schema 3, Angular/Vue capabilities, canonical nullable snapshot/replay fields, and private detected-framework routing without changing the 13-tool MCP catalog or released `0.4.0` plugin runtime.
- [x] (2026-08-29 21:49Z) Complete the Vue 3.5.42/Vite 7.3.6 vertical slice: safely chained exact hook payloads, bounded component/props/state/update evidence, deterministic fixture, contract tests, Vite HMR provenance, and live smoke.
- [x] (2026-08-29 21:49Z) Complete the Angular 21.2.22 CLI vertical slice using documented development globals, a private-Ivy-free DOM-host tree, bounded own state/change evidence, deterministic fixture, contract tests, and live smoke.
- [x] (2026-08-29 21:49Z) Integrate selected target-scoped bridge identifiers, concurrent optional snapshots, paused/checks-only caches, replay fields, redaction, optional pruning, cancellation/pending ownership, and Safari generic limitations.
- [x] (2026-08-29 21:49Z) Update source-next documentation, compatibility evidence, native harness routes, and exact-version tests while leaving released plugin manifests/skill/runtime pinned to `0.4.0`.
- [x] (2026-08-29 21:49Z) Run focused tests, the full deterministic suite, type checks, build, native harness, both new live smokes, all existing live smokes, diff checks, package dry-run, and command-owned process cleanup.
- [x] (2026-08-29 21:49Z) Complete the source-only implementation; release/publication and unverified framework versions remain separate follow-up work.

## Surprises & Discoveries

- `ChromiumAdapter` already owns a target-scoped pre-navigation React bridge and optional-enrichment budget. Angular and Vue belong beside React in the browser adapter, not as new MCP tools or Next/Vite-style HTTP adapters.
- `SessionManager` owns Vite/Next enrichment because they call local development-server endpoints. Angular and Vue component evidence is page-runtime evidence and should arrive in `BrowserSnapshot` directly from Chromium.
- `ReplayFrame` currently retains only React framework state. Adding Angular/Vue requires explicit replay fields, secret scrubbing, scenario-frame omission, and evidence-pruning updates; changing only `BrowserSnapshot` would leak or exceed bounds.
- Angular's documented `getComponent`, `getOwningComponent`, and `getHostElement` globals support development inspection, but do not promise the full logical view/injector tree. The first contract must call its hierarchy `dom-host`, keep source locations nullable, and avoid private Ivy arrays.
- Angular's official profiling integration is development-only and requires enabling performance instrumentation. Automatically invoking it would mutate the inspected page and broaden scope, so exact change-detection cycles and flamegraphs are excluded.
- Vue DevTools v7 supports Vue 3, and the official Vite plugin is a user-facing DevTools integration rather than a stable machine-readable MCP endpoint. The runtime bridge must prove the Vue 3 hook contract against the exact fixture and must not depend on `vite-plugin-vue-devtools`.
- Registry observations show Angular `21.2.22` is the first fixture pin because it is supported LTS and accepts the repository's TypeScript `5.9.x`; Angular 22 requires TypeScript 6 and remains candidate-only. Vue `3.5.42`, `@vitejs/plugin-vue` `6.0.8`, and existing Vite `7.3.6` are the first Vue/Vite fixture pins until deterministic and live verification pass.
- Angular CLI's development server encapsulates its internal Vite instance and cannot load this repository's `webDebugVitePlugin()` endpoint. Angular detection therefore never implies `capabilities.vite`, Vite module-graph evidence, or HMR transform provenance.
- The `0.4.0` release is immutable and public. Angular/Vue work is labeled source-only `0.5.0-next.0`; local compatibility evidence must not be blended with package publication, plugin promotion, or fresh harness-certification authority.
- The 2026-08-30 planning check of `npm run harness:check` reports three pre-existing failures requiring stale-certification disclosure in README, the certification procedure, and technical debt. This feature may correct those literal disclosures if they still exist at completion, but must not refresh, reinterpret, or claim certification from Angular/Vue local evidence.
- Angular `@angular/build 21.2.22` requires Vitest `^4.0.8`; clean npm resolution rejected the previous Vitest `3.2.4`. The implementation upgraded the development runner to `4.1.11` instead of using `--legacy-peer-deps`, and focused tests/typecheck passed afterward.
- The installed Vue 3.5.42 runtime proves component events use `(app, uid, parentUid, component)`. The bridge consumes that exact upstream/internal payload and does not read private DOM component pointers or `component.parent` for hierarchy.
- Real Angular capture initially exposed own `__ngContext__` data. The bridge now omits `__ng*`/`ɵ*` keys and normalizes compiler-prefixed component names; the live smoke proves the private field is absent.
- The final full suite passed 117 tests across 28 test files. `npm run harness:check` passed 542 checks with the expected `certification: stale-candidate` status after source changes; this is not a fresh certification claim.
- Individual final live runs passed for vanilla, React/Vite, Next, Safari, local-fidelity, Vue/Vite, and Angular. The first parallel Next run returned exit code 1 after all assertions were true; a standalone rerun passed, so the parallel teardown race is not treated as a feature failure.
- The final cleanup scan found no command-owned Angular/Vue fixture, Vite, or browser processes. Pre-existing unrelated Xcode MCP processes were not touched.

## Decision Log

- Decision: Preserve one MCP facade and all 13 public tool names; extend `web_project_detect`, `web_session_start` summaries, `web_issue_capture`, and replay results through existing data contracts. Rationale: framework context is optional evidence, and new Angular/Vue tools would duplicate session, safety, and lifecycle policy. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Support Angular development builds and Vue 3 development builds in Chromium first; Safari remains generic browser evidence. Rationale: the existing safe pre-navigation bridge and CDP lifecycle are Chromium-owned, while Safari has no equivalent framework enrichment contract and is already intentionally capability-limited. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Add separate Angular and Vue types/adapters/bridge scripts rather than refactoring React into a speculative generic framework abstraction. Rationale: the runtimes expose materially different hierarchy, state, update, and source semantics; a common abstraction would either erase truth or destabilize working React behavior. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Use only documented Angular development globals and a DOM-host hierarchy; do not read private Ivy `LView`/`TView` structures. Rationale: a smaller truthful contract is maintainable across Angular versions and avoids coupling safety-critical serialization to private array layouts. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Use one verified Vue 3 DevTools hook strategy and block the Vue runtime milestone if its lifecycle cannot be chained without breaking an existing hook; do not add a second DOM-private fallback path. Rationale: dual private strategies create ambiguous evidence and compatibility layers. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Do not invoke Angular `enableProfiling`, mutate component state, call arbitrary getters/functions/signals, or install Vue DevTools UI packages. Rationale: capture is observational and optional; page mutation requires a separate explicit contract. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Bump `EvidenceBundle.schemaVersion` from 2 to 3 while leaving scenario/verification schema version 4 unchanged. Rationale: `BrowserSnapshot`, `ReplayFrame`, project capabilities, and evidence pruning gain public fields, while scenario semantics do not change. No legacy aliases or dual evidence shapes will be retained. Date/Owner: 2026-08-29 / Platform Engineering.
- Decision: Label this feature line source-only `0.5.0-next.0`; package/release metadata changes belong to implementation or a later release plan, not this planning revision. Keep plugin manifests, marketplaces, bundled `.mcp.json`, and installed workflow skill on released `0.4.0` until separately authorized promotion. Rationale: local feature evidence must not impersonate a release or advertise behavior the pinned plugin runtime lacks. Date/Owner: 2026-08-30 / Platform Engineering.
- Decision: Select bridge injection through private detected-framework metadata passed from `SessionManager` to `BrowserStartOptions`; do not inject all bridges into every page. Register each selected bridge as a separate target-scoped CDP script and remove every returned identifier during close, including partial-start failure cleanup. Rationale: selection minimizes page interference and makes lifecycle ownership explicit. Date/Owner: 2026-08-30 / Platform Engineering.
- Decision: Pin the first Angular fixture to Angular `21.2.22` with TypeScript `5.9.x`; Angular 22/TypeScript 6 remains candidate-only. Rationale: this proves an actively supported Angular line without forcing an unrelated TypeScript-major migration into the first increment. Date/Owner: 2026-08-30 / Platform Engineering.

## Outcomes & Retrospective

Completed locally. Source-only `0.5.0-next.0` now contains Angular 21.2.22 and Vue 3.5.42 runtime evidence, fixtures, focused tests, managed serve/live scripts, compatibility/docs/harness edits, and immutable `0.4.0` plugin separation. The evidence bundle is schema 3 while scenario/verification remains schema 4. Angular proves a two-component DOM-host tree, state change, and private-Ivy omission; Vue proves a safely chained two-component DevTools-hook tree, props/state/update evidence, source hints, and Vite HMR provenance. Final verification passed: 117 deterministic tests in 28 files; source/test typecheck; build; `npm run harness:check` with 542 checks and `certification: stale-candidate`; `npm pack --dry-run --json`; both new framework smokes; and individual vanilla, React/Vite, Next, Safari, and local-fidelity regression smokes. `git diff --check` passed and no command-owned fixture/browser processes remained. The immutable `0.4.0` package/tag/plugin was not published or modified. Remaining candidate-only surfaces are Angular 22/TypeScript 6, Vue 2, Nuxt, SSR/hydration, non-Vite bundlers, framework-native Safari, profiler/router/store parity, and source-line mappings not proven by a fixture. This plan does not claim production-ready or current certification status.

## Context and Orientation

The current released baseline is `web-debug-mcp@0.4.0`, commit/tag `94328c05af5f2263a2f64edec1b3267e44aae915`. `HEAD` contains later harness-attestation documentation commits; preserve them and do not treat them as a new product release. Work on the current branch only; do not create or switch branches as part of this plan.

Relevant ownership:

- `src/domain/types.ts` defines `Framework`, `ProjectCapabilities`, `AngularSnapshot`/`VueSnapshot` additions, `BrowserSnapshot`, `ReplayFrame`, and evidence schema version.
- `src/core/capabilities.ts` detects only known package/config markers. Add `angular.json`, direct `@angular/core`, and direct `vue` markers; do not infer Nuxt, Vue 2, or Angular from transitive packages.
- `src/adapters/browser.ts` carries private detected-framework metadata in `BrowserStartOptions`; `SessionManager.start` supplies the project descriptor and matrix candidates reuse the same metadata.
- `src/adapters/chromium.ts` owns target-scoped script registration, optional page-runtime snapshots, pause caches, and selected-target isolation. It injects only selected React/Angular/Vue bridges, retains every returned CDP script identifier, removes every identifier during normal close and failed start, and collects selected snapshots concurrently under one existing optional budget.
- `src/adapters/angular.ts` and `src/adapters/angular-bridge.ts` will read and expose the bounded Angular development snapshot.
- `src/adapters/vue.ts` and `src/adapters/vue-bridge.ts` will read and expose the bounded Vue 3 development snapshot.
- `src/adapters/safari.ts` must return `angular: null` and `vue: null`; `SessionManager.start` adds one bounded warning when an Angular/Vue project selects Safari.
- `src/core/session-manager.ts` combines evidence, records replay frames, omits framework state from private-input scenario frames, enforces evidence bounds, and prunes optional framework detail first.
- `src/core/evidence.ts`, `src/core/redaction.ts`, `src/core/mcp-response.ts`, and `src/core/doctor.ts` must preserve existing total budgets and canonical envelopes. Doctor reports project detection only; it does not launch a browser or claim runtime bridge readiness.
- `fixtures/`, `scripts/`, `test/`, `docs/`, and `scripts/harness-check.mjs` own deterministic proof and discoverability.

Public contract additions are exact and framework-specific:

```ts
type Framework = "vanilla" | "react" | "angular" | "vue" | "vite" | "next";

interface ProjectCapabilities {
  // existing fields remain
  angular: boolean;
  vue: boolean;
}

interface AngularComponentNode {
  name: string;
  host: { tag: string; id: string | null } | null;
  state: Record<string, unknown>;
  sampleCount: number;
  changedStateKeys: string[];
  children: AngularComponentNode[];
}

interface AngularSnapshot {
  detected: true;
  version: string | null;
  mode: "development";
  treeMode: "dom-host";
  snapshotCount: number;
  componentCount: number;
  components: AngularComponentNode[];
  truncated: boolean;
  warnings: string[];
}

interface VueComponentNode {
  name: string;
  source: { file: string } | null;
  props: Record<string, unknown>;
  state: Record<string, unknown>;
  updateCount: number;
  changedPropKeys: string[];
  changedStateKeys: string[];
  children: VueComponentNode[];
}

interface VueSnapshot {
  detected: true;
  version: string | null;
  appCount: number;
  componentCount: number;
  components: VueComponentNode[];
  truncated: boolean;
  warnings: string[];
}
```

`BrowserSnapshot` and `ReplayFrame` gain non-optional nullable `angular` and `vue` fields so every adapter/test fixture supplies one canonical shape. `EvidenceBundle.schemaVersion` becomes 3. Source location, update counts, and changed-key fields remain nullable/empty when the runtime cannot establish them; no field may silently substitute DOM text for runtime state.

Both bridge serializers use the existing sensitive-key pattern and enforce: 200 components total, depth 20, 30 state/prop keys per object, array length 20, serialization depth 3, strings 500 characters, changed-key lists 20, and at most 50 retained samples/update summaries. Data descriptors may be read; accessor properties, functions, DOM nodes, injectors, VNodes, framework internals, symbols, and cyclic values become bounded markers rather than being invoked or traversed.

## Plan of Work

### Milestone 0 — preserve the released baseline and freeze the source-only contract

Goal: implement from the immutable `0.4.0` baseline while keeping feature evidence, release evidence, plugin promotion, and certification authority separate.

Work: record `94328c05af5f2263a2f64edec1b3267e44aae915` as the released product baseline and current `HEAD` as its later harness-attestation documentation state. Use `0.5.0-next.0` only as the feature-line label in this plan and subsequent source implementation. Do not modify package, lockfile, tags, npm/GitHub releases, plugin manifests, marketplaces, bundled `.mcp.json`, installed plugin state, or certification artifacts merely to make the plan look released. If implementation later changes source identity, update package/lock/release-identity tests together as an implementation milestone and keep released runtime `0.4.0`; no publication is authorized here.

Result/proof: the active plan is registered, `v0.4.0` remains untouched, current harness-attestation commits are preserved, and all implementation/reporting language distinguishes source-only `0.5.0-next.0`, `verified locally`, `candidate-only`, `release pending`, and stale or unchanged certification authority.

### Milestone 1 — versioned contract and static detection

Goal: make Angular/Vue support discoverable before a browser starts.

Work: add the exact types above; add capability booleans; detect Angular from direct `@angular/core` or `angular.json`, and Vue 3 candidates from direct `vue`. Keep deterministic framework ordering: `next`, `angular`, `vite`, `react`, `vue`, then `vanilla` only when no framework exists. Angular alone must not set `vite`; only an actual Vite dependency/config marker may do so. Add warnings that framework runtime enrichment requires a Chromium development build; preserve Vite's separate plugin warning. Update fake snapshots and compile-time exhaustiveness in every existing test adapter.

Result/proof: capability tests cover Angular CLI, Vue/Vite, mixed markers, malformed package JSON, and generic fallback; `web_project_detect` returns the new fields through the unchanged MCP envelope.

### Milestone 2 — Vue 3/Vite vertical slice

Goal: produce one end-to-end Vue runtime snapshot while reusing working Vite provenance.

Work: first run an exact-fixture spike against Vue `3.5.42` and inspect its installed runtime source/types to freeze the upstream/internal DevTools hook operations and events actually emitted. Then add `VueAdapter.snapshot(page)` and a selected, target-scoped bridge installed before navigation. Chain an existing hook without replacing its methods, listener registry, enabled state, or extension behavior; keep raw app/component references page-local and expose only `window.__WEB_DEBUG_VUE__.snapshot()` plus bounded disposal. If safe chaining and cleanup cannot be proved against an existing-hook test double and the real fixture, mark the milestone blocked. Do not read DOM-private `__vue*` properties, component proxies, or add a second fallback strategy.

Create `fixtures/vue-vite/` with Vue `3.5.42`, `@vitejs/plugin-vue` `6.0.8`, Vite `7.3.6`, `webDebugVitePlugin()`, an SFC with props and reactive state, and stable test ids. Add `scripts/serve-vue-vite.mjs` and `scripts/live-vue-vite-smoke.mjs`, package scripts `serve:vue-vite` and `smoke:vue-vite`, and use managed-process helpers on loopback port `4176`. The smoke proves one state-changing action, runtime capture, Vite module graph, and an HMR transform diff that restores fixture source in `finally`. Add a Vue SFC debugger/source-line assertion only after the fixture spike identifies a stable emitted source URL and line; otherwise prove the source hint and existing generic debugger separately and leave SFC breakpoint mapping candidate-only.

Result/proof: Vue fixture tests prove no app-specific Web Debug import, bridge bounds, hook chaining, redaction, update counts, source hint, component tree, Vite evidence, and cleanup; live JSON reports `passed: true`.

### Milestone 3 — Angular CLI vertical slice

Goal: produce truthful Angular component/state evidence without private Ivy traversal or profiler mutation.

Work: add `AngularAdapter.snapshot(page)` and a pre-navigation bridge whose snapshot discovers DOM elements, calls documented `window.ng.getComponent`/`getOwningComponent`/`getHostElement`, deduplicates component instances, and constructs parentage from host-element ancestry. Read only own data descriptors, compare bounded serialized samples in weak maps, and expose explicit `treeMode: "dom-host"`. Return `null` when Angular is absent and a bounded development-build warning when project detection expected Angular but `window.ng` is unavailable.

Create `fixtures/angular/` with Angular core/compiler/common/platform-browser/compiler-cli/CLI/build `21.2.22`, the existing TypeScript `5.9.x`, and exact compatible RxJS/tslib/zone.js packages only when required by the generated development contract. Use a minimal standalone development app with plain class fields, nested components, stable test ids, and one interaction. Add `scripts/serve-angular.mjs` and `scripts/live-angular-smoke.mjs`, package scripts `serve:angular` and `smoke:angular`, and use managed-process helpers on loopback port `4177`. Run `ng serve` in development mode and prove component tree/state/change assertions, generic browser evidence, and the explicit absence of Web Debug Vite endpoint/module/HMR claims. Add an Angular TypeScript debugger/source-line assertion only when the fixture proves a stable emitted source URL and line; otherwise record source-map debugging as candidate-only rather than failing Angular runtime support.

Result/proof: Angular fixture/adapter/capability tests and live JSON establish exact version, dev-mode detection, nested host tree, redacted state, changed keys, generic browser evidence, and process cleanup; source/breakpoint mapping is asserted only if the fixture proves it.

### Milestone 4 — shared browser/session safety and bounded evidence

Goal: make the two new optional enrichments obey every existing lifecycle and privacy invariant.

Work: pass private `frameworks` metadata through canonical start options and every fresh matrix/retry candidate. Register only selected React/Angular/Vue bridge scripts independently on the selected CDP target, store every returned identifier, and remove every identifier during normal close, partial-start failure, cancellation cleanup, and attached-target detach. Never inject secondary pages. Snapshot all selected adapters concurrently under one existing Chromium optional-enrichment deadline so framework count does not multiply latency. Track each promise in the operation's pending set; caller cancellation must abort the shared deadline, bounded cleanup must settle or poison the session before lease release, and a slow optional framework must remain warning-only. While JavaScript is paused, use last-known snapshots with explicit stale warnings; checks-only attempts return React/Angular/Vue/Next/Vite enrichment as null.

Update every relevant `SessionManager` path: canonical start options and matrix candidates; `captureInternal`; full-capture representatives; `recordReplayFrame`; private-input scenario-frame omission; secret replacement; `boundEvidence`; `pruneEvidence`; final result overflow; observer reset; close/tombstone cleanup; Safari null fields; and all scripted adapters in `test/`. Optional pruning removes Angular/Vue detail alongside React/Vite before decisive DOM/check data. Static framework detection with missing runtime data produces a warning, not a failed browser session or verification verdict. Auth/private-input screenshot suppression remains unchanged.

Result/proof: tests cover sensitive values nested in Angular/Vue state, cyclic/accessor/function values, component/depth/key caps, paused/stale evidence, timeout/cancellation, attached-target sibling isolation, replay omission/scrubbing, evidence size pruning, Safari boundaries, and close/reset behavior.

### Milestone 5 — product, compatibility, harness, and source-next handoff

Goal: make claims match exact local proof without publishing unreleased behavior.

Work: update `ARCHITECTURE.md`, `README.md`, `docs/SECURITY.md`, `docs/RELIABILITY.md`, `docs/COMPATIBILITY.md`, `docs/compatibility-evidence.json`, `docs/agent-harness/output-contract.md`, `docs/agent-harness/environment-contract.md`, `docs/agent-harness/registry.md`, `docs/agent-harness/verification-matrix.md`, `docs/agent-harness/coverage-matrix.md`, `docs/product-specs/web-debug-contract.md`, `docs/exec-plans/tech-debt-tracker.md`, package keywords/scripts/dev dependencies, and `scripts/harness-check.mjs`. Document evidence schema 3 and scenario schema 4 separately. Add Angular/Vue required files and exact `serve:vue-vite`, `smoke:vue-vite`, `serve:angular`, and `smoke:angular` commands to the native harness.

Do not update the released plugin manifests, marketplaces, bundled `.mcp.json`, or installed workflow skill to advertise Angular/Vue while they pin `0.4.0`. Record exact local compatibility evidence as `verified locally` only after each live smoke; label source-only work `release pending`. Do not refresh or claim current HMAC/formal certification solely from these local checks; any stale or unchanged certification remains explicitly separate. Plugin promotion, public npm/GitHub release, other Angular/Vue versions, Vue 2, Nuxt, Angular SSR/hydration, Safari runtime evidence, Angular profiler/injector/router, and Vue Router/Pinia timelines require later plans.

If the three baseline stale-certification disclosure failures remain, update only their owning README/certification/technical-debt statements so the native harness truthfully reports the existing certification window as stale. That documentation repair is not a certification refresh and is not Angular/Vue compatibility evidence.

Result/proof: compatibility evidence names exact Node/browser/framework versions and only locally passed checks; source-next docs distinguish local `0.5.0-next.0` from released plugin runtime `0.4.0`; native harness passes because stale certification is disclosed truthfully, not because local framework smokes were promoted into certification authority.

### Estimate

Assuming one engineer and the pinned development runtimes: contract/detection 1 day; Vue vertical slice 2 days; Angular vertical slice 2–3 days; safety/replay/bounds 1–2 days; docs/harness/full verification 1–2 days. Total: 7–10 focused person-days. Add 2–4 days only if the pinned Vue hook contract or Angular CLI fixture requires upstream-version investigation. Full DevTools profiler/router/store/SSR/Safari parity is outside this estimate.

## Concrete Steps

Work in `/Users/marlonjd/Developer/monorepos/web-debug-mcp` on the existing branch. Before each milestone, inspect `git status --short --branch` and preserve unrelated changes.

1. Confirm the immutable released baseline and current attestation-only `HEAD` before implementation:

   ```bash
   git status --short --branch
   git log -3 --oneline --decorate
   npm view web-debug-mcp@0.4.0 version dist.shasum --json
   ```

   Expected: immutable `v0.4.0`/npm evidence remains unchanged, current later commits are documentation/attestation only, and this registered plan labels the feature line source-only `0.5.0-next.0`. Do not change package or release metadata during planning.

2. During implementation, install the exact development fixture dependencies, update any source-next package identity and its release-identity tests atomically if required by the implementation owner, then run focused contract/detection checks:

   ```bash
   npm install --no-audit --no-fund
   npx vitest run test/capabilities.test.ts test/mcp-routing.test.ts test/mcp-response.test.ts test/release-identity.test.ts
   npm run typecheck
   ```

3. After the Vue slice:

   ```bash
   npx vitest run test/vue-adapter.test.ts test/vue-fixture-contract.test.ts test/vite-adapter.test.ts test/chromium-policy.test.ts test/session-manager.test.ts
   npm run smoke:vue-vite
   ```

   Expected smoke assertions: Vue detected, exact version, nested component, props/state, changed keys/update count, source hint, Vite module/HMR evidence, clean console, and awaited teardown. Require a breakpoint source/line only if the fixture spike proves a stable mapping.

4. After the Angular slice:

   ```bash
   npx vitest run test/angular-adapter.test.ts test/angular-fixture-contract.test.ts test/capabilities.test.ts test/chromium-policy.test.ts test/session-manager.test.ts
   npm run smoke:angular
   ```

   Expected smoke assertions: Angular development runtime detected, exact version, DOM-host component hierarchy, sampled state/change keys, clean generic browser evidence, no Web Debug Vite endpoint/module/HMR claim, and awaited teardown. Require a TypeScript breakpoint source/line only if the fixture proves a stable mapping.

5. Run cross-cutting and complete local gates:

   ```bash
   npm test
   npm run typecheck
   npm run build
   npm run harness:check
   npm run smoke:live
   npm run smoke:react-vite
   npm run smoke:next
   npm run smoke:vue-vite
   npm run smoke:angular
   npm run smoke:safari
   npm run smoke:local-fidelity
   git diff --check
   ```

6. Inspect command-owned cleanup without touching the user's ordinary browser profile:

   ```bash
   ps -ax -o pid=,command= | rg 'fixtures/(angular|vue-vite)|serve-(angular|vue-vite)|playwright|headless' || true
   git status --short --branch
   ```

   Any leftover command-owned process must be traced to its smoke script and stopped through the stored child handle/process group. Do not kill unregistered Chrome, Safari, MCP, or user processes broadly.

## Validation and Acceptance

- Static detection: Angular CLI and Vue/Vite fixture descriptors contain exact framework ordering and `capabilities.angular`/`capabilities.vue`; vanilla/React/Vite/Next behavior does not drift.
- MCP surface: tool count/names/effects/output envelope remain unchanged at 13; no Angular/Vue-specific public tool is added.
- Evidence contract: every `EvidenceBundle` returns `schemaVersion: 3`; scenario/verification remain schema 4; Chromium/Safari/scripted snapshots always contain nullable `angular` and `vue` fields.
- Angular evidence: a real development fixture proves exact runtime detection, at least two nested host components, bounded own-state serialization, one changed state key after interaction, truthful `treeMode: dom-host`, and no private Ivy/profiler claim.
- Vue evidence: a real Vue 3 fixture proves one app, nested components, props/state, a changed key/update count after interaction, source hint where exposed, safe existing-hook chaining, and Vite provenance when the Web Debug Vite plugin is present.
- Safety: sensitive keys/values are redacted; getters/functions/signals are not invoked; cycles/DOM/framework internals are bounded markers; output and component caps produce `truncated` plus warnings.
- Lifecycle: bridge registration is selected-target-only; secondary pages remain uninjected; checks-only captures omit all framework state; pause returns explicit last-known/stale data; reset/close clears cached framework state and removes future-document scripts.
- Replay and pruning: private fill/select values cannot appear in Angular/Vue evidence or replay; scenario attempt frames omit optional framework state; 96 KiB evidence and 256 KiB result bounds preserve decisive fields.
- Browser boundary: Safari returns generic evidence with `angular: null`/`vue: null` and a stable Chromium-only warning; no Safari framework parity is claimed.
- Compatibility: exact Angular/Vue/package/browser versions move to `verified locally` only after contract tests and the corresponding live smoke pass; all other versions remain candidate-only.
- Regression: all existing deterministic tests and Chromium/React-Vite/Next/Safari/local-fidelity smokes continue to pass.
- Release truthfulness: the feature is labeled source-only `0.5.0-next.0`; released package/plugin/runtime remains `0.4.0` until a later authorized promotion, no npm/GitHub/plugin publication occurs, `v0.4.0` remains untouched, and local compatibility evidence makes no fresh certification claim.

## Idempotence and Recovery

Fixture dependency installation, builds, deterministic tests, doctor checks, and live smokes are safe to rerun. Each new smoke owns one loopback server and isolated headless browser, restores any HMR-mutated source in `finally`, awaits SIGTERM, escalates only its own process group, and reports an early child exit as failure.

Before editing a file already changed by the completed 0.4.0 closeout, inspect the exact diff and preserve its content. Never reset, checkout, or rewrite user-owned changes. If source-next identity tests fail, correct package/test/harness ownership together; do not point the released plugin at an unpublished runtime. If Vue hook chaining cannot be proven, leave `capabilities.vue` static detection and generic browser evidence available but do not mark the Vue runtime milestone complete or ship a second private fallback. If Angular documented globals are absent, return nullable framework evidence with a development-build warning; do not inspect private Ivy storage.

If a bridge optional-enrichment operation times out or is cancelled, browser evidence remains usable and the owned promise stays attached to the operation lease until bounded cleanup. If a new adapter makes the selected target unsafe or continues after cancellation, mark the session unusable and close the owned adapter under the existing cleanup contract.

Do not publish, tag, update the installed plugin, run remote CDP, modify production targets, or broaden credentials/target authority under this plan. A later release plan must promote the proven source-next contract forward; rollback is a forward source change, never moving immutable `0.4.0` identities.

## Artifacts and Notes

- Released baseline: commit/tag `94328c05af5f2263a2f64edec1b3267e44aae915`, npm `web-debug-mcp@0.4.0`, archive shasum `c7daee55f175d113503d4e662ea8bc418da149ea`; current `HEAD` adds harness-attestation documentation without changing that product identity.
- Existing framework seam: `src/adapters/react.ts`, `src/adapters/react-bridge.ts`, `src/adapters/chromium.ts`, `src/adapters/vite.ts`, and `src/adapters/vite-plugin.ts`.
- Official Angular evidence: [DevTools development-build boundary](https://angular.dev/tools/devtools), [`getOwningComponent`](https://angular.dev/api/core/globals/getOwningComponent), [`getHostElement`](https://angular.dev/api/core/globals/getHostElement), and [development-only profiling](https://angular.dev/api/core/enableProfiling).
- Official Vue evidence: [Vue DevTools Vue 3 boundary](https://devtools.vuejs.org/getting-started/installation) and [Vite plugin role](https://devtools.vuejs.org/guide/vite-plugin).
- No new persistent evidence artifact is required. Record concise exact-version smoke results in `docs/compatibility-evidence.json` and the completed plan; do not check in screenshots, build outputs, `.angular/`, Vite caches, or temporary logs.

## Interfaces and Dependencies

Runtime dependencies remain exactly `@modelcontextprotocol/sdk`, `playwright-core`, and `zod`; Angular/Vue packages are development-only fixture/toolchain dependencies. Pin exact root and fixture versions so `test/compatibility.test.ts` can prove alignment. Candidate pins are:

- Angular: `@angular/core`, `@angular/common`, `@angular/compiler`, `@angular/platform-browser`, `@angular/compiler-cli`, `@angular/cli`, and `@angular/build` `21.2.22`; retain TypeScript `5.9.x`; pin exact compatible RxJS/tslib/zone.js versions from the resolved Angular 21 fixture. Angular 22 and TypeScript 6 remain candidate-only.
- Vue: `vue` `3.5.42`, `@vitejs/plugin-vue` `6.0.8`, and existing Vite `7.3.6`.

Do not add `vite-plugin-vue-devtools`, Angular DevTools packages, a framework-neutral bridge framework, a server daemon, or new MCP tools. `AngularAdapter` and `VueAdapter` mirror the narrow `ReactAdapter.snapshot(Page)` boundary. Their injected globals are page-internal implementation details and never public MCP inputs. `SessionManager` remains the authority for warnings, replay, secrets, deadlines, pruning, and close behavior; adapters cannot bypass it.

## Revision History

- (2026-08-29 20:47Z) Change: Created the detailed Angular/Vue source-next implementation plan from the immutable `0.4.0` baseline and current official development-runtime contracts. Reason: Make the requested two-framework implementation restartable, reviewable, and truthful about browser, DevTools, release, and compatibility boundaries before source changes begin.
- (2026-08-29 20:55Z) Change: Merged the independent `sol max` and `sol ultra` reviews plus the consolidated audit. Reason: Close the already-resolved `0.4.0` boundary; pin Angular 21.2.22/TypeScript 5.9; treat Vue hook chaining as an exact-fixture internal-contract gate; select bridge injection through private framework metadata; cover all cancellation/replay/redaction/pruning paths; correct smoke names/ports and conditional debugger claims; and separate local compatibility evidence from release, plugin, and certification authority.
- (2026-08-29 21:49Z) Change: Recorded the interrupted implementation checkpoint. Reason: The requested stop occurred after both new live smokes and focused gates passed but before the post-compatibility full suite, existing regression smokes, and final native harness could be rerun; preserve exact verified and not-run boundaries for safe continuation.
- (2026-08-29 21:49Z) Change: Completed the source-only Angular/Vue implementation and final validation. Reason: 117 deterministic tests, source/test typecheck, build, 542-check native harness, package dry-run, both new framework smokes, all existing individual live regression smokes, and cleanup checks passed; immutable `0.4.0` release/plugin identities and certification authority remained separate.
  Semantic-Review: reviewer=Platform Engineering; reviewed-at=2026-08-30 20:29Z; content-sha256=a0fa85f4ca6ef4293b4f29d8f66ee2bbe26f48fb7c3c151784e498a2a1968aac; evidence=Reviewed the completed Angular/Vue plan against commit 07cf126, exact fixture/runtime versions, 117-test and seven-live-smoke evidence, immutable 0.4.0 release boundaries, and remaining candidate-only framework and certification scope.
