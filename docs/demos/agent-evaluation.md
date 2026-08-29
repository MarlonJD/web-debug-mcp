# Agent task evaluation

`npm run eval:catalog` emits three frozen repair-task contracts. It does not call a model, edit a fixture, or mix agent latency with browser timing. Run each task against an isolated fixture copy, then record the model, reasoning setting, wall time, tool calls, input/output tokens, observed behavior, patch scope, root-cause explanation, and `web_fix_verify` result.

Save reviewed runs as schema-version-1 JSON and grade them with `npm run eval:grade -- <result.json>`. The grader validates bounded metrics, exact task behavior, exact patch-scope label, `verification.outcome`, and an explicit `rootCause.reviewed: true` decision. It returns per-run pass/fail plus literal `partial` or `complete` catalog coverage, missing/duplicate task IDs, and `suitePassed`; a single passing run is never presented as a passing three-task suite. The command exits non-zero when a supplied run fails. This is a grader for a trusted review record, not proof that the supplied patch or human review is authentic.

The deterministic graders remain repository-owned:

- `react-filter-stale-memo` must reproduce five stale rows and verify `Showing 1 incident` after the dependency correction.
- `react-latest-response-wins` must reproduce `Quote v1 applied` and verify that the latest request remains `Quote v2 applied`.
- `responsive-drawer-viewport` must reproduce the clipped layer and verify `coversViewport: true` at desktop and mobile sizes.

Root-cause quality still requires a human or explicitly recorded reviewer judgment. A successful browser check alone must not be relabeled as a correct diagnosis, and one model run is not a statistically powered benchmark.
