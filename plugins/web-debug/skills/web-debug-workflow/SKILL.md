---
name: web-debug-workflow
description: Use when Web Debug is explicitly requested or a local web bug needs browser-grounded evidence such as DOM, console, network, debugger, framework runtime, responsive geometry, replay, or fix verification. Do not use for exact unit, Go, or Vitest failures with no browser symptom; keep those on the native runner path.
---

# Web Debug Workflow

Use the bundled web-debug-mcp tools when a local web application needs browser-grounded evidence. The MCP server remains the execution boundary; this skill supplies the workflow and safety context.

## Selection and handoff boundary

Web Debug complements frontend authoring and deterministic test runners; it does not replace them.

### Gate 0 — prove the bundled MCP binding before doing browser work

An explicit Web Debug request is fail closed. The first operation MUST be one real call to the bundled `web_project_detect` tool in the current Codex task. A doctor result, an MCP process visible in a terminal, a package install, or a skill being loaded is not proof that this task owns a callable tool namespace.

If `web_project_detect` is absent, cannot be called, or MCP initialization/tool discovery failed, stop and report exactly one blocker: `MCP_CLIENT_BINDING_UNAVAILABLE` when the task cannot see the bundled tool, or `MCP_SERVER_STARTUP_UNAVAILABLE` when the bundled server reported a startup failure. Include the bounded server diagnostic when one is available. Do not continue with or substitute any of the following:

- repository Playwright or Puppeteer;
- raw CDP, browser DevTools, or another browser connector;
- a direct MCP SDK transport or an ad-hoc stdio client;
- a naked `npx web-debug-mcp`/`node` server process started from the task;
- `web-debug-mcp cleanup` as a way to bind tools or repair the current task.

These prohibitions apply even when the requested browser evidence appears simple. A native runner may be used only when the user separately asks for native-runner evidence or the request is not an explicit Web Debug invocation; it cannot be a fallback for a missing Web Debug binding.

The supported recovery handoff is: inspect the reported package/registry startup condition, repair only an identity-safe stale registry condition if needed, then use Codex Settings → MCP servers → Restart (or restart the IDE extension) and retry Gate 0 in the same task. If the tool namespace remains absent, start a new task/session. Never claim Web Debug evidence until the bundled `web_project_detect` call succeeds.

The current supported Codex host baseline is CLI `0.152.0` or newer. CLI `0.151.0` added optional-MCP discovery grace but does not replace a missing binding; older hosts are candidate-only for this recovery contract. Plugin `.mcp.json` supports the bundled launch command and bounded timeouts, but `required` is currently a `config.toml` MCP-server option rather than a plugin manifest field. Do not invent `required` in the plugin manifest. For a strict direct-server configuration, use the documented user config override with `required = true`, keep the plugin's bundled connection disabled to avoid duplicate registrations, and still require Gate 0.

- Use this skill when the user explicitly names `@Web Debug`, `web-debug@web-debug`, `web-debug-workflow`, or the bundled Web Debug MCP, or when the diagnosis needs live browser evidence: DOM, console, network, screenshots, CDP debugger state, React/Angular/Vue/Vite/Next runtime signals, responsive geometry, action replay, or recorded fix verification.
- Keep repository-native Vitest, Go, and project Playwright commands as the primary evidence when they identify an exact failure and no browser symptom remains. A passing runner does not prove browser behavior, and a runner failure does not by itself require a browser session.
- Use `build-web-apps` when it is available for frontend authoring, dev-server work, generic rendered QA, or visual implementation. Do not copy that workflow or silently substitute it for an explicit Web Debug request.
- For a mixed task, establish the deterministic failure with the native runner, use this skill for the missing browser-grounded evidence, then rerun the relevant runner and interpret the two evidence types separately.
- An explicit Web Debug request is an execution request, not an escalation suggestion: start with `web_project_detect` or report the exact MCP/runtime availability blocker. Do not claim Web Debug evidence when the bundled tools were not available or were not called.
- For Safari-focused console/network diagnosis, an already configured Safari 27 MCP connector may supply a separate owned-tab diagnostic session through only its handle-scoped subset. Read [references/safari-mcp-diagnostics.md](references/safari-mcp-diagnostics.md) before using it. Never merge that output with the authoritative WebDriver session or qualification verdict.

