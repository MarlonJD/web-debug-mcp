# Manual-Parity Qualification Boundary

## Decision

The Web Debug plugin packages `manual-parity-qualification` and `webmcp-tool-authoring` as reviewed workflow skills. Manual parity turns approved manual cases—or source-backed candidate requirements when no approved manual baseline exists—into qualification metadata around repository-native tests. WebMCP authoring requires an approved capability and never self-approves production registration.

The target repository owns executable Playwright actions, selectors, actor fixtures, API/domain read-backs, data setup, assertions, reporters, and CI commands. The skill may create or update that native code when the user requests implementation, but JSON artifacts never dispatch browser or API actions.

Web Debug remains a bounded local browser-diagnostics provider. Its evidence can explain a native test failure, but it does not contribute a qualifying evidence facet and cannot award business PASS.

## Artifact boundary

Qualification uses three versioned, non-executable metadata documents:

- `qualification.json` records the reviewed baseline, sources, actors, requirements, manual cases, native test identities, and campaigns.
- `crosswalk.json` maps each manual case to requirements, native test identities, execution class, required facets, and coverage.
- a run record ties one native execution to the exact qualification catalog, baseline, and crosswalk digests and records independent per-case/per-requirement execution, stability, mutation proof, artifact references, and aggregate results.

The bundled validator checks structure, containment, references, required facets, mutation certainty, and aggregate arithmetic. It does not authenticate reviewers, attest build identity, inspect artifacts, or run tests.

## Review and verdict boundary

Generated requirements remain `candidate` until a named product/domain review explicitly approves or rejects them. Current UI behavior, an agent inference, a structural validator result, or Web Debug evidence cannot perform that promotion.

Coverage, execution, and stability remain separate. Partial, manual-only, unsupported, blocked, inconclusive, flaky, and not-run states stay visible. A parent manual case passes only when every linked non-rejected requirement passes with the required evidence and clean stability.

Ambiguous mutable actions are never retried blindly. Without a correlation, receipt, idempotency, revision, or equivalent authoritative link between the attempted action and observed state, the result is `inconclusive`; confirmed mutation evidence is bound to the run's execution namespace, and a later rerun uses a fresh namespace.

## Relationship to MCP scenarios

Qualification metadata is not scenario schema 6, is never imported by `web_repro_record`, and does not alter the session-only persistence decision. A WebMCP-only contract case remains `contract-only`; a hybrid WebMCP/UI case remains `ui-required` with `visible-ui` plus independent domain/API/history/audit/outbox evidence for mutations. The MCP continues to own bug reproduction, bounded browser evidence, and same-session post-fix verification. Repository-native runners continue to own durable regression and qualification execution; WebMCP output is never the mutation oracle.

## Revisit boundary

Create a separate qualification plugin or service only after multiple target repositories demonstrate a shared need for a durable campaign runtime, credential authority, remote browsers, hosted run storage, or generalized domain oracles. That change requires a separate product contract, threat model, lifecycle policy, and release decision; it must not be inferred from this skill.
