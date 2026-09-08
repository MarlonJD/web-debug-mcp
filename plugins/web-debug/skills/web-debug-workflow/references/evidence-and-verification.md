# Evidence and verification details

Read the relevant section for framework, visual, replay, or repeated-verification work.

## Complex examples

Use the same evidence-first loop for bugs that cross multiple runtime surfaces:

### Stale React derived state

When an input changes but a filtered list remains stale, start with input state and visible DOM. Add React hook/render evidence if the cause remains unclear, or Vite evidence for a module/HMR question. Record the failing check, fix the dependency or state derivation, then require `web_fix_verify` to pass the same flow. That result completes those acceptance checks; additional replay or screenshots need a separate unresolved question.

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
