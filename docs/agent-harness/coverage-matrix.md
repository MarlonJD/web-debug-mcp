# Harness Engineering Coverage Matrix

Use this matrix to prove that the repository implements every applicable harness-engineering capability. A document name alone is not evidence.

The attested source and direct-child commits are recorded in certification.json and Git parent history; this matrix is valid only with the current direct-child attestation.

Revalidated after the public README and GitHub repository metadata positioning update.

## Status contract

- `verified`: the artifact and behavior were exercised with recorded evidence. For bundled harness-certification checks, link the status cell to exactly one fresh HMAC-consistent v2 evidence record bound to the source commit, repository identity, and stable harness evaluation target. This is not external authentication.
- `candidate`: the proposed implementation exists but has not been exercised.
- `blocked`: a named dependency or authority prevents completion.
- `N/A`: the capability is genuinely irrelevant, with a written reason. For bundled harness-certification checks, link the status cell to exactly one fresh HMAC-consistent v2 applicability record.

## Coverage

| Source principle or capability | Repository implementation | Required evidence | Status and reason |
| --- | --- | --- | --- |
| Humans set intent; agents execute within authority | [`operating-loop.md`](operating-loop.md) and product sources | Named human judgment boundaries and one completed task trace |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-01.json)|
| Break large goals into reusable design, code, review, test, and verification steps | [`../PLANS.md`](../PLANS.md) and active ExecPlans | A restartable plan with independently verified milestones |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-02.json)|
| Agents can self-review and respond to feedback | [`operating-loop.md`](operating-loop.md) and [`output-contract.md`](output-contract.md) | Review command/process plus resolved finding evidence |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-03.json)|
| Application behavior is directly readable | [`environment-contract.md`](environment-contract.md) | Reproduced UI/API/CLI behavior with observed before/after evidence |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-04.json)|
| Logs, metrics, and traces are queryable when relevant | [`environment-contract.md`](environment-contract.md) and [`registry.md`](registry.md) | Project-appropriate query and correlated result, or justified N/A |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-05.json)|
| Repository knowledge is the durable record | [`../index.md`](../index.md) | Canonical links resolve and key decisions do not depend on hidden conversation context |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-06.json)|
| Repository tools and authorized work context are directly invocable | [`registry.md`](registry.md) | A repository-local script/skill and relevant source-control, review, or CI query can be discovered and exercised, or each is justified N/A |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-07.json)|
| Dependencies and abstractions remain agent-legible | [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md), [`registry.md`](registry.md), and checked-in references or fixtures | Important upstream behavior has a discoverable contract and executable proof; any local reimplementation has a recorded tradeoff |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-08.json)|
| `AGENTS.md` is a concise map, not an encyclopedia | [`../../AGENTS.md`](../../AGENTS.md) | Scannable canonical routes before the effective byte cutoff plus root-to-working-directory instruction-chain evidence where nested files exist |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-09.json)|
| Plans are versioned living artifacts | [`../PLANS.md`](../PLANS.md) and [`../exec-plans/index.md`](../exec-plans/index.md) | Active/completed lifecycle and a plan with current progress/decisions/evidence |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-10.json)|
| Architecture and critical taste boundaries are mechanical | [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) and project-native checks | A documented invariant with an actionable failing and passing check |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-11.json)|
| Local autonomy exists inside enforced central boundaries | [`operating-loop.md`](operating-loop.md) and repository instructions | Clear allowed actions, escalation gates, and recovery path |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-12.json)|
| Verification proves working behavior, not only code changes | [`verification-matrix.md`](verification-matrix.md) | Exact commands plus user-visible or operational acceptance evidence |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-13.json)|
| Failures and review judgment feed back into the harness | [`operating-loop.md`](operating-loop.md) | One example promoted to docs, a test, linter, runbook, or debt item |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-14.json)|
| Entropy and technical debt are continuously controlled | [`entropy-cleanup-checklist.md`](entropy-cleanup-checklist.md) and [`../exec-plans/tech-debt-tracker.md`](../exec-plans/tech-debt-tracker.md) | Dated sweep evidence and bounded follow-up |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-15.json)|
| Autonomy increases only after test, review, recovery, and escalation loops exist | [`operating-loop.md`](operating-loop.md), [`registry.md`](registry.md), and [`output-contract.md`](output-contract.md) | Evidence for the granted level and explicitly unavailable higher levels |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-16.json)|
| Merge throughput policy matches project risk | CI/review policy and [`../SECURITY.md`](../SECURITY.md)/[`../RELIABILITY.md`](../RELIABILITY.md) | Project-specific gate rationale; no copied low-blocking default |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-17.json)|
| Release, deployment, and production actions require repository-local authority | [`operating-loop.md`](operating-loop.md), [`output-contract.md`](output-contract.md), and approval policy | An exercised repository-local gate that denies unauthorized actions, plus documented approval, escalation, and rollback paths; or a fresh justified N/A when the repository has no such action. When `--require-production-attestation` is requested, additionally require provider-authenticated authority, rollback, and audit evidence and do not use N/A |N/A — This repository owns no release or deployment action, so production authority is not applicable. [evidence](evidence/row-18.json)|
| Repository-specific OpenAI examples are treated as options, not universal mandates | Case-study decision ledger below and architectural decisions | Every listed choice has its own status and project-specific reason |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-19.json)|

