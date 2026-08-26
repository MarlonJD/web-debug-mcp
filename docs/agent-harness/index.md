# Agent Harness Map

This project uses a small adaptive harness. It makes the local MCP workflow, evidence shape, safety limits, and verification commands discoverable without claiming hosted or production certification.

| Authority | Purpose |
| --- | --- |
| [`config.json`](config.json) | Maps the adopted project authorities |
| [`registry.md`](registry.md) | Lists agent-callable commands and expected signals |
| [`environment-contract.md`](environment-contract.md) | Defines browser/session setup, isolation, artifacts, and cleanup |
| [`output-contract.md`](output-contract.md) | Defines evidence labels and handoff expectations |
| [`verification-matrix.md`](verification-matrix.md) | Selects checks by changed surface |
| [`operating-loop.md`](operating-loop.md) | Defines reproduce, inspect, change, and verify responsibilities |
| [`entropy-cleanup-checklist.md`](entropy-cleanup-checklist.md) | Keeps tools, docs, and evidence boundaries from drifting |

The full HMAC-backed harness certification profile is not adopted by this first commit. It would require a complete coverage inventory, trusted source/attestation commits, and fresh evidence records; none are being fabricated here.
