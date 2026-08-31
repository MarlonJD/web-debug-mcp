# Scenario Persistence Boundary

## Decision

Recorded reproduction scenarios remain session-owned and in-memory. `web-debug-mcp` does not generate, export, import, or execute portable YAML/JSON scenario files, and it does not provide a standalone or CI scenario runner.

Durable cross-session and CI regression coverage belongs in the repository's native test suite. The MCP workflow owns browser-grounded reproduction, evidence capture, and same-session post-fix verification; it does not become a second test framework.

The separately routed `manual-parity-qualification` skill may maintain reviewed baselines, crosswalks, and run records around those native tests. These JSON documents contain provenance, identifiers, mappings, and evidence references only. They are not MCP scenarios, contain no executable browser/API action language, and are never imported or run by `web-debug-mcp`.

## Rationale

- Private executable actions may contain fill/select values and exact query strings that public results must redact.
- Sanitized actions cannot always be replayed, so a public artifact would not be equivalent to the live private scenario.
- Safe cross-process reuse would require import authority, secret placeholders, schema migration, stable build identity, and recovery semantics.
- Repository-native runners already own durable test discovery, isolation, CI execution, reporting, and exit codes.

## Observable contract

- Public scenarios report `persistence: "in-memory"`.
- A scenario can be verified only in its owning live session with matching provenance.
- Closing the session purges private actions and retained evidence.
- Current documentation must not present recorded scenarios as YAML/JSON files or portable CI tests.
- Qualification metadata must remain non-executable and repository-owned; native tests remain the only durable execution path.

## Revisit boundary

Revisit this decision only for an explicit product requirement that justifies a separate security and lifecycle design. Any revision must define sensitive-input handling, import authority, schema/version policy, build provenance, deterministic runner behavior, and repository-native test ownership before implementation starts.
