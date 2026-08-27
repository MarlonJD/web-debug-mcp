# Agent Output Contract

## Evidence bundle

`web_issue_capture` returns a versioned JSON bundle with:

- project capabilities and warnings;
- session ID, target URL, isolation state, and artifact directory;
- bounded DOM summary and page text;
- bounded console and network metadata, with Safari network provenance disclosed as BiDi or Performance Resource Timing;
- screenshot path when capture succeeds;
- debugger pause reason, call frames, scopes, and redacted locals;
- explicit redaction policy and truncation warnings.
- a bounded `replay` timeline whose fill actions are sanitised and whose frames are inspectable or safely restorable through `web_replay_seek`.
- verification attempt frames are capture-only, carry `attemptId`, and are reset per attempt; ordinary manual action frames retain their existing restore behavior.

Adaptive verification returns a versioned scenario/result contract with separate `failureSignature`, `acceptanceChecks`, and `regressionChecks`. Outcomes are exactly `verified`, `failed`, or `inconclusive`; the result carries canonical `level`/`requestedLevel` fields, total phase budgets, `escalations`, baseline and post-fix attempt summaries, decisive rates, environment fingerprint, sanitized contract hash, untrusted build references, reset/isolation facts, deferred five-second cleanup status, and bounded representative evidence under `evidence`. Required URL/DOM/console checks expose `pass`, `fail`, or `unavailable` together with `fresh`/`stale`/`unknown` freshness and provenance. No result contains raw fill values, a root-level legacy `passed`/`checks` field, or more than 256 KiB of serialized JSON.

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

Expected failures are returned as `isError: true` with a stable `code` and a bounded message. Callers should use the code to recover rather than retrying blindly. Unknown failures must retain their error message without exposing secrets.