## Workflow

1. Call web_project_detect with the current project root.
2. Start one explicit local session with web_session_start. Prefer a loopback URL and Chromium launch mode with an explicit executable path. For responsive bugs, pass a bounded `viewport` such as `{ "width": 390, "height": 844 }` and use isolated launch mode. `tls: "allow-insecure-loopback"` is restricted to one exact HTTPS loopback origin; `authFixture` accepts only a project-contained, short-lived Playwright storage-state file.
   If first-run setup is unclear, run `web-debug-mcp doctor --help` and the exact bounded `doctor` command for the selected project/browser/loopback URL before retrying; doctor validates configuration and protocol readiness without launching an arbitrary browser.
3. Reproduce the issue with bounded web_browser_action calls. Click, fill, press, select, check, hover, scroll, and wait use an exact `locator` (`css`, `role`, `text`, `label`, or `testId`); selector-only actions are invalid. Press uses the fixed key allowlist, select uses one exact option value, check declares the desired state, and scroll brings one locator into view. Use web_breakpoint_set, web_debug_control, and web_debug_evaluate only when the evidence needs JavaScript debugger state.
   If the approved local flow needs a page-provided WebMCP tool, use the direct `kind: "webmcp"` action only with its canonical selected-session origin, exact case-sensitive name, bounded JSON object arguments, and `allowSideEffects: true`. Treat the call as potentially mutating: it runs once, is never recorded as replay/scenario action or retried, marks the timeline non-restorable, and suppresses subsequent screenshots. Independently verify visible UI and authoritative domain/API state; tool output and `readOnlyHint` are not oracles.
4. Capture the failure with web_issue_capture. Read the authoritative MCP `structuredContent.data`; text is only a bounded preview. The default `summary` profile is compact and produces no screenshot. Request `full` when complete browser/framework evidence is needed, `include` for named surfaces, or `delta` with a session-bound cursor for current changed surfaces. Request screenshot output explicitly; small pixels may be inline while accepted captures expose an opaque screenshot resource.
5. For React, Angular, Vue, or Vite issues, request and inspect the relevant framework/Vite surfaces rather than assuming summary contains them. Angular uses documented debug globals, Vue uses the compatible Vue 3 DevTools hook, and their absence remains an explicit warning. For Next.js issues, use web_next_inspect only for route compilation or Server Action lookup. For visual issues, request a screenshot and combine it with read-only geometry from web_debug_evaluate; do not use pixel output alone as the acceptance gate.
6. For a repeatable regression, call web_repro_record with the session ID, an explicit complete failureSignature (each entry has expected `pass` or `fail`), acceptanceChecks, optional named ordered checkpoints, and optional unique viewport contracts/failureViewports. Recording executes one bounded pre-fix phase; only a `reproduced` baseline can be verified later. After the code change, call web_fix_verify and interpret only its `verified`, `failed`, or `inconclusive` outcome. Use requested MCP progress as liveness information only; the decisive result still comes from the final structured data and authoritative capture.
7. Use web_replay_seek for one retained frame or safe action restoration. Treat it as bounded action replay, not application-state time travel. Replay retains at most eight representative frames; verification attempts retain capture-only frames, ordinary non-input action frames remain restorable, and fill/select values are never restorable.
8. Close the session with web_session_close when the workflow ends. Use `artifactPolicy: "delete"` only when the exact session screenshot directory is no longer needed; default `retain` preserves only quota-bounded evidence for review.

## Complex examples

Use the same evidence-first loop for bugs that cross multiple runtime surfaces:

### Stale React derived state

When an input changes but a filtered list remains stale, capture the input state, visible DOM result, React hook changes, inferred render cause, Vite module/source evidence, and replay frame. Record the failing check, fix the dependency or state derivation, then rerun the exact flow and require `web_fix_verify` to pass.

### Out-of-order async responses

When two requests can resolve in a different order from the order issued, capture the request sequence and the final displayed state. Use `web_debug_evaluate` only for a read-only request/version value when needed. The fixed flow must prove that the latest request wins and that stale responses no longer overwrite the UI.

