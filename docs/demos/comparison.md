# Before/after debugging demo

`npm run demo:compare` runs the same local browser scenarios through two paths:

1. a baseline using raw Playwright plus direct fixture/source inspection;
2. the `web-debug-mcp` `SessionManager` workflow.

The baseline is deliberately MCP-free. It represents the browser, source, manifest, and log surfaces that an engineer would otherwise have to inspect and correlate separately. It is a repeatable machine baseline, not a claim that every human DevTools session takes the measured number of milliseconds.

The runner calls `SessionManager` directly because it is the deterministic core behind the public MCP facade. The sequence is the same public workflow—detect/start, bounded actions, evidence capture, recorded scenario, and verification—without making the benchmark dependent on a particular MCP client or its transport overhead.

Fixture readiness and teardown use the same bounded process helper as live smokes: early exit is an error, SIGTERM is awaited, and SIGKILL escalation applies only to the command-owned child.

## Run it

The command requires the repository dependencies and an explicit Chromium executable. It runs all scenarios three times by default:

```bash
WEB_DEBUG_CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run demo:compare
```

Run one scenario, change the repetition count, or request machine-readable output:

```bash
npm run demo:compare -- --scenario=react-vite --runs=5
npm run demo:compare -- --scenario=complex-async-fix --runs=3
npm run demo:compare -- --scenario=visual-layout-fix --runs=3
npm run --silent demo:compare -- --scenario=next --runs=1 --json
```

Supported scenarios are `vanilla`, `react-vite`, `next`, `complex-logic-fix`, `complex-async-fix`, `visual-layout-fix`, and `all`. The fixture servers use demo-only ports `4183` through `4188`; override the scenario-specific environment variables in `scripts/demo-compare.mjs` when necessary.

## What each example demonstrates

### Vanilla payment validation

The flow fills an invalid amount and submits it. The raw path can see the invalid status, console error, network requests, and source branch. The MCP path also returns a single redacted evidence bundle and a replay timeline whose form value is sanitized.

### React state and render cause

The flow submits the React form. The raw path can confirm the DOM result and inspect `App.jsx`, but it cannot infer the live component hook change or whether the render was state-, prop-, or parent-driven without another runtime tool. The MCP path reads the injected development bridge and reports component state, commit summaries, render cause, flamegraph data, and the Vite module graph together.

### Next.js Server Action linkage

The flow checks the health route and submits the Server Action. The raw path observes browser requests and can inspect the generated manifest and server log separately. The MCP path adds Next route metadata, bounded log context, request insights, normalized request traces, Server Action resolution, and the matching trace linked to the observed `Next-Action` request.

### Complex React filter repair

The dashboard searches for `Refund`, but the buggy `useMemo` has an empty dependency list. The raw path sees the input value and stale `Showing 5 incidents` result. The MCP path records a failing pre-fix check, the `IncidentDashboard` hook change and state render cause, the replay frames, and then verifies `Showing 1 incident` after the exact dependency fix.

### Out-of-order async quote repair

Two quote requests are fired in rapid succession with deterministic delays: request 2 resolves before request 1. The buggy path ends at `Quote v1 applied`; the fixed path ignores the stale response and remains at `Quote v2 applied`. The report separates buggy reproduction, root-cause evidence, patch application, and fixed-flow verification.

### Responsive drawer visual repair

The incident drawer is intentionally positioned below the topbar. Baseline and MCP captures run at `1440×900` and `390×844`. Before the fix, the geometry reports `coversViewport: false`; after changing the layer to `position: fixed; inset: 0`, both sizes pass the viewport invariant. The screenshots are kept as before/after artifacts, while the geometry check remains the deterministic gate.

## Repair report semantics

Repair scenarios use an isolated temporary copy of `fixtures/complex-vite`, so the demo can switch between the buggy and fixed source without touching the working tree. The report has four separate outcomes:

