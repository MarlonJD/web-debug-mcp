# web-debug-mcp

An evidence-first, local MCP debugger for web applications.

`web-debug-mcp` gives Codex and other MCP clients one bounded workflow for reproducing a web issue, inspecting browser and framework runtime state, collecting redacted evidence, and verifying the same flow after a fix. It covers the browser, frontend runtime, dev server, and replay timeline through one small MCP surface.

Release `0.7.0` keeps the 13-tool catalog while adding a direct-only Chrome WebMCP action, untrusted discover-only capture metadata, final wire versions, and reviewed WebMCP authoring/qualification guidance.

Current `main` is source-next `0.8.0-next.0`. Its MCP startup-recovery and fail-closed binding changes are release pending; the install commands and bundled plugin intentionally remain pinned to immutable public runtime `0.7.0` until a separate release is verified and published.

## Install as an MCP server

The core package is a standalone MCP server. The repository also includes an optional Web Debug plugin for Codex and ChatGPT: the MCP server provides callable debugging tools, while the bundled skill provides workflow guidance. Claude Code and other MCP clients can continue using the standalone server.

The published npm package runs locally over stdio and does not require a hosted service.

### Codex CLI, desktop app, and IDE extension

From a terminal:

```bash
codex mcp add web-debug-mcp -- npx -y web-debug-mcp@0.7.0
codex mcp list
```

The Codex desktop app and IDE extension share the same MCP configuration. You can also open Settings → MCP servers → Add server, choose **STDIO**, use `npx` as the command, and add these arguments:

```text
-y web-debug-mcp@0.7.0
```

For a project-scoped Codex configuration, add this to `~/.codex/config.toml` or a trusted project `.codex/config.toml`:

```toml
[mcp_servers.web_debug_mcp]
command = "npx"
args = ["-y", "web-debug-mcp@0.7.0"]
startup_timeout_sec = 20
tool_timeout_sec = 150
# Optional strict host policy: fail startup if this server cannot initialize.
required = true
```

Verify the connection with `codex mcp list`. In the Codex TUI, `/mcp` shows the active server.

### MCP startup and binding recovery

An explicit Web Debug request is fail-closed: the bundled `web_project_detect` call is Gate 0. A doctor pass, a process visible in a terminal, or a loaded skill does not prove that the current Codex task has the Web Debug tool namespace. If Gate 0 is unavailable, report `MCP_CLIENT_BINDING_UNAVAILABLE` (or `MCP_SERVER_STARTUP_UNAVAILABLE` when the server reports a startup failure) and stop; do not substitute Playwright, Puppeteer, raw CDP, a direct MCP SDK client, a naked `npx web-debug-mcp` process, or `web-debug-mcp cleanup`.

The plugin-bundled `.mcp.json` intentionally contains only the supported launch command and timeouts. Codex currently documents `required = true` for a direct `[mcp_servers.<name>]` entry in `config.toml`, not for a plugin manifest field. To apply the strict policy, configure the direct server entry above and disable the duplicate plugin-provided server in the user plugin policy:

```toml
[plugins."web-debug@web-debug".mcp_servers.web-debug-mcp]
enabled = false
```

