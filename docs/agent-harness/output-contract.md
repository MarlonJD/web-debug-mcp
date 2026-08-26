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
