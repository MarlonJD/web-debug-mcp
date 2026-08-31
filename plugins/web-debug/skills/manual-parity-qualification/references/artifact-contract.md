# Qualification Artifact Contract

Use this contract when creating or validating durable manual-parity metadata. It defines repository-owned, non-executable metadata around native tests; it does not define browser actions.

## Default layout

Prefer the target repository's established test and artifact conventions. When none exist, use:

```text
tests/manual-parity/
├── qualification.json
├── crosswalk.json
├── campaigns/
├── branches/
└── support/
    ├── actors/
    ├── adapters/
    └── oracles/

artifacts/manual-parity/runs/<run-id>.json
```

`campaigns/`, `branches/`, and `support/` contain typed native code. JSON contains identifiers, provenance, review state, mappings, and run observations only. Do not store selectors, locators, click/fill/evaluate commands, adapter IDs, API request bodies, SQL, or executable expressions in these JSON documents.

Run artifacts need not be committed. Follow the target repository's ignore, retention, access-control, and redaction policy.

## Shared limits and values

Schema version 1 accepts at most 500 entries in each catalog and at most 1,000 bounded errors from the validator. IDs use letters, digits, `.`, `_`, `:`, or `-`; strings and arrays are bounded. Digests are lowercase SHA-256 hex values.

Review states:

- `candidate`: source-backed but not yet approved; never gating and never eligible for PASS.
- `approved`: explicitly reviewed by a named product/domain authority against the baseline digest.
- `rejected`: reviewed and excluded with a reason; never counted as passing coverage.

Evidence facets:

- `visible-ui`
- `api-readback`
- `domain-state`
- `history`
- `audit`
- `outbox`
- `privacy`
- `human-witness`

Screenshots, traces, logs, reports, and Web Debug captures are artifacts or diagnostics, not evidence facets.

## `qualification.json`

The qualification catalog owns source provenance and canonical identities:

```json
{
  "schemaVersion": 1,
  "qualificationId": "account-qualification",
  "baseline": {
    "id": "manual-2026-08",
    "digest": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "review": {
      "status": "approved",
      "reviewedBy": "product-owner",
      "reviewedAt": "2026-08-30T20:00:00Z",
      "note": "Approved against the named manual revision."
    }
  },
  "sources": [
    {
      "id": "manual",
      "kind": "manual",
      "revision": "2026-08",
      "digest": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "location": "docs/manual-qualification.md"
    }
  ],
  "actors": [
    { "id": "account-manager", "purpose": "Owns the approved account workflow." }
  ],
  "nativeTests": [
    { "id": "qualification.account.create", "ref": "tests/manual-parity/campaigns/account.spec.ts" }
  ],
  "requirements": [
    {
      "id": "REQ-001",
      "title": "An authorized manager can create an account.",
      "sourceIds": ["manual"],
      "ownerCaseId": "E2E-001",
      "review": "approved",
      "reason": null,
      "requiredFacets": ["visible-ui", "api-readback"],
      "mutation": { "kind": "mutating", "receiptRequired": true }
    }
  ],
  "manualCases": [
    {
      "id": "E2E-001",
      "title": "Create an account through the visible workflow.",
      "sourceIds": ["manual"],
      "requirementIds": ["REQ-001"],
      "actorIds": ["account-manager"],
      "kind": "golden"
    }
  ],
  "campaigns": [
    {
      "id": "golden-account",
      "kind": "golden",
      "orderedCaseIds": ["E2E-001"],
      "nativeTestIds": ["qualification.account.create"]
    }
  ]
}
```

Every requirement must cite a source and one canonical owning manual case unless it is rejected. A requirement may support additional cases, but ownership remains singular. `review: "approved"` is valid only under an approved baseline. `receiptRequired` means a mutating PASS must carry confirmed mutation certainty in the run record.

For a source-derived baseline that has not been reviewed, use the exact candidate shape below and keep each derived requirement `review: "candidate"`:

```json
{
  "status": "candidate",
  "reviewedBy": null,
  "reviewedAt": null,
  "note": null
}
```

Do not create an official qualification run record before the baseline is approved. Candidate native test skeletons may run as exploratory development evidence, but their results remain outside the qualification ledger and cannot be relabeled as PASS.

Source kinds are `manual`, `prd`, `role-matrix`, `api-contract`, `state-model`, `existing-test`, `incident`, or `exploration`. Current UI exploration can create candidates but cannot approve them.

Manual-case kinds are `golden`, `atomic`, or `manual`. Golden campaigns keep an explicit case order. Atomic campaigns group independent branch tests; their native tests must create or select isolated product state rather than depend on a preceding golden step. A campaign's native test IDs must exactly equal the union owned by its ordered manual-case crosswalk rows.

Mutation kinds are `read-only` and `mutating`. A denied write attempt is still `mutating`: the request attempted to change state and its denial/no-drift outcome needs authoritative evidence. Use `receiptRequired: true` when PASS depends on a correlation receipt, idempotency result, expected revision, or equivalent proof tied to the execution namespace.

## `crosswalk.json`

The crosswalk has exactly one row per manual case:

```json
{
  "schemaVersion": 1,
  "qualificationId": "account-qualification",
  "qualificationDigest": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "baselineDigest": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "rows": [
    {
      "manualCaseId": "E2E-001",
      "requirementIds": ["REQ-001"],
      "nativeTestIds": ["qualification.account.create"],
      "executionClass": "ui-required",
      "coverage": "full",
      "requiredFacets": ["visible-ui", "api-readback"],
      "reason": null
    }
  ]
}
```

