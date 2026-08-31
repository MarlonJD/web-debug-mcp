# Agent Harness Map

This project uses a small adaptive harness. It makes the local MCP workflow, evidence shape, safety limits, and verification commands discoverable without claiming hosted or production certification. Repository-local certification is recorded separately from hosted or provider-backed authority.

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

The repository adopts the full HMAC-backed harness certification procedure. The checked-in source/direct-child evidence window belongs to release `0.4.0` and is historical after final `0.5.0` and `0.6.0` changes. The native gate checks structure, ancestry, hash, expiry, and worktree state but intentionally does not authenticate the HMAC; no current `CERT000` is claimed until a separately authorized owner-key overlay is created and verified. An approved external CDP host and provider-backed production authority remain separate and are not inferred from local smoke output.
