---
name: web-debug-workflow
description: Use when reproducing, inspecting, capturing, or verifying a bug in a running local web application with the bundled Web Debug MCP server.
---

# Web Debug Workflow

Use the bundled web-debug-mcp tools when a local web application needs browser-grounded evidence. The MCP server remains the execution boundary; this skill supplies the workflow and safety context.

## Workflow

1. Call web_project_detect with the current project root.
2. Start one explicit local session with web_session_start. Prefer a loopback URL and Chromium launch mode with an explicit executable path. For responsive bugs, pass a bounded `viewport` such as `{ "width": 390, "height": 844 }` and use isolated launch mode.
3. Reproduce the issue with bounded web_browser_action calls. Use web_breakpoint_set, web_debug_control, and web_debug_evaluate only when the evidence needs JavaScript debugger state.
4. Capture the failure with web_issue_capture. The result combines bounded browser, console, network, screenshot, debugger, framework, and replay evidence.
5. For React or Vite issues, inspect the automatic React bridge and Vite module/HMR evidence in the capture. For Next.js issues, use web_next_inspect only for route compilation or Server Action lookup. For visual issues, combine the screenshot with read-only geometry from web_debug_evaluate; do not use pixel output alone as the acceptance gate.
6. For a repeatable regression, store the flow with web_repro_record and rerun it with web_fix_verify after the code change.
7. Use web_replay_seek for one retained frame or safe action restoration. Treat it as bounded action replay, not application-state time travel.
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
- Missing optional framework or browser signals are capability warnings, not proof that the issue is absent.
- Treat redacted values, bounded arrays, and temporary screenshot paths as part of the evidence contract.
- If Vite evidence is needed, ensure the app uses webDebugVitePlugin in development only; never enable that plugin in production.
- Do not claim full React DevTools parity, distributed tracing, or full browser state/time-travel restoration from this workflow. The supported contract is bounded React/Vite/Next/browser evidence and safe action replay.
