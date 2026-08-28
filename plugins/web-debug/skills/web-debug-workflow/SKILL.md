---
name: web-debug-workflow
description: Use when Web Debug is explicitly requested or a local web bug needs browser-grounded evidence such as DOM, console, network, debugger, framework runtime, responsive geometry, replay, or fix verification. Do not use for exact unit, Go, or Vitest failures with no browser symptom; keep those on the native runner path.
---

# Web Debug Workflow

Use the bundled web-debug-mcp tools when a local web application needs browser-grounded evidence. The MCP server remains the execution boundary; this skill supplies the workflow and safety context.

## Selection and handoff boundary

Web Debug complements frontend authoring and deterministic test runners; it does not replace them.

- Use this skill when the user explicitly names `@Web Debug`, `web-debug@web-debug`, `web-debug-workflow`, or the bundled Web Debug MCP, or when the diagnosis needs live browser evidence: DOM, console, network, screenshots, CDP debugger state, React/Vite/Next runtime signals, responsive geometry, action replay, or recorded fix verification.
- Keep repository-native Vitest, Go, and project Playwright commands as the primary evidence when they identify an exact failure and no browser symptom remains. A passing runner does not prove browser behavior, and a runner failure does not by itself require a browser session.
- Use `build-web-apps` when it is available for frontend authoring, dev-server work, generic rendered QA, or visual implementation. Do not copy that workflow or silently substitute it for an explicit Web Debug request.
- For a mixed task, establish the deterministic failure with the native runner, use this skill for the missing browser-grounded evidence, then rerun the relevant runner and interpret the two evidence types separately.
- An explicit Web Debug request is an execution request, not an escalation suggestion: start with `web_project_detect` or report the exact MCP/runtime availability blocker. Do not claim Web Debug evidence when the bundled tools were not available or were not called.

## Workflow

1. Call web_project_detect with the current project root.
2. Start one explicit local session with web_session_start. Prefer a loopback URL and Chromium launch mode with an explicit executable path. For responsive bugs, pass a bounded `viewport` such as `{ "width": 390, "height": 844 }` and use isolated launch mode. `tls: "allow-insecure-loopback"` is restricted to one exact HTTPS loopback origin; `authFixture` accepts only a project-contained, short-lived Playwright storage-state file.
3. Reproduce the issue with bounded web_browser_action calls. Every click, fill, and wait uses an exact `locator` (`css`, `role`, `text`, `label`, or `testId`) and fresh live probes; selector-only actions are invalid. Use web_breakpoint_set, web_debug_control, and web_debug_evaluate only when the evidence needs JavaScript debugger state.
4. Capture the failure with web_issue_capture. The result combines bounded browser, console, network, screenshot, debugger, framework, and replay evidence.
5. For React or Vite issues, inspect the automatic React bridge and Vite module/HMR evidence in the capture. For Next.js issues, use web_next_inspect only for route compilation or Server Action lookup. For visual issues, combine the screenshot with read-only geometry from web_debug_evaluate; do not use pixel output alone as the acceptance gate.
6. For a repeatable regression, call web_repro_record with the session ID, an explicit complete failureSignature (each entry has expected `pass` or `fail`), acceptanceChecks, optional named ordered checkpoints, and optional unique viewport contracts/failureViewports. Recording executes one bounded pre-fix phase; only a `reproduced` baseline can be verified later. After the code change, call web_fix_verify and interpret only its `verified`, `failed`, or `inconclusive` outcome. The decisive post-fix attempt must agree with its authoritative full capture; drift or unavailable representative evidence is inconclusive.
7. Use web_replay_seek for one retained frame or safe action restoration. Treat it as bounded action replay, not application-state time travel. Replay retains at most eight representative frames; verification attempts retain capture-only frames, ordinary manual action frames remain restorable, and fill values are never restorable.
8. Close the session with web_session_close when the workflow ends.

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
- Do not use credentialed browser profiles or infer production readiness from local evidence.
- Side-effectful evaluation and replay restore mutate the browser. Request them only when the debugging task needs them.
- Missing optional framework or browser signals are capability warnings, not proof that the issue is absent. A required check with unavailable or stale URL/DOM/console evidence is `inconclusive`; Safari without BiDi console collection cannot satisfy `noConsoleErrors`. Chromium accessibility diagnostics are computed and bounded, and suggestion uniqueness is only `uniqueAtCapture`; Safari remains CSS-only and reports semantic locators, computed trees, TLS bypass, auth seeding, and viewport matrices as unavailable.
- Verification levels are `quick` (1 attempt/15 seconds), `standard` (3 attempts/60 seconds), and `strict` (5 attempts/120 seconds). Async/timing/concurrency/browser-state risk starts at standard; prior flakiness starts strict. Results report rates over decisive observations and one representative evidence bundle per phase.
- Scenarios are in-memory and bound to their live session. Public scenarios and all errors omit raw fill/auth values; build references are untrusted caller labels, not authenticated identities. Auth-seeded sessions never create screenshots because pixels cannot be truthfully redacted. Close the session to purge private scenario actions and evidence.
- Process cleanup is registry-authorized only: `web-debug-mcp cleanup [--all-idle]` uses owner-only locked records and verified PID/start identity. It never scans or signals unregistered browser/debug processes.
- Treat redacted values, bounded arrays, and temporary screenshot paths as part of the evidence contract.
- If Vite evidence is needed, ensure the app uses webDebugVitePlugin in development only; never enable that plugin in production.
- Do not claim full React DevTools parity, distributed tracing, or full browser state/time-travel restoration from this workflow. The supported contract is bounded React/Vite/Next/browser evidence and safe action replay.