If the server is missing from the current task after a repair, use Codex Settings → MCP servers → Restart (or restart the IDE extension), then retry Gate 0. A new task/session is the supported recovery when the current task does not refresh its tool binding. Codex CLI `0.152.0` or newer is the supported host baseline; `0.151.0` adds optional-MCP discovery grace, while older hosts are candidate-only for this recovery contract. See the [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp) and [Codex changelog](https://learn.chatgpt.com/docs/changelog).

## Use Web Debug as a plugin

This is the recommended single-install path for Codex and Claude Code. **Installing Web Debug installs both workflow skills and the web-debug-mcp MCP server connection. It is not a skill-only package, and no separate MCP setup is required.**

The same plugin package supports both Codex and Claude Code. Codex reads the Codex plugin manifest, Claude Code reads the Claude Code plugin manifest, and both use the same workflow skills and MCP configuration.

The plugin contains five pieces:

- the web-debug plugin manifest;
- the web-debug-workflow skill, which owns isolated browser-bug reproduction and fix verification;
- the manual-parity-qualification skill, which maps reviewed manual/product requirements to repository-native qualification tests and non-executable crosswalk/run metadata;
- the webmcp-tool-authoring skill, which provides authority-gated, direct-only WebMCP product guidance;
- a bundled .mcp.json connection that starts the existing web-debug-mcp server.

The runtime flow is:

~~~text
install Web Debug plugin
        ↓
Codex loads all three skills and the bundled MCP connection
        ↓
bug diagnosis → Codex starts web-debug-mcp over local stdio on demand
        ↓
web_project_detect → reproduce → web_issue_capture → fix verification

manual parity → reviewed baseline → native Playwright/API tests
        ↓
crosswalk/run validation → Web Debug only if browser diagnosis is needed
~~~

The stdio binary also exposes two package-only commands. `web-debug-mcp doctor` checks the exact project, explicit browser configuration, protocol-shaped CDP/WebDriver endpoints, optional loopback URL, Safari BiDi WebSocket availability, and detected Vite/Next readiness without launching an arbitrary browser. An executable-path result validates configuration only and remains a warning until a real session launches. `web-debug-mcp cleanup [--all-idle]` emits a bounded JSON report and signals only idle, owner-only registry records whose process identity is revalidated; it never scans or signals unregistered browser/debug processes.

### Install from the Codex CLI

Add this repository’s marketplace, then install the web-debug plugin:

~~~bash
codex plugin marketplace add MarlonJD/web-debug-mcp --ref main
codex plugin list --available --marketplace web-debug
codex plugin add web-debug@web-debug
~~~

### Install from the Codex desktop app

Run the marketplace command above once, open the Plugins Directory, refresh it if necessary, and install or enable Web Debug. Then start a new thread so the plugin’s skill and MCP tools are loaded.

### Use the installed plugin

1. Start your local web application.
2. Ask Codex either to reproduce a browser issue or to build reviewed manual-parity qualification, for example: “Reproduce this local React bug and capture browser evidence” or “Turn these approved manual cases into a qualification crosswalk and native Playwright coverage.”
3. The plugin routes isolated bugs through project detection, an explicit local browser session, bounded actions, evidence capture, and recorded-flow fix verification. It routes qualification through reviewed requirements, repository-native tests, structural crosswalk/run validation, and diagnostic-only Web Debug escalation.
4. For live Chromium launch, provide an explicit executable path, for example:

   ~~~bash
   WEB_DEBUG_CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" codex
   ~~~

5. Close the session with web_session_close when debugging is complete.

The plugin runs the same local server as the standalone MCP install. It does not host a browser, upload evidence, or create a second tool catalog. The first MCP start uses npx to resolve the immutable `web-debug-mcp@0.7.0` npm release; Node.js 20+, npm, and network access are required.

### Boundary with Build Web Apps and native runners

Web Debug complements rather than replaces frontend build and test tooling:

- Build Web Apps owns frontend authoring, dev-server work, generic rendered QA, and visual implementation.
- Vitest, Go, and a project’s own Playwright commands own deterministic runner evidence.
- Web Debug owns local browser-grounded evidence: live DOM/console/network state, CDP and framework diagnostics, semantic probes, replay, and bounded fix verification.
- Manual Parity Qualification owns source/reviewer state, requirement-to-test crosswalks, mutation certainty, and truthful aggregate reporting around those native runners.

When a request explicitly names Web Debug, use the Web Debug workflow. For mixed work, establish an exact runner failure first, collect only the missing browser evidence with Web Debug, and rerun the relevant checks separately.

When approved manual cases do not exist, Manual Parity Qualification can derive source-linked candidate cases from product requirements, role matrices, state models, API contracts, existing tests, and exploration. Generated candidates never self-approve or become gating coverage. JSON is non-executable metadata only; selectors, browser actions, API calls, and assertions remain typed native test code. The bundled read-only validator checks reference closure, crosswalk completeness, evidence facets, mutation certainty, and aggregate arithmetic without authenticating reviewers or running tests.

Do not install both the plugin and a separate Codex or Claude Code MCP registration for web-debug-mcp unless you intentionally want duplicate MCP registrations. For other MCP clients, use the standalone MCP installation below.

### Install in Claude Code

Add the repository marketplace from a Claude Code session, then install the plugin:

~~~text
/plugin marketplace add MarlonJD/web-debug-mcp
/plugin install web-debug@web-debug
/reload-plugins
~~~

Choose the desired installation scope when Claude Code opens the plugin details. If the install summary says the plugin is already active, no reload is needed. The plugin’s MCP server starts automatically when the plugin is enabled, and its tools appear in /mcp. The bundled workflows can also be invoked directly as /web-debug:web-debug-workflow and /web-debug:manual-parity-qualification.

For local development or testing before publishing the repository, load the plugin directly:

~~~bash
claude --plugin-dir ./plugins/web-debug
~~~

This command loads the repository's plugin metadata, all three skills, and bundled `web-debug-mcp@0.7.0` runtime.

### Use the standalone MCP server in Claude Code

Install it for all projects on the machine:

```bash
claude mcp add --transport stdio --scope user web-debug-mcp -- npx -y web-debug-mcp@0.7.0
claude mcp list
```

For the current project only, use `--scope project` instead of `--scope user`; Claude Code writes the shared configuration to `.mcp.json` and asks for project approval. Use `/mcp` inside Claude Code to inspect the connected server and its tools.

To follow the latest npm release instead of the pinned command above, use `npx -y web-debug-mcp`.

### When the agent should use it

Use it when a local web application is running and the task needs browser-grounded evidence, such as:

- reproducing a DOM, console, network, screenshot, or JavaScript-debugger issue;
- understanding React state, commits, render causes, or bounded flamegraph data;
- inspecting bounded Angular development component/state changes through documented debug globals;
- inspecting bounded Vue 3 development component/props/state updates through a safely chained DevTools hook;
- investigating Vite module/HMR/transform behavior;
- inspecting Next.js routes, logs, request traces, or Server Actions;
- replaying and verifying a browser flow after a frontend fix.

Start with `web_project_detect`, then use `web_session_start`, `web_browser_action`, and `web_issue_capture`. Use `web_next_inspect` for Next-specific inspection and `web_repro_record` plus `web_fix_verify` for regression verification.

Do not use this server for native macOS/iOS build-debug work, production monitoring, arbitrary remote browser control, credentialed browser profiles, or application-state time travel. Those are outside this MCP's contract.

Official setup references: [Codex MCP configuration](https://developers.openai.com/codex/mcp/), [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins), and [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp).

## Why this project exists

Web debugging is usually split across several disconnected surfaces:

- browser DevTools for DOM, console, network, screenshots, and JavaScript pauses;
- React or framework tooling for component state and render behavior;
- Vite or Next development servers for transforms, routes, logs, traces, and Server Actions;
- a human-written reproduction that is often difficult to repeat after a change.

An agent can edit code without having a reliable, structured account of what happened in the running app. `web-debug-mcp` closes that gap. It turns a reproduction into bounded evidence that an agent can inspect, compare, and use for fix verification.

The project deliberately keeps one public MCP catalog. React, Angular, Vue, Vite, Next, Chromium, and Safari are internal adapters behind the same session and evidence contract, so adding framework context does not create overlapping MCP servers.

## What MCP adds here

MCP is the transport and tool contract between an agent such as Codex and this debugging process. The server exposes typed, discoverable operations instead of asking the agent to parse terminal output or drive an unstructured DevTools UI.

The public tools cover:

- project capability detection;
- explicit Chromium or Safari session start and status;
- bounded browser actions: navigate, click, fill, exact-locator probe waits, and reload;
- deterministic locator actions for keyboard press, select, checked state, hover, and scroll-into-view;
- issue capture with compact summary (default), explicit full evidence, selected surfaces, or cursor-based changed surfaces;
- Chromium breakpoints, pause control, and guarded JavaScript evaluation;
- Next route compilation and Server Action lookup;
- replay frame inspection and safe-action restore;
- reproducible flow recording and post-change verification;
- session cleanup.

Every tool advertises and enforces its own concrete MCP `data` schema inside one canonical `{ ok, data, error, artifacts, warnings }` structured envelope. Stable top-level and capture-profile fields are concrete; bounded deep runtime/upstream payloads such as evaluation values, debugger locals, framework trees, and Next metadata remain JSON leaves. Text content is only a bounded preview. Requests rejected by the MCP SDK before handler dispatch use the SDK protocol-validation error shape and have no tool `structuredContent`. Screenshot pixels are inlined only when small enough for the result budget; every accepted screenshot also receives a non-enumerable, identity-revalidated `web-debug://artifact/...` resource link. Screenshot retention is capped at 4 MiB per file and four files/16 MiB per session; quota pruning can expire an older resource before its one-hour maximum TTL. Long baseline and post-fix operations emit monotonic MCP progress when the client requests it.

### Capture profiles

`web_issue_capture` defaults to `{ "view": { "profile": "summary" } }`. Summary returns a compact DOM excerpt, counts, latest failures, runtime presence, replay bounds, warnings, and a reusable opaque cursor without producing screenshot pixels. Use an explicit profile when more detail is necessary:

- `full`: every bounded surface plus an explicit screenshot attempt;
- `include`: only the unique named `surfaces`; include `screenshot` to opt into pixels;
- `delta`: the current bounded values of selected surfaces whose digest changed since `cursor`; omitted `surfaces` means every evidence surface except replay and screenshot, whose capture side effects require explicit inclusion. This is not JSON Patch, an event stream, or browser-state time travel. Requested screenshots use a fresh artifact rather than pixel diffing, so each successfully captured screenshot is changed.

Surfaces are `dom`, `console`, `network`, `debugger`, `react`, `angular`, `vue`, `next`, `vite`, `accessibility`, `replay`, and `screenshot`. Each session retains at most eight reusable cursors. Unknown, evicted, cross-session, or browser-generation-stale cursors fail explicitly. Screenshot paths never appear in capture data; accepted pixels are delivered only through the envelope's artifact descriptors. Scenario baseline and fix verification still retain authoritative full evidence independently of the manual profile.

The MCP boundary is intentionally small. Framework-specific protocol details stay inside adapters, while session ownership, same-origin navigation, bounds, redaction, and recovery stay centralized.

## How it differs from native macOS and iOS build/debug skills

`web-debug-mcp` complements Codex build/debug skills; it is not a replacement for them and it is not another Xcode automation layer.

| Surface | Primary target | Main job | Typical evidence |
| --- | --- | --- | --- |
| `build-macos-apps` skills | macOS apps, Swift, Xcode, AppKit, SwiftUI | Build, run, package, and debug native macOS software | Xcode/SwiftPM builds, app launch state, macOS logs, window behavior, signing and packaging evidence |
| `build-ios-apps` skills | iOS apps and Simulator | Build, launch, inspect, test, and profile native iOS software | Simulator UI, `adb`/Xcode-style logs, ETTrace, memgraphs, App Intents, SwiftUI behavior |
| `web-debug-mcp` | Local web apps in Chromium or Safari | Reproduce browser behavior and join browser evidence with bounded framework/runtime context | DOM, console, network metadata, CDP pauses, React commits, Angular DOM-host state, Vue component updates, Vite transforms, Next traces, screenshots, replay frames |

The difference is both the target and the integration model:

- Native build skills are Codex workflows for operating native development environments and their simulators or app runtimes.
- `web-debug-mcp` is a repository-owned MCP server that any compatible MCP client can call over stdio.
- Native skills help build and debug the app itself; this server observes a running web target and produces structured browser/runtime evidence.
- A project may use both: a native skill for a macOS or iOS shell, and `web-debug-mcp` for a web frontend, embedded web surface, or local browser flow.

## What it provides

### Browser evidence

- Chromium launch through an explicit executable path or attach through an explicit CDP endpoint.
- Exact CSS, role, text, label, and test-id locators with fresh live count/visibility/enabled/checked/text probes.
- Isolated loopback-only TLS opt-in with an approved origin, project-contained disposable Playwright auth state, named checkpoints, and bounded desktop/mobile viewport matrices.
- Computed Chromium accessibility diagnostics with live-validated `uniqueAtCapture` suggestions; Safari stays CSS-only and reports these advanced capabilities as unavailable.
- Auth-seeded sessions suppress screenshots because screenshot pixels cannot be truthfully redacted.
- Sessions or scenarios containing private fill/select values also suppress screenshots; structured values are redacted, but pixels are never claimed scrubbed.
- Safari actions, DOM, screenshots, and explicit JavaScript evaluation through W3C WebDriver.
- WebDriver BiDi console and network subscriptions where the installed Safari exposes them.
- A disclosed, bounded Performance Resource Timing fallback for Safari versions that do not emit network events.
- JavaScript breakpoints, pause reasons, call frames, scope values, and guarded evaluation in Chromium.
- Same-origin navigation and bounded console/network metadata with redaction.
- Opt-in Chrome WebMCP page actions through `document.modelContext`: direct-only, explicit side-effect authorization, one attempt, opaque bounded string/null result, truthful `webmcp-page-api` provenance, and independent UI/domain evidence for mutations.
- Discover-only bounded WebMCP metadata through capture; metadata, schemas, annotations, and descriptions remain untrusted page content.
- Top-level redirects, clicks, reloads, and secondary pages stay on the selected origin. Chromium combines selected-target CDP interception with a context-wide frame-less-document fallback and revalidates every final state; in attach mode that fallback disables HTTP cache for sibling pages until close. Safari WebDriver verifies and quarantines escaped state immediately after navigation because its compatibility transport has no reliable pre-request interception.

To exercise the page API locally, use a command-owned Chrome 151+ profile with the WebMCP testing flag enabled (`chrome://flags/#enable-webmcp-testing`). The direct action shape is bounded and explicit:

```json
{
  "kind": "webmcp",
  "origin": "http://127.0.0.1:4173",
  "name": "submit_payment",
  "arguments": { "amount": 249.9 },
  "allowSideEffects": true
}
```

The page API is not browser-native provenance. Every attempted call is treated as potentially mutating, executes once, is excluded from replay/scenario actions, marks the timeline non-restorable, and suppresses subsequent screenshots.

### React profiler and render-cause evidence

The injected development bridge observes React’s DevTools hook and returns:

- component and hook state summaries;
- prop and hook changes for the latest render;
- inferred causes such as mount, props, state, props plus state, or parent;
- bounded commit counts, changed-component counts, and durations;
- a flat, depth-aware flamegraph view with actual, self, and tree duration summaries.

This is useful for locating re-render hotspots and distinguishing a state update from a prop or parent-driven render without exposing raw Fiber objects.

### Angular development evidence

For detected Angular projects, Chromium injects a target-scoped read-only bridge before navigation. Development builds with documented `window.ng` globals return a bounded DOM-hosted component tree, own data properties, sample counts, and changed state keys. The bridge excludes accessors, methods, signals, injectors, and private Ivy fields. Angular CLI's encapsulated Vite server is not the Web Debug Vite endpoint, so Angular-only projects do not claim Vite module/HMR provenance.

### Vue 3 development evidence

For detected Vue projects, Chromium injects a target-scoped bridge that observes the exact Vue 3 DevTools hook contract while preserving an existing hook. It returns bounded application/component trees, props, descriptor-backed state, source-file hints, update counts, and changed keys. It never falls back to DOM-private `__vue*` properties. Vue/Vite projects can additionally install `webDebugVitePlugin()` for the existing module/HMR provenance.

### Vite provenance

The development-only `webDebugVitePlugin()` exposes a bounded local endpoint containing:

- module and importer relationships;
- HMR state and the changed module;
- before/after transformed-code summaries;
- a changed-block transform diff;
- source-map presence, source names, mapping length, and file metadata.

This connects a browser symptom to the code Vite actually served, while keeping full source bodies and production exposure out of the default contract.

### Next.js server evidence

The adapter speaks to Next’s local `/_next/mcp` endpoint and can return:

- project metadata, routes, compilation issues, and bounded development logs;
- request insights and normalized server request traces with bounded spans;
- route compilation through `web_next_inspect`;
- Server Action manifest resolution;
- an observed browser `Next-Action` POST linked to its Server Action resolution and matching server trace.

The suite observes and explains a Server Action request. It does not invoke arbitrary server actions on an agent’s behalf.

### Replay and adaptive verification

Every manual action and representative capture can produce one of up to eight bounded replay frames. Verification attempts retain one capture-only frame with an `attemptId`; `web_replay_seek` can inspect it but restore remains fail-closed. Ordinary manual frames can use `restore: true` to reissue retained navigation, click, press, check, hover, scroll, observable wait, and reload actions only while the trustworthy session-start boundary is still retained. Fill and select values are sanitized before storage; truncated starts, sanitized inputs, or redacted navigation URLs fail closed during restore.

Recorded scenarios execute a bounded pre-fix baseline before they are stored. The contract separates a named `failureSignature` from `acceptanceChecks` and optional `regressionChecks`; `web_fix_verify` returns exactly `verified`, `failed`, or `inconclusive`, never an ambiguous boolean. Quick verification uses one attempt (15 seconds); declared asynchronous, timing, concurrency, browser-state, or server-state risk starts at standard (up to three attempts/60 seconds), and prior flakiness starts strict (up to five attempts/120 seconds). Retryable startup/readiness signals and conflicting baseline observations are recorded as escalation reasons. The MCP plugin allows 150 seconds so strict verification and bounded cleanup can finish, while requested progress reports phase start, attempt boundaries, and phase completion on a fixed monotonic scale.

Scenarios are session-owned and in-memory. The private executable URL retains its exact query for replay, while the public scenario URL is query-free; public actions replace fill/select values with a redaction marker, contract hashes contain only the sanitized contract, and build references are explicitly untrusted caller labels. Each result reports environment/target provenance, rates over decisive observations, per-attempt summaries, reset/isolation truth, cancellation or deadline state, and one bounded representative evidence bundle per phase. A full representative recapture is authoritative: drift or unavailable evidence is `inconclusive`, never `verified`. A scenario is not reusable across sessions, and closing destroys private actions, auth/start settings, target identity, secrets, and retained evidence before keeping only a bounded sanitized tombstone.

Scenario recording is intentionally not a test-definition generator. The project does not export or import YAML/JSON scenario files and does not provide a standalone or CI scenario runner. When a reproduced regression needs durable cross-session or CI coverage, encode it in the repository's native test suite; use this MCP workflow for browser-grounded reproduction, diagnosis, and same-session fix verification.

Recorded scenarios make the loop repeatable:

```text
record flow → reproduce → capture evidence → change code → rerun flow → compare checks
```

The MCP flow is session-bound and explicit:

```json
{
  "sessionId": "<live-session-id>",
  "name": "latest quote wins",
  "url": "http://127.0.0.1:4188/",
  "actions": [{"kind": "click", "locator": {"kind": "css", "value": "[data-testid='refresh-quote']"}}],
  "failureSignature": [{"kind": "locatorText", "locator": {"kind": "css", "value": "body"}, "text": "Quote v2 applied", "match": "contains", "expected": "fail"}],
  "acceptanceChecks": [{"kind": "locatorText", "locator": {"kind": "css", "value": "body"}, "text": "Quote v2 applied", "match": "contains"}, {"kind": "noConsoleErrors"}],
  "risks": {"async": true}
}
```

Wait actions must name an exact locator, probe property, and expected value; elapsed-only sleeps are rejected.

The action set is intentionally deterministic: `press` accepts a fixed navigation/editing key allowlist, `select` chooses one exact option value, `check` declares the desired boolean state, and `scroll` brings one exact locator into view. Fill and select values remain private to the live session and are never restorable from public replay.

## Why use it?

Use this project when you want the debugging agent to have evidence rather than guesses:

- shorten the reproduce–inspect–fix–verify loop;
- keep browser state, framework state, and dev-server state in one response;
- diagnose React re-render and HMR issues with source-oriented context;
- connect a Next Server Action request to its route, manifest entry, and server spans;
- retain a redacted reproduction within the live session so it can be inspected or safely replayed;
- use exact semantic locators, named checkpoints, and bounded viewport matrices for repeatable responsive flows;
- make cross-browser checks explicit instead of silently treating WebKit as Safari;
- avoid installing several MCP servers that each own part of the same frontend workflow;
- keep local debugging bounded and reviewable for agent-driven development.

## Examples and evidence

The examples show the practical difference: a raw browser path can reproduce a symptom, while the MCP path joins browser state with React/Vite/Next runtime evidence, records the flow, and verifies the same interaction after a fix. The suite includes a stale React filter, an out-of-order async quote, and a responsive drawer visual bug at desktop and mobile sizes. See [Examples and evidence](docs/examples-evidence.md) for the before/after stories and representative evidence.

## Useful application areas

- React UI bugs, stale state, unexpected renders, and component performance investigations;
- Angular development component/state regressions where a DOM-hosted tree is sufficient;
- Vue 3 development component, props, state, and update regressions;
- Vite HMR failures, transform regressions, importer/module-graph problems, and source-map questions;
- Next.js App Router, route compilation, RSC, request-insight, and Server Action debugging;
- browser console or network regressions tied to a reproducible interaction;
- Safari compatibility checks where DOM, console, network metadata, or screenshots are enough;
- regression verification after a frontend fix;
- local bug reports that need a durable evidence bundle for another engineer or agent;
- agent workflows that need a single, structured web-debugging capability.

## Quick start

```bash
npm install --no-audit --no-fund
npm test
npm run typecheck
npm run build
npm run harness:check
```

Check first-run readiness without starting a browser:

```bash
npm run build
node bin/web-debug-mcp.mjs doctor --project-root fixtures/react-vite --url http://127.0.0.1:4174/ --executable-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

For a live Chromium smoke, provide an explicit browser executable:

```bash
WEB_DEBUG_CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run smoke:live
```

For the framework fixtures:

```bash
npm run smoke:react-vite
npm run smoke:vue-vite
npm run smoke:angular
npm run smoke:next
npm run smoke:safari
```

To see the same debugging flows with and without the MCP evidence workflow:

```bash
WEB_DEBUG_CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run demo:compare
```

The comparison demo measures repeatable local machine timings and evidence coverage for vanilla browser validation, React/Vite render diagnosis, Next.js Server Action linkage, a complex React filter repair, an out-of-order async quote repair, and a responsive visual drawer repair. See [`docs/demos/comparison.md`](docs/demos/comparison.md) for the scenario definitions and interpretation rules.

Run the MCP server after building:

```bash
node dist/index.js
```

To exercise a local checkout through an MCP client, register that built file directly under a distinct name and do not enable the released plugin in the same client session:

```bash
codex mcp add web-debug-mcp-local -- node /absolute/path/to/web-debug-mcp/dist/index.js
claude mcp add --transport stdio --scope project web-debug-mcp-local -- node /absolute/path/to/web-debug-mcp/dist/index.js
```

Replace the placeholder with this checkout's absolute path, then verify `serverInfo.version` is `0.7.0`. Disable the installed released plugin in that client session while exercising the local checkout so the same MCP catalog is not registered twice.

Then use the MCP client workflow:

1. Call `web_project_detect`.
2. Start an explicit local session with `web_session_start`.
3. Reproduce the issue with `web_browser_action` and, for Chromium, debugger tools.
4. Capture `web_issue_capture` at the failure point.
5. Use `web_next_inspect` for a Next route or Server Action when applicable.
6. Record and rerun a flow with `web_repro_record` and `web_fix_verify`.
7. Inspect or safely restore a retained frame with `web_replay_seek`.
8. Close the session with `web_session_close`. Use `artifactPolicy: "delete"` to remove only that exact session artifact directory; the default `retain` keeps non-empty evidence available for inspection and removes an empty directory.

For Vite, install the development-only plugin in `vite.config.ts`:

```bash
npm install --save-dev web-debug-mcp@0.7.0
```

```ts
import { webDebugVitePlugin } from "web-debug-mcp/vite";

export default {
  plugins: [webDebugVitePlugin()],
};
```

Do not enable that plugin in a production server.

## What to expect

- A local process communicating over MCP stdio.
- Explicit browser target selection; no arbitrary browser or target discovery.
- Structured evidence with bounded arrays and text, redaction markers, and capability warnings.
- MCP-native structured results, bounded text previews, progress notifications, and opaque screenshot resources.
- Nullable framework fields when a development runtime does not expose a signal.
- Chromium debugger depth and Safari WebDriver/BiDi coverage that differ by browser capability.
- Temporary screenshot artifacts outside the project directory with explicit retain/delete close policy.
- Safe replay that reissues a limited action set, not a magical snapshot restore.
- A native harness status that distinguishes passing source checks from a historical, possibly stale certification window; neither proves production deployment or provider authentication.

## What not to expect

This project is not:

- a full replacement for Chrome DevTools, Safari Web Inspector, React DevTools, or an IDE;
- an automatic code-fixing agent;
- a complete React DevTools profiler/flamegraph implementation or perfect render-cause oracle;
- a full source-map debugger or a distributed tracing backend;
- an arbitrary Next server executor or a way to run credentialed Server Actions;
- a Safari JavaScript debugger with Chromium CDP parity;
- a production monitoring, incident-management, or hosted MCP service;
- an unattended remote-browser controller;
- a portable YAML/JSON browser-action DSL, MCP scenario importer, or cross-session/CI scenario runner; qualification JSON is non-executable metadata around repository-native tests;
- a secret, cookie, browser-storage, or raw-response-body collector;
- proof that a local smoke passed in production.

Remote CDP or WebDriver attachment requires explicit opt-in and an approved target. It is marked non-isolated. No external remote target or provider-backed production attestation is included in the current repository evidence.

## Safety defaults

- Browser URLs are loopback-only unless `allowRemote` is explicitly enabled.
- Top-level browser navigation remains on the session origin across initial redirects, actions, reloads, and secondary pages; cross-origin subresources remain available in ordinary sessions.
- External attachments are marked non-isolated.
- Console text, URLs, debugger locals, evaluated values, framework data, and replay frames are bounded and redacted.
- Raw response bodies, cookies, authorization values, and browser storage are not collected by the core adapter.
- Evaluation rejects side effects unless `allowSideEffects: true` is explicitly supplied.
- Direct WebMCP actions require `allowSideEffects: true`, are never retried or stored as replay/scenario actions, mark the timeline non-restorable, and suppress later screenshots. `readOnlyHint` is untrusted metadata and never waives these rules.
- Framework HTTP bodies, WebDriver responses, evaluated values, error details, structured data, and complete MCP results have byte budgets; overflow fails with a stable error instead of partial success.
- The Vite plugin is development-only and local by design.

## Safari 27 note

Safari 27 includes Apple’s official Safari MCP server. The reviewed Safari 27 artifact failed this project's full transport cutover gate, so WebDriver/BiDi remains the sole internal Safari transport. If Safari MCP is separately configured, the bundled workflow skill may use only its handle-scoped create/navigate/console-summary/network-summary/close subset in a separate diagnostic tab. Ambient tools, full request details, evidence merging, and qualification PASS remain prohibited.

## Verification status

Release `0.7.0` promotes the verified Chrome WebMCP and three-skill source contract without changing the Safari cutover decision. Safari WebDriver/BiDi remains authoritative, and the optional external Safari MCP diagnostic subset is contract-backed but not live-verified on this host. Exact archive, npm/GitHub, and installed Codex plugin evidence is recorded in the `0.7.0` release plan. The checked-in historical certification window remains stale; this release does not claim a current `CERT000`.

See [`ARCHITECTURE.md`](ARCHITECTURE.md), the [product contract](docs/product-specs/web-debug-contract.md), [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/RELIABILITY.md`](docs/RELIABILITY.md), and [`docs/agent-harness/certification.md`](docs/agent-harness/certification.md) for implementation boundaries and operational details.

Exact locally verified versions are recorded in [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md). `npm run eval:catalog` emits the three frozen agent repair contracts documented in [`docs/demos/agent-evaluation.md`](docs/demos/agent-evaluation.md); it never calls a model automatically.

## License

`web-debug-mcp` is licensed under the GNU General Public License, version 3 or any later version. See [`LICENSE`](LICENSE).

SPDX-License-Identifier: `GPL-3.0-or-later`
