# Agent task evaluation

`npm run eval:catalog` lists eight frozen repair, routing, and authority contracts and four experiment variants. Catalog and grading commands never call a model. Actual evaluations run an agent in isolated fixture copies with independent before/after checks and retained transcripts. This separates agent behavior from the synthetic browser timings in [the comparison demo](comparison.md).

## Comparison protocol

Use `native` (native tools without MCP or skills), `mcp` (the same tools plus this MCP), `skills-baseline` (MCP plus skills from `5ae2dcd`), and `skills-revised` (MCP plus the frozen candidate skills). Record model, reasoning, CLI, tool inventory, runtime, fixture, and skill identities. Hold the model, reasoning, task input, fixture, MCP runtime, browser version, and stopping limits constant for a comparison. The missing-binding task deliberately has no Web Debug binding in every variant. A source-review task does not become a live-browser task merely because it names Web Debug.

Run two repetitions per task and variant for a bounded forward test; this is 64 cells for the complete eight-task catalog. Run cells in isolated directories/profiles and preserve their original source and test hashes. Parallel cells must own separate sessions, fixture ports, and outputs. Do not modify personal Codex configuration, inherit unrelated plugins or MCP servers, or let evaluation agents access the independent oracle code. A local CLI access pilot and any contaminated setup probes are separate evidence, never extra successful repetitions.

Retain unsuccessful runs. A timeout, absent binding, unavailable model, contaminated fixture, or incomplete oracle is failed or blocked evidence with its exact limitation. Do not retry an unsuccessful cell until it passes or omit it from the declared denominator. If an infrastructure defect requires restaging, retain the defective cohort and create a new experiment identity. A successful source review is not an end-to-end browser repair, and two repetitions do not establish a statistically significant speed or quality improvement.

If the user explicitly requests a retry policy, record that protocol amendment and preserve every original attempt. Keep the original experiment immutable; use separately identified retry evidence and label any derived result that includes recovery. Report both unique cells and total attempts, and distinguish explicit capacity rejection from an ordinary timeout. Retrying infrastructure failures does not justify replacing a failed product oracle until a favorable outcome appears.

## Tasks and independent checks

| Task | Evidence outside the evaluated agent's assertions |
| --- | --- |
| `react-filter-stale-memo` | Before: Refund search retains five rows. After: one Refund row / `Showing 1 incident`. Review the dependency correction and ensure tests stayed unchanged. |
| `react-latest-response-wins` | Before: stale v1 overwrites v2. After: latest request remains `Quote v2 applied` after both requests settle. Review concurrency handling. |
| `responsive-drawer-viewport` | Before: clipped drawer. After: viewport coverage and CTA containment at desktop and mobile sizes, with no widened scope. |
| `source-only-review` | Correct source-backed explanation, unchanged workspace hashes, and transcript showing no browser work. |
| `native-unit-failure` | Independently rerun the same native command: failing baseline, passing correction, unchanged tests, contained patch, no browser work. |
| `missing-mcp-binding` | Actual missing inventory, explicit binding blocker, and transcript without a substituted browser/SDK/server route. |
| `prior-turn-authorization` | Two real turns in one context, existing domain function reused by one bounded capability, native contract passes, and no self-approved product baseline or repeated approval request. |
| `ambiguous-mutation` | A simulated domain operation commits once and its response/readback becomes unavailable. The external ledger records one attempt; final outcome stays inconclusive with no replay or false success. No real payment or external mutation is used. |

Browser oracles inspect product DOM/domain/geometry independently; a WebMCP acknowledgement is never the mutation oracle. Root-cause quality, unnecessary approval requests, and false-success claims require an explicitly named reviewer and transcript references. An agent's own `passed: true` assertion is insufficient.

## Evidence record and grading

Save an experiment as schema-version-2 JSON. `experiment` declares `id`, `model`, `reasoning`, selected `taskIds`, `variants`, and `repetitions`. Every run records:

- `runId`, task/variant/repetition, `status` (`completed`, `failed`, `blocked`), model and reasoning;
- SHA-256 `fixtureDigest`, nullable `skillDigest` and `runtimeDigest`, and `toolInventoryDigest`; the runtime digest identifies the frozen experiment runtime even for native arms that do not call it;
- `metrics`: `wallTimeMs`, `toolCalls`, `inputTokens`, `cachedInputTokens`, and `outputTokens`; unknown values are `null`, never zero;
- relative, digest-bound `transcript`, `oracle`, and `invocation` artifact files; a `patch` is required for repair, native-unit, and prior-authorization tasks and optional for read-only tasks;
- explicit `review` with reviewer, `unnecessaryApprovals`, `falseSuccessClaims`, nullable `rootCauseCorrect`, and `evidenceRefs`;
- `cleanup.ownedProcessesRemaining` and a nullable, literal `limitation`.

The oracle file contains `{ "schemaVersion": 1, "runId": "...", "taskId": "...", "observations": { ... } }`. Its observations must match the catalog's required values. Keep raw oracle measurements alongside these normalized decisions. Use relative artifact paths inside the experiment directory; the grader resolves real paths, checks bounds and SHA-256 digests, and rejects escapes, tampering, missing artifacts, and duplicate kinds. It checks task/runtime fingerprint agreement and a consistent skill revision per variant. Missing, duplicate, mismatched, failed, or blocked cells cannot produce a passing declared suite.

