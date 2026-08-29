# Agent Output Contract

## Evidence bundle

Every tool advertises one output schema and, after input validation reaches its handler, returns `{ ok, data, error, artifacts, warnings }` under MCP `structuredContent`. `data` is authoritative; text content is a bounded preview. Requests rejected earlier by the MCP SDK use its protocol-validation error shape without tool `structuredContent`. Expected handler failures use `ok: false`, `isError: true`, a stable code, and no partial success data.

`web_issue_capture` returns a versioned evidence bundle under `data` with:

- project capabilities and warnings;
- session ID, target URL, isolation state, and artifact directory;
- bounded DOM summary and page text;
- bounded console and network metadata, with Safari network provenance disclosed as BiDi or Performance Resource Timing;
- screenshot path when capture succeeds plus an opaque `web-debug://artifact/...` resource; small pixels may also be inline;
- debugger pause reason, call frames, scopes, and redacted locals;
- explicit redaction policy and truncation warnings.
- a bounded `replay` timeline whose fill/select actions are sanitised and whose frames are inspectable or safely restorable through `web_replay_seek`.
- verification attempt frames are capture-only, carry `attemptId`, and are reset per attempt; ordinary manual action frames retain their existing restore behavior.
- actions and checks carry exact CSS/role/text/label/test-id locators; live semantic values come from fresh `probe` observations rather than DOM summaries.
- computed Chromium accessibility diagnostics are bounded and suggestions report `matchCount` plus `uniqueAtCapture` only. Named checkpoints and viewport matrices are nested lightweight summaries; auth-seeded captures disclose screenshot suppression.

Adaptive verification returns a versioned scenario/result contract with separate `failureSignature`, `acceptanceChecks`, and `regressionChecks`. Outcomes are exactly `verified`, `failed`, or `inconclusive`; the result carries canonical `level`/`requestedLevel` fields, total phase budgets, `escalations`, baseline and post-fix attempt summaries, decisive rates, environment fingerprint, sanitized contract hash, untrusted build references, reset/isolation facts, deferred five-second cleanup status, and bounded representative evidence under `evidence`. Required URL/DOM/console checks expose `pass`, `fail`, or `unavailable` together with `fresh`/`stale`/`unknown` freshness and provenance. No result contains raw fill/select values or a root-level legacy `passed`/`checks` field. Canonical data, preview, artifact blocks, and the complete MCP result are capped; overflow is an error rather than a truncated success.

The scenario/result contract is an MCP response for the owning live session, not a portable test artifact. The project intentionally has no YAML/JSON scenario export/import contract or standalone CI runner; repository-native tests own durable regression coverage.

## Handoff labels

| Label | Meaning |
| --- | --- |
| `verified locally` | The named command or local behavior was exercised in this environment |
| `not run` | The check was intentionally omitted and the reason is stated |
| `blocked` | A named browser, dependency, permission, or authority prevented progress |
| `candidate-only` | The implementation exists but lacks live or broader evidence |
| `release pending` | Local work is complete but no release/deployment evidence exists |

This project does not use `production-ready` for the first commit. Local test/build success is not production authority.

## Error response

Expected failures are returned as `isError: true` and `structuredContent.ok: false` with a stable `error.code` and bounded message. Error details are sanitized and omitted if they would exceed the result budget. Callers should use the code to recover rather than retrying blindly.