## Case-study decision ledger

These rows prevent OpenAI's implementation choices from being either copied blindly or skipped silently. Give each choice an independent status and reason.

| OpenAI case-study choice | Local decision or implementation | Required evidence | Status and reason |
| --- | --- | --- | --- |
| Zero human-authored code as an operating constraint | Repository-specific decision is recorded in certification.md. | Explicit responsibility model; if adopted, provenance covers product code, tests, CI, documentation, internal tools, evaluation harnesses, review artifacts, repository scripts, release tooling, and dashboard definitions |N/A — Zero-human-authored-code provenance is not a project requirement. [evidence](evidence/row-20.json)|
| Reported repository size, pull-request throughput, elapsed-time speedup, and long agent-run duration as targets | Repository-specific decision is recorded in certification.md. | Project goal, if any, uses outcome and quality measures rather than copied vanity or duration metrics |N/A — Case-study size, throughput, speedup, and duration metrics are not project success criteria. [evidence](evidence/row-21.json)|
| Local and cloud agent review loops continue until reviewers are satisfied while human review is optional | [`operating-loop.md`](operating-loop.md) and review policy | Project-specific reviewer independence, stopping condition, human gate, failure handling, and one exercised review trace |N/A — Cloud review and human-optional approval are not adopted by this local package. [evidence](evidence/row-22.json)|
| Per-worktree application isolation | [`environment-contract.md`](environment-contract.md) | Collision-free setup/reset/teardown proof or a safer local isolation model |N/A — Worktree provisioning is outside this repository scope; session isolation is documented separately. [evidence](evidence/row-23.json)|
| Per-worktree observability stack | [`environment-contract.md`](environment-contract.md) | Isolated signal correlation and cleanup proof, shared-stack alternative, or justified N/A |N/A — A persistent per-worktree observability stack is not owned here. [evidence](evidence/row-24.json)|
| Chrome DevTools Protocol for UI control | [`environment-contract.md`](environment-contract.md) and [`verification-matrix.md`](verification-matrix.md) | Browser-flow evidence through the selected project tool, or justified N/A |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-25.json)|
| Victoria Logs, Metrics, and Traces with LogQL/PromQL/TraceQL | [`environment-contract.md`](environment-contract.md) and [`registry.md`](registry.md) | Queries through the project's actual telemetry system, or justified N/A |N/A — Victoria telemetry is not part of this local MCP package. [evidence](evidence/row-26.json)|
| OpenAI's fixed layered domain architecture | Configured architecture authority and project-native checks | Project-specific dependency model and executable boundary evidence; do not copy layer names by default |N/A — The OpenAI case-study layer model is not a repository requirement. [evidence](evidence/row-27.json)|
| Reimplementing upstream dependency behavior locally | Configured architecture authority, decision record, and tests | Tradeoff covering inspectability, maintenance, security, licensing, and compatibility |verified — Fresh local command and repository evidence were observed. [evidence](evidence/row-28.json)|
| Minimally blocking merge gates and short-lived pull requests | CI/review policy and risk documents | Project-specific failure cost, recovery, and follow-up rationale |N/A — Hosted merge throughput policy is not owned by this local package. [evidence](evidence/row-29.json)|
| Scheduled Codex documentation gardening and quality-scoring agents open targeted repair pull requests | [`entropy-cleanup-checklist.md`](entropy-cleanup-checklist.md), quality/debt records, and external-write policy | Cadence, read/write authority, review/merge gate, rollback, and one observed maintenance trace; otherwise justified N/A |N/A — Scheduled external documentation automation was not requested or configured. [evidence](evidence/row-30.json)|
| Automated merge and agent-authored release tooling | CI/review policy, release tooling, and [`operating-loop.md`](operating-loop.md) | Project-specific automation and gate rationale; do not infer deployment or production authority |N/A — Automated merge, release, deployment, and production tooling is outside this local package. [evidence](evidence/row-31.json)|

Review this matrix after major architecture, CI, runtime, or agent-workflow changes. Do not mark the harness complete while an applicable row is missing evidence.

Revalidated after packaging the standalone stdio MCP binary and documenting Codex and Claude Code installation.

Revalidated after adding the GPL-3.0-or-later license to the source and package metadata.
