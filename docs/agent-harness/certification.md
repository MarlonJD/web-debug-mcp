# Harness-Ready Certification

This repository adopts the harness-engineering v2 certification contract for the local developer tool. The bounded claim is `harness-ready`; it is not a production-readiness or provider-authentication claim.

## Ownership and commands

- Owner: Platform Engineering
- Project-native gate: `npm run harness:check`
- Manual maintenance command: `npm run harness:check`
- Maintenance trigger: manual revalidation before task completion and after repository-contract changes
- Evidence issuer: `local-platform-engineering`; this is a local observer label, not an external authority
- HMAC key custody: the caller controls an owner-only raw key outside the repository; the key is never committed or printed
- Optional production verifier: unavailable; this repository has no production deployment or provider trust root
- Escalation boundary: external CDP targets, credentialed browser profiles, hosted deployment, production approval, rollback authority, and destructive or external infrastructure changes require explicit user/provider authority. Exact-SHA GitHub release and reversible Codex marketplace/plugin updates are repository-owned release actions; the current task explicitly authorizes those release actions while deployment/production remain out of scope.

## Source and attestation lifecycle

Implementation, tests, the native gate, maintenance behavior, and this procedure belong to source commit `S`. The certification overlay is a single direct-child commit `A` containing only the configured coverage matrix, certification manifest, and referenced v2 HMAC evidence records. Every evidence record names `S`, while the verifier is invoked against trusted current `A`.

The coverage matrix must contain the complete canonical inventory and one explained `verified` or justified `N/A` status per row. Each such status links to exactly one fresh evidence record under `docs/agent-harness/evidence/`. Release/package/plugin mechanics are candidate until an authorized exact-SHA release run supplies evidence; deployment/production authority remains unavailable and all production authority fields remain `null`.

## Revalidation and limits

Run the native gate, deterministic tests, type/build checks, relevant live smokes, real tarball install, process cleanup checks, and the bundled read-only certification verifier before claiming the result. A valid HMAC proves consistency with the caller-selected key and repository manifest; it does not prove a provider event, human approval, deployment, rollback authority, or production identity. Any source change after the attestation commit invalidates the certification and requires a new source/attestation pair. The current external verifier also reports legacy completed-plan schema errors; this task records that as candidate harness-maintenance work rather than fabricating a fresh attestation.
