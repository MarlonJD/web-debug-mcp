# Agent Harness Map

This project uses a small adaptive harness. It makes the local MCP workflow, evidence shape, safety limits, and verification commands discoverable without claiming hosted or production certification. The repository now records the remaining certification inputs explicitly rather than treating local checks as external authority.

| Authority | Purpose |
| --- | --- |
| [`config.json`](config.json) | Maps the adopted project authorities |
| [`registry.md`](registry.md) | Lists agent-callable commands and expected signals |
| [`environment-contract.md`](environment-contract.md) | Defines browser/session setup, isolation, artifacts, and cleanup |
| [`output-contract.md`](output-contract.md) | Defines evidence labels and handoff expectations |
| [`verification-matrix.md`](verification-matrix.md) | Selects checks by changed surface |
| [`operating-loop.md`](operating-loop.md) | Defines reproduce, inspect, change, and verify responsibilities |
| [`entropy-cleanup-checklist.md`](entropy-cleanup-checklist.md) | Keeps tools, docs, and evidence boundaries from drifting |

The full HMAC-backed harness certification profile is not asserted by this repository yet. The bundled verifier still reports `CERT001` until a caller supplies the external owner-only HMAC key and the direct-child attestation overlay with fresh v2 evidence records. An approved external CDP host and provider-backed production authority are also unavailable in this environment; neither is inferred from local smoke output.
