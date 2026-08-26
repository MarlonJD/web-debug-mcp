# Execution Plans (ExecPlans)

Use an ExecPlan for cross-cutting, risky, multi-hour, uncertainty-heavy, or context-loss-sensitive work. Keep the plan self-contained so implementation can resume without the chat transcript.

## Local contract

- The registry is [`exec-plans/index.md`](exec-plans/index.md).
- Active plans live under `exec-plans/active/`.
- Completed plans live under `exec-plans/completed/`.
- Use [`exec-plans/plan-template.md`](exec-plans/plan-template.md) for new plans.
- Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current.
- Record exact commands and observable signals in `Validation and Acceptance`.
- Keep unresolved follow-up work in the active plan or [`exec-plans/tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md).

## Completion boundary

Moving a plan to `completed/` requires all promised local behavior to be exercised, the repository-native checks to pass, and the plan registry to be updated atomically. This project does not claim production readiness from local checks; remote browsers, hosted MCP, credentials, release, and production authority remain separate scopes.
