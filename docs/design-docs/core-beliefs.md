# Core Engineering Beliefs

| Belief | Why it matters here | Observable implication | Mechanical support |
| --- | --- | --- | --- |
| One MCP facade, optional internal adapters | Tool catalogs are part of agent context and should not duplicate overlapping debug servers | Codex sees a small stable workflow while framework support grows behind interfaces | Public tool-name check in `scripts/harness-check.mjs` |
| Evidence before diagnosis | A screenshot or error string alone does not establish the source of a frontend failure | Issue capture joins runtime, debugger, DOM, console, and network data with warnings | `EvidenceBundle` contract and session tests |
| Bounded and redacted by default | Browser state can contain credentials and large object graphs | Every exposed field has a bound or redaction path | `src/core/redaction.ts` and regression tests |
| Reproduce and verify on the same flow | A plausible fix is not proof that the original behavior changed | Recorded actions and checks produce an observable local verdict | `web_repro_record` and `web_fix_verify` |