- `bugReproduced`: the baseline and MCP flows observed the intended buggy result;
- `rootCauseEvidence`: MCP runtime evidence connected the changed state or broken geometry to the symptom;
- `fixVerified`: the same recorded flow passed after the exact temporary patch;
- `visual`: desktop/mobile viewport invariants and before/after screenshots for the layout case.

The MCP repair details also print the adaptive outcome/level, `escalations`, baseline and post-fix decisive rates, environment fingerprint, sanitized contract hash, untrusted build-reference values, canonical `evidence` availability, and deterministic truncation flags. A missing optional browser/framework signal stays a warning; it is never promoted to `verified`.

Repair runs fail with a non-zero exit status if any of those required outcomes is false. This keeps a semantic verification failure visible to CI and to model QA instead of treating a generated report as success.

The async scenario uses deterministic delays (`220 ms` for request 1 and `35 ms` for request 2), and waits for the explicit `All quote requests settled` marker, so `Quote v1 applied` is the buggy result and `Quote v2 applied` is the fixed latest-request-wins result. It declares async/timing risk, exercising the standard repeated-level baseline and post-fix state machine. The filter scenario expects `Showing 1 incident` after entering `Refund`; the buggy empty `useMemo` dependency list leaves all five rows visible. MCP repair views include the canonical adaptive level, baseline/post-fix attempt counts and rates, sanitized contract hash, untrusted build-reference state, and evidence flags.

## How to read the report

The report separates browser/session startup from the useful flow. For each path it records the median, p90, minimum, and maximum for each phase. Repair scenarios additionally report whether the buggy state was reproduced, whether root-cause evidence was present, whether the fixed flow passed, and— for the visual scenario—whether desktop and mobile geometry remained valid.

A positive timing delta means the structured MCP workflow added overhead in that scripted run. That is expected for a trivial browser-only check. The product value is the correlation and repeatability: one bounded result can be inspected, redacted, replayed, and checked again after a code change.

The output stores screenshots under a temporary directory and prints its path when the serialized handle is safe. Repair scenarios copy the complex fixture to a temporary runtime, apply the buggy/fixed variants there, and leave the repository source unchanged. Repair baseline and MCP before/after screenshots are centralized under that artifact directory; if a fill value collides with a generated handle, the MCP handle is null with a warning and the session-owned file is not copied. Fixture servers and browser sessions are closed when the run completes.

## Example output shape

The default output is Markdown for a quick comparison. Add `--json` for automation:

```json
{
  "results": [
    {
      "title": "React state and render-cause diagnosis",
      "baseline": {
        "method": "raw Playwright + direct fixture/source inspection",
        "summary": { "total": { "median": 123.45 } }
      },
      "mcp": {
        "method": "web-debug-mcp SessionManager workflow",
        "summary": { "total": { "median": 156.78 } }
      },
      "comparison": {
        "addedEvidence": ["reactRuntime", "renderCause", "flamegraph", "replay"]
      }
    }
  ]
}
```

Human diagnosis time still needs a separate usability study with a fixed task script and several participants. This command provides the reproducible technical baseline needed before making that claim.

## Model comparison

The repository does not call language models itself. `npm run eval:catalog` emits the frozen repair prompts, graders, and required run fields; `npm run eval:grade -- <result.json>` scores a bounded reviewed run record. To compare agent behavior, run each prompt against isolated fixture copies and record the model name, reasoning setting, wall time, tool calls, token counts, patch result, root-cause result, and `web_fix_verify` result separately from the browser timings. Do not mix those results with the technical baseline above.

In the final one-run QA sweep for this repository, both arms passed the deterministic gates and all three repair contracts. Sol `xhigh` completed the valid command sweep in about 30.77 seconds; Luna `max` completed it in about 30.82 seconds after one transient port-collision retry. Their repair measurements were close and not directionally consistent: Sol was lower on the filter diagnosis and visual fix verification, while Luna was lower on the async diagnosis and visual diagnosis. This is an engineering QA comparison, not a statistically powered model benchmark; correctness, semantic repair status, and source-snapshot integrity matter more than these single-run milliseconds.