Coverage is `full`, `partial`, `manual-only`, or `unsupported`. Every non-full row requires a reason. `manual-only` must use the same execution class and require `human-witness`. `ui-required` must require `visible-ui`; `api-only` and `contract-only` cannot claim it. A full automated row needs at least one native test.

`qualificationDigest` is the SHA-256 of the exact `qualification.json` bytes. The row's requirement IDs must exactly match its manual case. Required facets must cover the union required by those requirements. Native test IDs are stable references to typed tests, not adapter-dispatch names, and each native test ID has exactly one owning manual-case row.

## Run record

A run record is immutable evidence metadata for one native execution:

```json
{
  "schemaVersion": 1,
  "qualificationId": "account-qualification",
  "qualificationDigest": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "baselineDigest": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "crosswalkDigest": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "run": {
    "id": "run-2026-08-30-001",
    "repositoryRevision": "git-sha-or-reviewed-build-id",
    "targetProfile": "local-dev",
    "datasetId": "seed-001",
    "executionNamespace": "account-run-001",
    "runner": {
      "name": "Playwright",
      "version": "project-owned",
      "command": "npm run test:manual-parity"
    },
    "startedAt": "2026-08-30T20:10:00Z",
    "completedAt": "2026-08-30T20:12:00Z"
  },
  "results": [
    {
      "manualCaseId": "E2E-001",
      "nativeTestIds": ["qualification.account.create"],
      "execution": "passed",
      "stability": "clean",
      "requirements": [
        {
          "requirementId": "REQ-001",
          "execution": "passed",
          "stability": "clean",
          "observedFacets": [
            { "kind": "visible-ui", "ref": "playwright-report/account-create", "digest": null },
            { "kind": "api-readback", "ref": "run-data/account-create.json", "digest": null }
          ],
          "mutationCertainty": "confirmed",
          "mutationEvidence": {
            "executionNamespace": "account-run-001",
            "correlationId": "corr-account-create-001",
            "objectRef": "account-001",
            "expectedRevision": "0",
            "receiptRef": "run-data/account-create-receipt.json",
            "receiptDigest": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            "idempotencyKeyDigest": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
          },
          "manualReview": null
        }
      ],
      "diagnostics": { "webDebugRefs": [] },
      "artifacts": [
        { "kind": "trace", "ref": "playwright-report/account-create.zip", "digest": null }
      ]
    }
  ],
  "summary": {
    "verdict": "passed",
    "requirements": { "passed": 1, "failed": 0, "inconclusive": 0, "blocked": 0, "notRun": 0 },
    "manualCases": { "passed": 1, "failed": 0, "inconclusive": 0, "blocked": 0, "notRun": 0 },
    "stability": { "clean": 1, "flaky": 0, "unknown": 0 }
  }
}
```

`qualificationDigest` and `crosswalkDigest` bind the run to the exact catalog and crosswalk bytes. They detect accidental drift; they are not attestations. Changing requirement approval, mutation policy, actors, sources, campaigns, or mappings invalidates the digest chain.

Execution is `passed`, `failed`, `inconclusive`, `blocked`, or `not-run`. Stability is `clean`, `flaky`, or `unknown`. Mutation certainty is `confirmed`, `ambiguous`, or `not-applicable`.

Every manual case has exactly one result and names exactly the native tests owned by its crosswalk row. It contains one nested result for every linked non-rejected requirement, so one requirement observation or native test cannot silently pass multiple cases. Requirement summary counts use the canonical owning case; supporting cases retain their independent evidence.

A nested requirement can pass only when the requirement and baseline are approved, all case/requirement facets are present, the case's native tests are named, and required mutation certainty is confirmed. Confirmed mutation certainty requires `mutationEvidence` bound to the run's `executionNamespace`; receipt-required PASS also needs a correlation ID, object reference, receipt reference, and non-null receipt digest. An ambiguous mutation must be `inconclusive`. Read-only requirements use `mutationCertainty: "not-applicable"` and `mutationEvidence: null`; a mutating requirement may use the same values only when it was `blocked` or `not-run` before the action was attempted. Manual-only PASS requires `human-witness` plus a named and timestamped `manualReview`.

Web Debug references appear only under `diagnostics.webDebugRefs`. They explain browser failures; they never satisfy a required facet or change a native result to PASS.

The validator recomputes each parent manual-case result, stability counts, and aggregate verdict. A parent with otherwise-passing but flaky/unknown children is `inconclusive`, not passed. Execution-state precedence is `failed`, explicit `inconclusive`, `blocked`, then `not-run`; only when every execution passed can unapproved/non-full coverage, missing evidence, or unstable results downgrade the aggregate to `inconclusive`. Stored case and summary values must equal the recomputed values exactly.

## Validator command

Use project-root-contained relative paths:

```bash
node <skill-dir>/scripts/validate-manual-parity.mjs \
  --root /absolute/path/to/project \
  --qualification tests/manual-parity/qualification.json \
  --crosswalk tests/manual-parity/crosswalk.json \
  --run artifacts/manual-parity/runs/run-2026-08-30-001.json
```

Omit `--run` while building the catalog and crosswalk. The validator provides structural-only assurance: a successful catalog validation reports whether the crosswalk is qualification-ready, and a successful run validation reports the recomputed verdict. Invalid input emits bounded JSON on stdout and exits non-zero. The validator does not run tests, authenticate reviewers, verify artifact contents, or approve external environments.