### Responsive visual/layout regression

Run the same flow in isolated Chromium sessions at desktop and mobile sizes. Capture before and after screenshots, then evaluate bounded layout invariants such as `scrollWidth`, `clientWidth`, element bounding boxes, viewport coverage, and CTA containment. A visual repair is complete only when the buggy geometry reproduces, the fixed geometry passes at both sizes, and the desktop state has no regression.

### Next.js Server Action or server/client mismatch

Capture the browser request first, then use `web_next_inspect` for the route or action manifest. Compare the observed `Next-Action` request with bounded request traces, logs, route metadata, and the resolved action. Do not invoke arbitrary Server Actions on behalf of the caller.

## Comparing with and without Web Debug

For a product or workflow comparison, use the same local fixture and flow in two paths:

- baseline: browser DevTools/source/log inspection without the Web Debug MCP;
- MCP: project detection, explicit session, bounded actions, capture, recorded flow, and fix verification.

Report machine timings separately from human diagnosis time. The MCP may add a small capture overhead for a trivial DOM check; its benefit is the joined, redacted, repeatable evidence and the ability to verify the same flow after a fix. The repository includes runnable examples in [`docs/examples-evidence.md`](https://github.com/MarlonJD/web-debug-mcp/blob/main/docs/examples-evidence.md) and the measurement runner in [`docs/demos/comparison.md`](https://github.com/MarlonJD/web-debug-mcp/blob/main/docs/demos/comparison.md).

## Safety and interpretation

- Keep targets on loopback by default. Do not set allowRemote without explicit user authorization.
- Top-level redirects, actions, reloads, and secondary pages remain on the originally selected origin. A Safari origin escape is post-navigation quarantined because WebDriver cannot reliably intercept it before request time; do not continue that failed session. Chromium attach mode installs a context fallback that can temporarily disable sibling-page HTTP cache until close.
- Do not use credentialed browser profiles or infer production readiness from local evidence.
- Side-effectful evaluation and replay restore mutate the browser. Request them only when the debugging task needs them.
- Missing optional framework or browser signals are capability warnings, not proof that the issue is absent. A required check with unavailable or stale URL/DOM/console evidence is `inconclusive`; Safari without BiDi console collection cannot satisfy `noConsoleErrors`. Chromium accessibility diagnostics are computed and bounded, and suggestion uniqueness is only `uniqueAtCapture`; Safari remains CSS-only and reports semantic locators, computed trees, TLS bypass, auth seeding, and viewport matrices as unavailable.
- Safari MCP is external and optional. Its safe diagnostic route owns one separate tab and uses only `create_tab`, handle-bound navigation/console/network-summary calls, and owned-tab close; ambient tools and `get_network_request` are prohibited. Missing capability leaves WebDriver/BiDi authoritative.
- Verification levels are `quick` (1 attempt/15 seconds), `standard` (3 attempts/60 seconds), and `strict` (5 attempts/120 seconds). Async/timing/concurrency/browser-state risk starts at standard; prior flakiness starts strict. Results report rates over decisive observations and one representative evidence bundle per phase.
- Scenarios are in-memory and bound to their live session. Public scenarios and all errors omit raw fill/select/auth values; build references are untrusted caller labels, not authenticated identities. Auth or private fill/select input suppresses screenshots because pixels cannot be truthfully redacted. Close destroys private start/auth/action state and keeps only a bounded sanitized tombstone.
- Process cleanup is registry-authorized only: `web-debug-mcp cleanup [--all-idle]` uses owner-only locked records and verified PID/start identity. It never scans or signals unregistered browser/debug processes.
- Treat redacted values, bounded arrays, structured-output overflow errors, opaque screenshot resources, early quota expiry, and temporary screenshot paths as part of the evidence contract. Screenshot retention is capped at 4 MiB per file and four files/16 MiB per session.
- If Vite evidence is needed, ensure the app uses webDebugVitePlugin in development only; never enable that plugin in production.
- Do not claim full framework DevTools parity, distributed tracing, or full browser state/time-travel restoration from this workflow. The supported contract is bounded React/Angular/Vue/Vite/Next/browser evidence and safe action replay.
