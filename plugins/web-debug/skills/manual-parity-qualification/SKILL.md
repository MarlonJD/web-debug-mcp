---
name: manual-parity-qualification
description: Build traceable web qualification coverage from approved manual cases or source-backed product requirements using reviewed baselines, repository-native Playwright/API tests, coverage crosswalks, and run records. Use for manual-parity, multi-role journey, authorization-branch, and release-qualification requests; not for an isolated browser bug or an exact unit-test failure.
---

# Manual Parity Qualification

Build a reviewable qualification system around the target repository's native tests. This skill owns requirement discovery, review state, coverage mapping, execution policy, and truthful reporting. It does not turn Web Debug scenarios or JSON metadata into a second test runner.

## Route the request

- Use this skill for manual-test parity, role journeys, authorization or transition branches, coverage crosswalks, qualification campaigns, and durable run records.
- Keep executable selectors, actions, fixtures, API calls, assertions, data setup, and cleanup in the target repository's typed native test code.
- Use `web-debug-workflow` only when a native web test has a browser-grounded failure that needs DOM, console, network, framework-runtime, screenshot, debugger, replay, or geometry evidence. Web Debug diagnostics never award qualification PASS.
- Keep exact unit, integration, Go, Vitest, database, and repository-native Playwright failures on their native runner path when no browser symptom remains.

## Establish the baseline

1. Read the most local repository instructions and inspect the existing test stack before proposing a layout or command.
2. Gather authoritative sources: approved manual cases, product requirements, role/permission matrices, state-transition rules, API contracts, existing tests, and relevant incident or support records.
3. If approved manual cases do not exist, derive source-linked requirements and cases as `candidate`. Never promote your own generated baseline to `approved`; only an explicitly identified product/domain review can do that.
4. Record conflicts and missing expected behavior instead of inferring it from the current UI. A rendered implementation is evidence of current behavior, not automatically the requirement.

## Design qualification coverage

- Separate a short ordered golden journey from atomic branches. The golden journey is witness/smoke evidence; atomic authorization, transition, privacy, and no-drift branches are the principal correctness evidence.
- Give every source, requirement, manual case, actor, native test, and campaign a stable unique ID.
- Give every requirement source provenance, one canonical owning manual case, required evidence facets, review state, and mutation policy.
- Keep coverage, execution, and stability independent:
  - coverage: `full`, `partial`, `manual-only`, or `unsupported`;
  - execution: `passed`, `failed`, `inconclusive`, `blocked`, or `not-run`;
  - stability: `clean`, `flaky`, or `unknown`.
- Classify execution as `ui-required`, `api-only`, `contract-only`, or `manual-only`. API-only evidence cannot claim UI parity.

## WebMCP and hybrid cases

- A WebMCP-only contract case is `contract-only`; a journey that combines a WebMCP action with visible UI is `ui-required` and must include the `visible-ui` facet.
- Every attempted WebMCP mutation also requires an independent `api-readback`, `domain-state`, `history`, `audit`, or `outbox` facet. A tool's returned text is output, never the state oracle.
- Treat `readOnlyHint` as untrusted metadata. Direct WebMCP calls require explicit side-effect authorization, run once, are never retried into PASS, and are not replayable scenario actions. Timeout, rejection, origin drift, or disagreement is failed or inconclusive according to the native runner.
- Chrome may call `document.modelContext` directly in a target-owned native test. Safari without WebMCP uses the target repository's native Safari runner for the same visible journey. Web Debug/Safari MCP artifacts are diagnostic only and cannot award qualification PASS.

Before creating or validating qualification artifacts, read [references/artifact-contract.md](references/artifact-contract.md). Use its default layout only when the target repository has no stronger convention.

## Implement with native runners

1. Implement only approved requirements as gating native tests. Candidate test skeletons may be created when the user asks, but keep them non-gating and visibly candidate-only; do not create an official qualification run record until the baseline is approved.
2. Use isolated actor contexts, deterministic seed/reset evidence, unique execution namespaces, and the application's supported setup APIs or fixtures. Do not force state with browser storage or direct database mutation unless the repository's explicit test contract owns that setup path.
3. After a mutable UI action, use an authenticated API/domain read-back. For high-risk transitions, add independent history, audit, outbox, privacy, or read-only domain evidence when available.
4. Never blindly retry an ambiguous mutable action. Check its idempotency key, correlation/receipt, expected revision, or authoritative final state. Confirmed mutation evidence must name the same execution namespace and a digest-bound receipt/object correlation. Without evidence tying the observed state to the attempted action, record `inconclusive` and start a fresh execution namespace for any later rerun.
5. Keep screenshots, traces, logs, and Web Debug captures as artifact references. They support diagnosis and review but are not qualifying evidence facets by themselves.

## Validate and run

Run the bundled structural validator before the native suite and again against the final run record:

```bash
node <skill-dir>/scripts/validate-manual-parity.mjs \
  --root <project-root> \
  --qualification tests/manual-parity/qualification.json \
  --crosswalk tests/manual-parity/crosswalk.json \
  --run artifacts/manual-parity/runs/<run-id>.json
```

All paths must be relative to the explicit project root. The validator is read-only and proves structural consistency, not reviewer identity, artifact authenticity, or product correctness. The native test report and reviewed domain evidence remain authoritative.

Run the target repository's exact native commands. If a browser failure remains unclear, collect bounded Web Debug diagnostics, fix the product or test as authorized, rerun the native test, and keep the native result as the verdict.

## Report truthfully

- Report candidate, rejected, partial, manual-only, unsupported, blocked, inconclusive, flaky, and not-run items literally; do not remove them from the denominator to produce PASS.
- A parent manual case passes only when every linked non-rejected requirement passes with all required facets and clean stability.
- A campaign cannot pass when the baseline is unapproved, a required mutation is ambiguous, required evidence is missing, aggregate counts drift, or a linked requirement is not decisively clean.
- Distinguish locally verified qualification from release, production, remote-browser, real-device, or external approval evidence.

## Safety boundary

- Do not put credentials, cookies, tokens, raw storage state, fill values, or authorization headers in qualification JSON or run records.
- Do not add remote targets, production data, destructive setup, external messages, or release writes without the user's explicit authority and the target repository's matching safety contract.
- Preserve the Web Debug MCP's session-only scenario and loopback-first browser boundaries. Qualification metadata is not accepted by `web_repro_record` and must never be presented as a portable MCP scenario.