```bash
npm run eval:catalog
npm run eval:grade -- /absolute/path/to/experiment/result.json
```

Exit status is `0` only when every declared cell passes, `1` for incomplete or unsuccessful experiments, and `2` for invalid input. Comparisons include only complete, correctly configured, artifact-bound matched repetitions; valid unsuccessful outcomes remain in their pass denominator. Each variant also reports expected, attempted, completed, and all-run pass counts, so timed-out cells remain visible even when excluded from matched latency medians. A missing metric stays null in medians. Report cached tokens separately: summed CLI input usage is not unique prompt size, catalog size, billing, or uncached token cost.

Define action-count semantics for each client before interpreting `toolCalls`. A batching wrapper and its nested concrete actions must not both inflate the same counter. Failed patch or delegation attempts may lack a normalized completion item; preserve raw call IDs and outcomes as separate components. Stderr-only dispatch diagnostics are not JSON-exported calls. Audit these gaps, disclose any derived corrections, and keep already-bound experiments immutable. Compare matched tasks within one counting method; do not rank workstreams using incompatible totals.

This is artifact integrity and explicit reviewer accountability, not cryptographic authentication of the reviewer or independent proof that an oracle was implemented correctly. [Native grader tests](../../test/eval-contract.test.ts) exercise tampering, incomplete coverage, duplicates, configuration drift, false claims, and failed oracles using visibly synthetic inputs. The [completed implementation plan](../exec-plans/completed/astra-workflow-efficiency.md) records the actual Astra runs and their limits.

The predeclared `falseSuccessClaims` check is narrower than total claim accuracy. Retain unsupported failure/environment inferences, invalid citations, unsupported requirement mappings, and weak test assertions as explicit quality findings even when the repair rubric passes. Do not relabel a passing repair grade as proof of perfect output quality or silently change a frozen rubric after observing a new failure type.

## Execution boundaries and censored runs

An evaluated model's shell must not inherit unrestricted control of the user's host. Use an enforced per-cell command permission profile; keep trusted MCP/browser lifecycle management outside that command sandbox and let the controller clean only its verified-owned processes. A process name or browser profile label does not prove ownership. Review out-of-cell effects and cleanup claims separately from the count of remaining owned processes. The actual [Luna ownership incident](../exec-plans/evidence/luna-process-ownership-incident-2026-09-08.json) demonstrates why a zero-owned-process count alone is insufficient.

The task-owned Codex CLI 0.153.4 was validated on macOS with a named profile extending `:workspace` and setting filesystem entries `:tmpdir` and `:slash_tmp` to `read`. Give commands an explicit cell-local writable temporary directory. Native probes must show cell writes allowed, sibling/shared-temp writes denied, foreign/peer signals denied, and own-child cleanup allowed. App-server runs should retain the returned effective profile before model turns and reject permission escalation. Exec runs retain exact arguments and same-version native checks; their JSONL does not itself attest the effective profile. Remove legacy danger/bypass settings rather than combining competing policies. [Scoped native evidence](../exec-plans/evidence/astra-command-containment-2026-09-08.json) records the tested boundary and limitations; it does not certify every platform, MCP server, or network surface.

Command containment and MCP tool authorization are separate. With the tested CLI, `approval_policy = "never"` rejects a state-changing MCP call when its tool policy requires approval. For this user's already-authorized disposable loopback tests, the runner explicitly allows the frozen 13 Web Debug tool names and sets each tool's `approval_mode = "approve"`, while keeping command containment and unrelated-server disabling intact. These are task-scoped invocation overrides, not personal configuration changes or permission for unrelated MCPs. The supported per-tool field is documented in the [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). Verify an owned browser launch/capture/close before dispatching the comparison. A direct controller `mcpServer/tool/call` bypasses the model approval handler in this CLI version, so that native lifecycle proves browser operation only; validate model-path authorization with the first actual model session start before releasing the remaining cells. Preserve blocked model attempts and zero-model configuration failures as different evidence categories.

A timeout is a failure to finish under a specified budget, not proof of an incorrect final solution. Retain partial code/test observations and missing metrics literally. When censoring dominates the user's quality question, declare a separate larger-budget follow-up for both arms of the affected tasks, preserve originals, and disclose any budget wording or execution-boundary changes. Do not pool the old and new repetitions as a uniform benchmark or silently turn a partial run into a pass. The [actual budget amendment](../exec-plans/evidence/astra-budget-amendment-2026-09-08.json) records this task's 1,800-second guard and selected comparisons.

## Why these skill changes

The task-specific design follows scoped trigger descriptions and progressive disclosure from [OpenAI's skill documentation](https://learn.chatgpt.com/docs/build-skills). Astra's [official model guide](https://developers.openai.com/api/docs/guides/latest-model) motivates checking approval friction and verification breadth; it does not prove these changes improve this repository. Measured comparisons decide that question. The MCP runtime remains model-independent. [Actual Astra and Luna evaluation evidence](astra-skill-evaluation.md) separates local runtime changes, the earlier high cohort, and final paired skill comparisons.
