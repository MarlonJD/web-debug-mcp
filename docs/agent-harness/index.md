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
| [`certification.md`](certification.md) | Defines the v2 source/attestation lifecycle and authority boundaries |

The repository adopts the full HMAC-backed harness certification procedure, but certification is issued only for a fresh source/direct-child attestation pair. The local key is kept outside the repository and the overlay is generated only after the native evidence sweep. An approved external CDP host and provider-backed production authority remain separate and are not inferred from local smoke output.
