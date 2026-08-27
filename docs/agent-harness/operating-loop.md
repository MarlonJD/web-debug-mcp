# Operating Loop

1. **Discover** — inspect the project with `web_project_detect`; record supported and unsupported capabilities.
2. **Start** — create one explicit local session with a loopback URL and an isolated launch whenever possible.
3. **Reproduce** — use small browser actions or a recorded scenario. Avoid exploratory actions that cannot be replayed.
4. **Capture** — call `web_issue_capture` at the failure point. Treat source locations and framework context as evidence only when the adapter returned them.
5. **Change** — the MCP server observes and verifies; code changes remain the responsibility of the coding agent and user-authorized workflow.
6. **Verify** — record the pre-fix flow with an explicit failure signature and acceptance checks, then replay the same session-bound scenario after the change. Interpret only `verified`, `failed`, or `inconclusive`; inspect rates, attempt summaries, freshness/provenance, and representative evidence.
7. **Close** — close the session and retain only the artifact paths needed for review.

## Escalation boundaries

Stop and report `blocked` when a browser target, secret, remote authority, production session, destructive operation, or product judgment is required. Return `inconclusive` when required evidence is unavailable/stale, provenance mismatches, or declared server/browser-state reset cannot be proven. Do not weaken the loop by silently enabling remote navigation, reading browser storage, or using an everyday authenticated profile.
