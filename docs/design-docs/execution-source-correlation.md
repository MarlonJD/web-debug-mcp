# Execution and original-source correlation

Status: implemented in the local source checkout; release pending. These capabilities extend the existing 13 tools. Diagnostic objects carry their own `schemaVersion: 1`; the existing capture and verification contracts keep their current versions because their established field meanings are unchanged.

## User flow

1. Start an explicitly selected Chromium session.
2. Request `web_issue_capture` with `view: { profile: "include", surfaces: ["sources"] }`. Use an exact returned original source URL and script ID. Source names are identifiers, never permission to read a file.
3. Set `web_breakpoint_set` with `coordinateSpace: "original"`, `sourceUrl`, one-based `line`/`column`, and optionally `scriptId`. Multiple matches fail with `SOURCE_LOCATION_AMBIGUOUS`; missing or unsafe maps fail with `SOURCE_LOCATION_UNAVAILABLE`. Original breakpoints bind to an exact script and become stale after its context is destroyed. Set a new breakpoint for a replacement script; no automatic rebinding is claimed.
4. For one diagnostic action, call `web_browser_action` with `diagnostics: { coverage: true, settleMs: 250 }`. Omitting diagnostics leaves this instrumentation off. Selecting diagnostics without `coverage: true` observes request initiators only. `settleMs` is a post-action observation period from 0 to 5000 ms, not a readiness assertion. The operation has a 15-second diagnostic deadline in addition to the request deadline.
5. Inspect the returned diagnostic window or capture the `execution` surface. Request capture `delta` to compare retained errors, endpoint counts/failures/pending requests, React commits/changed keys, and observed execution locations. Selected delta surfaces also limit the explanatory differences.
6. Reproduce and verify normally. `web_fix_verify` never enables precise coverage. Its `differences` object explains observations; only existing failure signatures, acceptance checks, regression checks, freshness and quorum rules determine the verdict.

Safari reports `sourceMapping` and `executionCoverage` as unsupported and rejects diagnostic actions before running the action. Generic browser behavior is unchanged.

## Source identity and coordinate semantics

Only scripts proven to belong to the selected main frame's default execution world and selected HTTP(S) origin are admitted. Script identity includes the CDP script ID and producer hash; repeated URLs retain distinct identities. Context destruction/clearing purges mappings and text. Original breakpoints reject ambiguous source names rather than choosing a basename or a guessed local path.

Public line and column coordinates are one-based. CDP offsets and columns are UTF-16 code units. Coverage end offsets are exclusive. Inline script resource start coordinates are accounted for, including CRLF. A mapped range reports the original position of its start; it does not claim the complete generated range corresponds to one contiguous original range.

Inline JSON source maps and same-origin external maps are supported. External map lookup uses no cookies or authorization, rejects redirects, retains TLS validation, and first checks the current generated resource against exact CDP source text to reject stale generated resources after HMR. The map remains producer-supplied metadata, not authenticated proof of a build. Sectioned maps, malformed segments, excessive maps, synthetic names authorizing HTTP requests, missing worlds, and missing mappings remain explicitly unavailable. Original `sourcesContent` is discarded.

Limits: 200 admitted scripts and 4M UTF-16 units of map declarations, eight cached maps/texts, 512 KiB per map HTTP response, 512K UTF-16 units per CDP text, 120K encoded mapping characters, 50K generated lines, 100K decoded segments, 1000 source names, and 10K map names. Inventory returns at most 20 scripts and 30 original names per script. Application script URLs are prioritized over known Vite/vendor paths when output is bounded. Truncation is explicit.

## Observation and correlation

One window enables the Network domain and, only when selected, the Profiler precise-coverage mode. It starts before the action and includes the requested post-action settling interval. It records the backend coverage timestamps separately from local window timestamps. Backend counter intervals may extend across command acknowledgement time.

Requests are limited to the selected main frame and origin. Local monotonic receipt times describe request start/completion observations; a CDP initiator ties a request to an observed script location. The action relationship is labeled `temporal-window`, not causal. Where React development instrumentation exists, commit-count samples bracket the diagnostic operation. They do not establish which request caused which commit. Async-parent traversal, event-listener tracing, workers, child frames, and distributed tracing are not implemented.

The window retains at most 30 requests, 12 scripts, 12 functions per script, eight ranges per function, 64 ranges total, and 60 KiB of diagnostic data before existing envelope budgets. Reused/redirected request IDs are omitted with an incompleteness marker rather than combining unrelated hop metadata. Missing coverage is unknown; function-only coverage does not establish branch execution. Counts of overlapping ranges must not be summed, and counts do not establish execution order. Precise coverage changes JIT/timing behavior and is unsuitable as the sole confirmation of a timing fix.

Success, failure, cancellation, and uncertain profiler startup all run bounded cleanup. Stop/disable commands each have an independent one-second cleanup bound. Unconfirmed cleanup returns `DIAGNOSTIC_CLEANUP_FAILED`, makes the session unusable, and requires close. The adapter retries cleanup on close. No successful result claims cleanup while it remains unconfirmed.

## Evidence differences and redaction

Differences retain at most 20 entries per category and explicitly name unavailable execution comparisons. They compare retained observations, not full-history equivalence. Capture cursors retain bounded sanitized summaries and are rescrubbed when a new private input is registered. Verification differences never override the acceptance verdict.

Typed diagnostic leaves are redacted separately so the generic depth limiter cannot turn a coverage range into a string. Private inputs are subsequently removed across the complete result. Source bodies, response bodies, and original `sourcesContent` are never exported. Session close purges the diagnostic window and source caches. This increment adds neither scenario serialization nor portable evidence export.

## Verification

- `test/source-correlation.test.ts`: mapping, UTF-16/CRLF offsets, world/origin admission, HMR identity, missing/unsafe/stale/oversized maps, coverage/request association, cancellation, and failed cleanup.
- `test/behavior-difference.test.ts`: bounded diagnostic differences, selected-surface scope, missing coverage, and pending request semantics.
- Existing manager/routing/schema tests cover Safari rejection, session quarantine, capture cursors, and unchanged verification decisions.
- `npm run smoke:source-correlation`: an owned loopback fixture with minified TSX checks original breakpoints, mapped request initiators, execution ranges, semantic capture differences, script replacement, and actual fix verification without coverage.
- `npm run smoke:react-vite`: existing React/Vite behavior plus diagnostic coverage, bracketed React commit counts, application-source mapping, and HMR source identity.

No agent speedup, token reduction, cross-browser debugger parity, or release publication is claimed by these local checks. The existing reviewed agent evaluation remains the route for measuring diagnosis quality and tool/token costs.
