# Examples and evidence

`web-debug-mcp` changes web debugging from “I can reproduce the symptom” to “I can reproduce it, connect the runtime cause, apply a bounded fix, and prove the same flow passes afterward.”

## What changes with the MCP

Without the MCP, an engineer usually moves between browser DevTools, React DevTools, a Vite or Next terminal, source files, screenshots, and a handwritten reproduction. Each surface may be useful, but the correlation is manual and the post-fix check is easy to perform differently from the original reproduction.

With the MCP, the workflow is one bounded chain:

```text
project detect → isolated browser session → reproduce → capture evidence
              → record the flow → fix → replay the same flow → verify
```

The result is not “more logs.” It is a redacted, bounded evidence bundle with a retained replay timeline, framework context where available, and explicit pass/fail checks.

## Examples

| Example | What is broken | What the baseline sees | What MCP adds | Fixed result |
| --- | --- | --- | --- | --- |
| Vanilla validation | Invalid payment amount | `Invalid amount` and one console error | DOM, console, network, screenshot, debugger snapshot, redacted replay input | The validation flow remains reproducible without storing the entered value |
| React render diagnosis | A form submission changes component state | The button result and source text | Hook changes, commit timeline, inferred `renderCause: state`, flamegraph, Vite module graph | The same recorded scenario passes with no console errors |
| Next Server Action | Client request must be explained across browser and server | A `POST` and separate manifest/log entries | Route metadata, bounded log tail, request traces, action resolution, and linked `Next-Action` span | The action flow and server trace are verified together |
| React filter repair | `useMemo` ignores query/status dependencies | Search input says `Refund`, but five rows remain | Failed pre-fix check plus `IncidentDashboard` hook/render evidence and replay frames | Exact temporary dependency fix produces `Showing 1 incident` |
| Async quote repair | Older quote response overwrites newer response | Two clicks end at `Quote v1 applied` | Repeated flow, React state timeline, Vite/module evidence, and semantic failed check | Latest-request guard keeps `Quote v2 applied` |
| Responsive drawer repair | Drawer starts below the topbar | Screenshot shows the drawer/backdrop clipped after scroll | Desktop/mobile viewport sessions, bounding geometry, screenshots, replay, and no-regression checks | `coversViewport: true` at `1440×900` and `390×844` |

## Concrete evidence

The complex repair demos intentionally run buggy and fixed variants in an isolated temporary copy. Representative evidence looks like this:

```json
{
  "buggy": {
    "bugReproduced": true,
    "rootCauseEvidence": true,
    "fixVerified": false
  },
  "fixed": {
    "bugReproduced": false,
    "fixVerified": true
  }
}
```

For the responsive drawer, the geometry changes from:

```json
{
  "viewport": "390x844",
  "before": { "layerTop": -444, "coversViewport": false },
  "after": { "layerTop": 0, "coversViewport": true, "drawerInsideViewport": true }
}
```

For the async quote, the deterministic schedule is request 1 at `220 ms` and request 2 at `35 ms`. The buggy code applies both responses; the fixed code ignores the stale response whose request number is no longer current.

## Why use it

Use it when the bug crosses more than one debugging surface or when the fix must be trusted later:

- A console error alone does not explain which React state or server request caused the visible result.
- A screenshot alone does not prove the same interaction still works after a code change.
- A manual reproduction does not provide a stable regression contract for another engineer or agent.
- Separate framework tools create context switching and duplicated MCP catalogs.

The MCP is especially useful for React/Vite state and HMR issues, Next.js request/action problems, browser regressions, responsive layout bugs, and handoffs that need evidence another person can inspect.

## Run the examples

```bash
WEB_DEBUG_CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run demo:compare
```

Targeted repair runs:

```bash
npm run demo:compare -- --scenario=complex-logic-fix --runs=3
npm run demo:compare -- --scenario=complex-async-fix --runs=3
npm run demo:compare -- --scenario=visual-layout-fix --runs=3
```

The output reports median/p90 machine timings, evidence coverage, screenshots, buggy reproduction, root-cause evidence, and fixed-flow verification. It does not claim a human diagnosis time or that the MCP is always faster for a trivial DOM change.

For the raw timing methodology and Sol/Luna QA notes, see [`docs/demos/comparison.md`](demos/comparison.md).
