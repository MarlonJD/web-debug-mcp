<!-- harness-plan:v1
id: adaptive-flake-verification
status: completed
created: 2026-08-27
updated: 2026-08-27
completed: 2026-08-27
owner: Platform Engineering
-->

# Make reproduction and fix verification adaptive and flake-aware

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). This is the durable implementation record for strengthening `web_repro_record` and `web_fix_verify`; it is separate from the original MVP plan because the work changes the scenario, lifecycle, adapter, evidence, fixture, and harness contracts together.

## Purpose / Big Picture

Make local bug reproduction and post-fix verification trustworthy when browser or framework behavior is asynchronous, timing-sensitive, concurrent, stateful, or intermittently observed, without charging deterministic fixes for repeated full captures. The default path performs one bounded pre-fix attempt and one bounded post-fix attempt. The workflow escalates to repeated standard or strict verification only when the caller declares a relevant risk, an attempt returns a transient/readiness signal, observations conflict, or the scenario already demonstrated flakiness.

The user-visible result is no longer an ambiguous `passed` boolean. Every recorded scenario separates the pre-fix failure signature, post-fix acceptance checks, and regression guardrails, and every verification returns exactly one evidence-backed outcome: `verified`, `failed`, or `inconclusive`. A fix can be `verified` only when the stored pre-fix phase reliably reproduced the named original failure and every required post-fix attempt passed. The result reports the effective verification level, escalation reasons, environment fingerprint, per-attempt summaries, observed rates, isolation/reset truth, and only the bounded representative evidence needed to explain the outcome.

## Progress

- [x] (2026-08-27 16:32Z) Read the repository instructions, documentation map, architecture, planning contract, active MVP ExecPlan, security/reliability boundaries, harness contracts, scenario implementation, browser adapters, fixtures, smokes, and deterministic tests; confirm the working tree is clean on `main`.
- [x] (2026-08-27 16:32Z) Save this initial active ExecPlan and register it before implementation.
- [x] (2026-08-27) Obtain independent read-only reviews from `gpt-5.6-sol` at `xhigh` and `ultra`; neither reviewer changed files or started runtime processes.
- [x] (2026-08-27) Revise the plan for valid findings covering verdict order, escalation, cancellation/deadlines, MCP timeouts, per-session concurrency, retention/redaction, exact attached-target ownership, tri-state evidence availability, provenance semantics, and deterministic readiness.
- [x] (2026-08-27) Implement the revised session-owned scenario, adaptive orchestration, fresh-attempt, evidence, schema, fixture, documentation, and harness contracts in the local working tree.
- [x] (2026-08-27) Run focused deterministic coverage, full repository gates, proportional live browser/framework/replay/comparison smokes, cleanup checks, and record literal unavailable evidence.
- [x] (2026-08-27) Complete the final read-only Sol xhigh correction pass: require authoritative post-fix evidence, evaluate the complete failure signature, preserve private raw replay URLs, bound late adapter work, remove compatibility aliases, scrub nested fill values, and add deterministic acceptance-path coverage.
- [x] (2026-08-27) Complete the second focused correction pass: make checks-only snapshots framework-light, isolate optional enrichment deadlines, reset verification replay per attempt with capture-only frames, remove screenshot copying, strengthen in-memory MCP cancellation assertions, and rerun the full local/live/demo evidence sweep.
- [x] (2026-08-27) Complete the final narrow network-evidence correction: retain the adapter-owned network buffer only through the current attempt's authoritative capture while keeping checks-only responses empty, add deterministic fresh-buffer/representative-retention coverage, and rerun the final verification sweep.
- [x] (2026-08-27) Final Sol xhigh implementation review accepted the completed behavior; all promised local acceptance evidence and repository-native checks are recorded below, with production/remote authority remaining out of scope.

## Surprises & Discoveries

- The current `web_repro_record` only stores actions and one undifferentiated `checks` array. It does not execute or retain a pre-fix reproduction, while `web_fix_verify` runs the scenario once and returns one `passed` boolean. Therefore the current API can call a fix verified even when the original failure was never observed.
- Scenarios are intentionally in-memory. This makes durable cross-session reuse unavailable, but it also avoids persisting raw fill actions or sensitive browser evidence. A bounded JSON scenario artifact would require an explicit import/export path, stable build identity, sanitised inputs that cannot be replayed, and a new recovery contract. That cost does not materially improve the requested same-workflow regression proof, so this plan does not add persistence.
- Isolated Chromium launch creates a fresh Playwright browser context, but current verification reuses the same adapter/context for every run. Attached Chromium uses an existing profile, and Safari WebDriver always uses a visible non-isolated Safari profile. Repeated attempts therefore need an explicit reset contract and truthful capability output.
- `BrowserAction.wait` currently permits a selector-less, text-less delay in Chromium, and the Next and complex async demos use bare 500 ms/350 ms waits. The complex async fixture itself is deterministic, but its final assertion still waits by elapsed time instead of an observable settlement condition.
- Every current verification capture includes screenshot, DOM, console, network, React, Vite, Next, and replay evidence. Repeating that whole bundle would multiply work and output; retries need lightweight observations plus one representative full bundle per decisive phase/result.
- The bundled plugin currently enforces a 60-second tool timeout, which cannot contain a 120-second strict phase plus cleanup. The plugin, README, and harness assertion must move together to a 150-second ceiling, and caller cancellation must reach active adapter/framework work.
- Current sessions have no operation lease, scenarios are globally uncapped, raw fill actions are returned from `ReproScenario`, and close leaves scenario/session records retained. Adaptive retries would amplify all four problems unless they are corrected in the same milestone.
- Safari can return an empty console array while BiDi console collection is unavailable, and Chromium can return last-known DOM/React state while paused. Checks therefore need structured `pass | fail | unavailable` observations with freshness/provenance; an empty or stale source is not proof.
- (2026-08-27) A first live adaptive result exceeded the aggregate budget because the same framework evidence was exposed through two representative aliases. The correction keeps one canonical enumerable `evidence` bundle and trims Next traces before pruning. Artifact paths remain session-owned; a path collision with a fill value returns a bounded warning and a null handle rather than copying the screenshot elsewhere.
- (2026-08-27) The correctness review found that a healthy post-fix anchor was being treated as a continuing failure and that raw private query URLs were being replayed after sanitization. The state machine now evaluates the complete polarity-aware failure signature, while the private raw URL is separate from the public query-free scenario URL; simple evidence smokes use direct capture rather than claiming regression verification.
- (2026-08-27) A late-completion review found that an adapter promise could outlive a cancelled lease. Lease-owned pending work is now bounded before release; interrupted work poisons and boundedly closes the owned adapter, while attached browser processes remain untouched.
- (2026-08-27) The correction suite now exercises both scenario tools over an in-memory MCP transport, including SDK cancellation, legacy-shape rejection, raw URL replay, dynamic DOM-id/error/framework redaction, target-identity policy, candidate startup failure, concurrent close, and the 256 KiB truncation path.
- (2026-08-27) The complex async repair now waits on an explicit `All quote requests settled` marker and declares async/timing risk, exercising two baseline matches and three post-fix passes on fresh launch-owned Chromium attempts.
- (2026-08-27) The required Safari smoke reached WebDriver DOM/screenshot and Performance Resource Timing evidence but did not receive a BiDi console event. It is recorded as `status: blocked` with the exact `noConsoleErrors` guardrail limitation; no pass was inferred.
- (2026-08-27) Checks-only observations were still collecting optional React state and retaining network entries. The adapter contract now explicitly suppresses screenshots, React/framework bundles, and network retention for repeated checks-only attempts; manual capture opts into observer retention only when it needs the following full evidence bundle.
- (2026-08-27) Optional React/Vite/Next enrichment can outlive a short request budget or fail independently of browser checks. Child contexts now bound optional work and convert local timeout/unavailability into warnings while preserving an actual caller cancellation as cancellation; browser-only verification remains decisive when its required surfaces are fresh.
- (2026-08-27) Verification replay previously duplicated full browser state for every scenario action. Attempt-scoped replay now clears frames while preserving monotonic indices, annotates frames with `attemptId`, and retains one lightweight capture frame per attempt; ordinary manual action replay remains restorable only when no fill or capture-only frame is involved.
- (2026-08-27) Screenshot redaction no longer copies artifacts into arbitrary temporary or repository paths. A fill collision omits only the serialized screenshot handle with a bounded warning and leaves the original session-owned artifact untouched; the in-memory MCP cancellation test observes adapter cancellation and unusability before close.
- (2026-08-27) Suppressing network from checks-only snapshots initially also cleared the adapter buffer before authoritative capture, removing current-attempt async/Server Action linkage. Verification checks now request an empty returned network surface while retaining the adapter buffer until the same attempt's full capture; observer reset before the next attempt prevents discarded retries from accumulating.

## Decision Log

- Decision: Extend only `web_repro_record` and `web_fix_verify`; add no public MCP tool. Rationale: the existing facade already owns scenario recording and verification, and repository evidence does not justify another catalog entry. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Replace the legacy scenario `checks`/verification `passed` contract rather than add a compatibility path. Rationale: the repository explicitly rejects backward-compatibility layers, and keeping both shapes would preserve the ambiguity this work removes. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Keep scenarios and pre-fix evidence in memory and do not create a durable JSON artifact. Rationale: same-process record/fix verification is sufficient, while safe cross-session reuse needs sensitive-input, import authority, schema migration, and build-identity decisions beyond the smallest reliable implementation. Results must state `persistence: "in-memory"` and never imply cross-session reuse. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Make quick verification the default and treat level escalation as a recorded policy decision. Rationale: deterministic fixes should pay for one attempt; async, timing, concurrency, state leakage, prior flakiness, transient readiness failures, or conflicting observations justify extra attempts. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Start a fresh adapter before each attempt only for launch-owned Chromium. Rationale: a new launch-mode Chromium adapter creates a fresh process/context and therefore fresh cookies, local/session storage, HTTP cache, service-worker registrations, viewport, and navigation history. Attached Chromium and Safari retain the exact selected target, reset only owned observers/navigation, and continue to report that profile/storage/cache/service-worker isolation is unavailable. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Remove bare timed browser waits from the scenario schema and live flows. Rationale: readiness must be observable through selector visibility or bounded text state. Poll intervals inside an observable deadline remain implementation detail; they are not scenario sleeps. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Retain lightweight summaries for every attempt and full evidence only for representative attempts. Rationale: rates and conflicts require per-attempt facts, but repeating screenshots and framework bundles harms latency and output bounds without improving the verdict. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Use a per-session exclusive operation lease and propagate the MCP request `AbortSignal` plus one absolute monotonic deadline through adapter start, actions, checks-only observation, full capture, and React/Vite/Next enrichment. Rationale: adapter replacement, replay reset, and evidence attribution cannot be safe under concurrent mutation or caller cancellation. Competing mutations return `SESSION_BUSY`; close signals cancellation and waits only for bounded cleanup. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Replace an adapter only for launch-owned Chromium. Rationale: reconnecting attached Chromium can select `contexts()[0]/pages()[0]`, mutate the wrong tab, or leak an unmanaged context. Attached Chromium and Safari keep the exact selected transport/target, clear only adapter-owned observers, navigate same-origin, and disclose that browser profile state is not fresh. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Keep executable scenarios private and return only a sanitised public scenario. Rationale: raw fill values are required for in-memory replay but must not appear in scenario results, fingerprints, attempt summaries, errors, or evidence. Scenarios become session-owned, capped, byte-bounded, and purged on close. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Separate `environmentFingerprint`, sanitised `contractHash`, and untrusted `buildReference`. Rationale: a caller label is not an authenticated build identity, the fixed build is expected to differ, and a session marker must not be presented as a build hash. Cross-session baseline reuse remains unavailable. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Use an ordinary SHA-256 hash of the canonical sanitised contract, not a process-keyed HMAC. Rationale: persistence and cross-process authenticity are intentionally absent; replacing fill values and reducing URLs before hashing removes secret-bearing material, while an HMAC would add key lifecycle without strengthening the session-bound contract. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Treat only the evidence surfaces implied by current checks as decisive. Rationale: `urlContains`, `textContains`, and `noConsoleErrors` require fresh URL, DOM, and available console observations respectively. React/Vite/Next and screenshots enrich representative evidence but do not change a browser-only verdict when unavailable. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Use one canonical public shape with `risks`, object `buildReference`, `termination`, `level`, `escalations`, and `evidence`; do not retain compatibility aliases. Rationale: duplicate wire fields and overloads make redaction, bounds, and consumer behavior ambiguous, and repository instructions reject speculative compatibility layers. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Make the entire failure signature, including `expected: "pass"` and `expected: "fail"` entries, the original bug predicate. Rationale: a mixed signature is meaningful only when every expected polarity matches; healthy anchors belong in acceptance checks or direct evidence smokes, not as a continuing bug claim. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Keep the raw scenario URL private and expose a query-free public URL. Rationale: executable replay needs the caller's exact URL, but serialized scenarios, hashes, and provenance must not disclose query values. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Make checks-only snapshots explicitly browser-check-only and retain observer data only for a following full/manual capture. Rationale: repeated verification needs fresh URL/DOM/console observations, not screenshots, React/framework inspection, or accumulated network bundles; manual replay/capture can opt into the retained observers it needs. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Run optional framework and screenshot enrichment in bounded child contexts. Rationale: a local enrichment timeout or unavailable adapter must not consume or abort the root verdict budget; only the required browser capture and checks determine the verification outcome, while genuine caller cancellation still propagates. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Reset verification replay at each attempt and store one capture-only frame with monotonic provenance. Rationale: per-action duplication multiplies full state and obscures attempt attribution; manual action replay keeps its existing behavior, while verification capture frames fail closed for restore. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Keep representative screenshot artifacts in their per-session directory and omit only a colliding serialized handle. Rationale: copying to arbitrary `/tmp` or repository paths violates artifact ownership and multiplies files; redaction safety is preserved without moving or duplicating the original artifact. Date/Author: 2026-08-27 / Platform Engineering.
- Decision: Retain network observer state only between a verification checks-only observation and that attempt's authoritative full capture. Rationale: checks must remain lightweight and return no network bundle, while the selected representative still needs current-attempt request evidence for async and Server Action correlation; the next attempt's observer reset bounds discarded state. Date/Author: 2026-08-27 / Platform Engineering.

## Review Reconciliation

Both reviewers' correctness findings are incorporated: repeated-level verdicts are no longer attempt-order dependent; quick/standard/strict transitions and decisive observation quorums are explicit; budgets are total from phase start and include fresh startup; SDK cancellation reaches transport/framework operations; session mutation is serialized; attached target identity is preserved; server state is not called browser isolation; availability is tri-state; full evidence re-checks the authoritative state; terminal mismatch/error evidence is retained; scenarios/results have aggregate caps and lifecycle cleanup; fingerprints do not hash raw inputs or overstate caller-supplied build labels; and every unconditional smoke/test sleep in scope is replaced with an observable condition or fake scheduler.

No reviewer justified a new public tool or persistent scenario file, so both remain rejected. Reviewer A's process-keyed HMAC suggestion is also rejected for the reason in the Decision Log. Polling itself is retained when it polls a named condition under the shared deadline; only unconditional elapsed-time waits are removed.

## Context and Orientation

`src/index.ts` owns the MCP Zod schemas and annotations. `src/domain/types.ts` owns the public scenario, fingerprint, attempt, and verification result types. `src/core/session-manager.ts` owns scenario storage, replay, session lifecycle, evidence composition, and verification orchestration; it must remain the policy boundary. `src/adapters/browser.ts` is the reset/attempt boundary. `src/adapters/chromium.ts` can provide true fresh-attempt isolation only for launch mode. `src/adapters/safari.ts` can create a new WebDriver session but cannot claim a fresh profile. `src/core/redaction.ts` and `src/core/evidence.ts` remain the final redaction/bounding boundary.

Deterministic orchestration coverage belongs in `test/session-manager.test.ts` with scripted fake adapters. Public shape coverage belongs in `test/mcp-server.test.ts`. Adapter isolation/capability truth belongs in Chromium/Safari policy tests. The existing `fixtures/complex-vite` async quote flow is the live state-sensitive repair target; `scripts/demo-compare.mjs` already copies and patches it in a temporary directory. React/Vite, Next, Safari, vanilla, replay, and comparison smokes are the proportional live gates. The architecture, security, reliability, README/skill, and harness documents must describe the final behavior without claiming hosted, remote, production, or browser parity.

## Adaptive Verification Contract

Define three fixed profiles. Limits are total-from-phase-start ceilings, not additive retry grants, and apply independently to `web_repro_record` and `web_fix_verify`. Adapter startup, actions, checks-only observation, authoritative capture, and required evidence composition are inside the phase budget. Cleanup has a separate five-second ceiling and is reported rather than counted as verdict time.

| Level | Maximum attempts | Wall-clock budget | Decisive requirement |
| --- | ---: | ---: | --- |
| `quick` | 1 | 15 seconds | One low-risk baseline signature match or one post-fix pass/fail |
| `standard` | 3 | 60 seconds | Two matching baseline failures; post-fix requires all three passes or two matching failures |
| `strict` | 5 | 120 seconds | Two matching baseline failures; post-fix requires all five passes or two matching failures |

Raise the bundled MCP tool timeout to 150 seconds so strict verification plus bounded cleanup can return normally; update `.mcp.json`, README, and the harness assertion atomically. The MCP handler passes the SDK request `AbortSignal` and a monotonic absolute deadline through `SessionManager`, adapter start/preparation, every action, checks-only observation, authoritative capture, React/Vite/Next enrichment, and response composition. Each operation caps itself by the remaining time. Abort/deadline completion must settle or forcibly close owned work before another attempt starts. Caller cancellation returns a stable cancelled/inconclusive result when an evidence-backed verdict does not already exist.

### Scenario and provenance shape

`web_repro_record` becomes an executing, non-idempotent operation and requires `sessionId`, `name`, `url`, `actions`, a non-empty `failureSignature`, a non-empty `acceptanceChecks`, optional `regressionChecks`, optional risk signals, optional requested level, and optional bounded/redacted `buildReference`. A failure-signature entry pairs an existing scenario check with expected state `pass` or `fail`, so it names the actual bug signature without adding overlapping check kinds. The tool always commits one session-owned scenario after the baseline phase completes with `baseline.status: reproduced | not_reproduced | inconclusive`, then returns its sanitised public view. Only `reproduced` permits post-fix verification.

The manager stores a private executable scenario with raw fill values and returns a public scenario whose fill values are replaced. Raw actions are absent from contract hashes, attempt summaries, evidence, errors, and every MCP response. `web_fix_verify` accepts the bound `sessionId`, `scenarioId`, optional requested minimum level, and optional bounded post-fix build reference. No scenario can move to another session or process. Close, failed start, and `closeAll` purge its private actions and evidence.

Provenance is split into:

- versioned `environmentFingerprint`: canonical project root/descriptor, safe URL origin/path, browser engine and version when available, adapter mode, exact attached target identity, remote/isolated flags, viewport, Node version, platform, and architecture;
- `contractHash`: SHA-256 of canonical scenario structure with fill values replaced and URLs reduced/redacted;
- `buildReference`: `{ source: "caller" | "unavailable", value?: string }`, explicitly untrusted and never called an authenticated build identity.

Baseline reuse requires the same live session, matching contract hash, matching stable environment projection, the original target identity for attached mode, and intact representative pre-fix evidence. The historical pre-fix and current post-fix build references are reported separately and are not required to equal because the fix is expected to change the build. If no caller reference exists, the result says build identity is unavailable and relies only on session-bound provenance; it never claims cross-session/build authentication. Any required mismatch short-circuits `web_fix_verify` to `inconclusive` with a stable mismatch code and no browser actions.

### Escalation and verdict state machines

Quick is the default. Declared `async`, `timing`, `concurrency`, or `browser-state-leakage` starts at standard; `prior-flakiness` starts at strict. Declared `server-state-leakage` requires an explicit observable reset action/condition supplied by the scenario; otherwise the phase is immediately inconclusive because browser restart does not reset application/database state. Declared browser-state leakage on attached Chromium or Safari is likewise inconclusive because profile isolation is unavailable.

Classify attempt termination explicitly:

- `decisive-match` / `decisive-non-match`: all required check sources were fresh/available and the signature or acceptance result is known;
- `retryable`: neutral readiness timeout, transient owned-browser disconnect/startup failure, or other stable allowlisted transport code;
- `permanent`: invalid/policy-blocked action, origin violation, unavailable required capability, cancellation, or contract error;
- `budget-exhausted`: the shared absolute deadline cannot support the next bounded operation.

A neutral readiness wait observes flow completion, not the accepted value; expected behavior belongs in checks. Quick retryable termination promotes to standard with the first attempt/time already consumed. Standard baseline conflict or continued retryable transport instability promotes to strict with all attempts/time already consumed. Baseline conflict may continue only until strict's ceiling can decide whether the failure was observed at least twice; it records `flaky: true`. Permanent, cancelled, or exhausted phases do not retry. Post-fix pass/fail conflict never promotes: it stops `inconclusive`/flaky because later passes cannot establish all-pass verification.

Baseline state machine:

- Low-risk quick `decisive-match` => `reproduced`; quick `decisive-non-match` => `not_reproduced` and final verification is `inconclusive` without post-fix work.
- Repeated levels require two `decisive-match` observations. Two matches can terminate early as `reproduced`; any match/non-match mix marks the baseline flaky and escalates to/continues under strict until the match quorum or ceiling. Fewer than two matches at limit/budget => `not_reproduced` when observations were decisive, otherwise `inconclusive`.

Post-fix state machine is order independent:

- Quick pass => `verified`; quick decisive fail/original-signature match => `failed` immediately.
- Standard/strict verify only when every scheduled decisive attempt passes acceptance and regression checks.
- At repeated levels, the first decisive failure requires one more decisive attempt. A second matching failure => `failed` with early termination; a pass/fail mix in either order => `inconclusive`, `flaky: true`, and immediate termination.
- Any permanent, unavailable, cancelled, exhausted, or insufficient-decisive result => `inconclusive` unless a prior two-failure quorum already established `failed`.

Rates are explicit fractions over decisive observations: failure-signature matches/decisive baseline observations and post-fix passes/failures/decisive post-fix observations. Retryable, unavailable, cancelled, and exhausted counts are reported separately and never hidden in a pass-rate denominator.

### Isolation, observation, evidence, and retention

Each session has an exclusive verification lease. A competing action/capture/record/verify mutation returns `SESSION_BUSY`; status remains readable. Close/closeAll signal the active lease, wait for bounded cleanup, then purge. For launch-owned Chromium, start the candidate adapter with original URL/executable/headless/viewport under the deadline, atomically swap only after success, and then close the prior owned adapter. A failed candidate leaves the prior session usable and records an inconclusive attempt. This fresh launch can claim new browser process/context, cookies, local/session storage, HTTP cache, service-worker registrations, viewport, and navigation state, but never application/server/database state.

Attached Chromium and Safari reuse the exact selected adapter/target; they never reconnect through an arbitrary first context/tab. They clear only adapter-owned console/network/replay observers, perform same-origin navigation, and report browser profile/storage/cache/service-worker isolation as unavailable. They never create, clear, close, or navigate a different user-owned target. Multi-tab/no-page identity policy is covered deterministically.

Checks use a current, checks-only observation whose URL, DOM, and console surfaces each report `available`, `fresh`, and provenance. `textContains` is decisive only with fresh DOM; `noConsoleErrors` is decisive only when console collection is available, so Safari without BiDi cannot pass it from `[]`. Optional React/Vite/Next/screenshot enrichment runs only for representative evidence under the remaining deadline and returns warnings when unavailable.

When an attempt is selected as representative, perform one full capture with the same `attemptId`, re-evaluate all decisive checks from that capture, and make it authoritative. If state drifts between lightweight and full observations, treat it as a conflict/inconclusive signal. Retain one full pre-fix representative (first authoritative signature match, or terminal mismatch/error when no match exists) and one post-fix representative (failure/conflict or final pass). Other attempts retain summaries only. Each summary bounds phase/ordinal/timestamps/elapsed, state, check counts, stable redacted error, reset/isolation facts, and observations.

Enforce `10` scenarios per session, `5` attempt summaries per phase, `8` representative replay frames, `500` characters per observed value/error, and a deterministic `256 KiB` serialized verification-result budget with structured truncation flags and pruning of optional enrichment before decisive evidence. Keep replay indices monotonic across attempt resets and add `attemptId`; sensitive fill restore remains fail-closed. Purge scenarios/evidence on close/failed start/closeAll. Redact/bound all known and unknown MCP error messages/details before serialization.

Remove selector-less/text-less `wait` from Zod, domain/core validation, and adapters. Observable polling intervals are allowed only inside a named condition and shared deadline. The complex async fixture exposes both-request settlement independent of which quote won; Next exposes hydration and request-settled markers independent of the accepted health value; React/Vite replaces its post-resume 150 ms sleep with an observable DOM/commit condition. No orchestration test uses real elapsed sleeps: use an injected monotonic clock/scheduler or fake timers.

## Plan of Work

### Milestone 1: Scenario and public API contract

Add verification levels, split state-leakage risks, baseline status, result outcomes, tri-state/freshness observations, environment fingerprints, sanitised contract hashes, untrusted build references, check expectations, attempt summaries, representative evidence, and bounded profile constants to the domain/core boundary. Split private executable and public sanitised scenarios. Replace `ReproScenario.checks` and `VerificationResult.passed` with explicit failure-signature, acceptance, regression, baseline, and outcome fields. Update `web_repro_record` and `web_fix_verify` schemas/descriptions/annotations/cancellation plumbing without adding a tool. Reject empty readiness waits at schema and core boundaries. Raise the bundled tool timeout to 150 seconds with README/harness parity. Prove the tool list is unchanged, legacy fields are rejected, errors are redacted/bounded, and the new schemas expose the separation and limits.

### Milestone 2: Adaptive orchestration and fresh attempts

Refactor `SessionManager` so scenarios are session-owned/capped, session operations hold one exclusive abortable lease, validated start settings and exact target identity are retained, launch-owned Chromium can candidate-start/atomically swap, attached Chromium/Safari prepare the same target without reconnecting, replay state resets per attempt while indices remain monotonic, and close purges private scenarios/evidence. Implement the separate baseline/post-fix state machines, stable termination categories, total deadline/attempt ceilings, escalation rules, decisive rates, environment/contract provenance, checks-only observation, authoritative representative recapture, aggregate result bounds, and bounded cleanup. Extend the adapter/framework boundaries only as needed for absolute deadline/signal propagation, observation freshness/availability, owned observer reset, launch/attach/WebDriver capability, exact target identity, and browser version. No adapter decides verification outcomes.

### Milestone 3: Deterministic fixtures, smokes, and evidence bounds

Replace arbitrary scenario delays with observable readiness. Add deterministic async settlement independent of the winning response to `fixtures/complex-vite`, hydration plus request-settled markers to `fixtures/next`, and an observable post-resume condition to the React/Vite smoke. Update comparison/React-Vite/Next/Safari flows to the new scenario API. Make the complex async temporary repair flow record the original stale-response signature on the buggy build, wait for both requests to settle without random sleep, patch the temporary source, and verify the same stored scenario under the repeated-level state machine. Ensure attempts retain summaries/rates but only representative screenshots and full React/Vite/Next evidence. Preserve replay fill sanitisation and fail-closed restore.

### Milestone 4: Documentation, harness, and final verification

Update `ARCHITECTURE.md`, `README.md`, `docs/SECURITY.md`, `docs/RELIABILITY.md`, the bundled workflow skill, plugin timeout, and the relevant harness registry/environment/output/operating/verification/coverage contracts. Update this plan's progress, discoveries, decisions, exact validation signals, and outcome. Run focused tests first, then the full deterministic/type/build/harness gates and proportional live Chromium, React/Vite, Next, Safari, replay, async repair, and comparison smokes. Add an in-memory MCP cancellation/schema/annotation flow. Record unavailable browser/framework evidence literally and inspect/clean only processes owned by these commands.

## Deterministic Coverage and Acceptance

`test/session-manager.test.ts` must use controllable fake adapters and an injected monotonic clock/scheduler or fake timers—never real elapsed sleeps—to prove all of the following:

- Quick pre-fix recording and post-fix verification each succeed with one attempt and no escalation.
- A pre-fix failure signature that cannot be observed returns `inconclusive`; later fix verification does not report `verified` or run acceptance attempts.
- A reliably reproduced baseline followed by all required post-fix passes returns `verified` with the expected observed rates.
- A quick decisive post-fix failure returns `failed` immediately; at repeated levels two matching failures in either order return `failed` with early termination.
- A post-fix pass/fail mix in either order returns `inconclusive`, marks the result flaky, stops immediately on conflict, and never returns `verified`.
- Isolated launch attempts get distinct adapter/context state with fresh viewport/navigation/storage/cache/service-worker guarantees; attached Chromium and Safari disclose non-isolation, and declared browser-state-leakage risk cannot be verified without fresh isolation.
- Browser-state isolation never claims server/database reset; server-state leakage without an explicit observable reset contract returns `inconclusive`.
- Quick retryable → standard and standard baseline conflict/instability → strict consume the original attempts/time; permanent, cancelled, unavailable, and exhausted states do not retry. Quick/standard/strict ceilings prevent extra starts/actions/captures and report the exact reason.
- Request cancellation, deadline expiry, late adapter completion, failed candidate startup, concurrent action/capture/verify, and concurrent close do not corrupt or swap session state; competing mutations return `SESSION_BUSY` and close performs bounded cancellation/cleanup.
- Checks are tri-state: unavailable Safari console cannot satisfy `noConsoleErrors`, stale DOM cannot satisfy a text check, and optional React/Vite/Next enrichment failures remain warnings for browser-only checks.
- Authoritative full capture re-evaluates checks under the same attempt ID; observation drift returns conflict/inconclusive.
- Scenario count, attempt count, replay-frame, observed-text, and 256 KiB aggregate response limits are enforced with truncation flags; screenshots/framework bundles are not retained per retry; scenarios/evidence are purged on close.
- Sensitive fill values remain absent from public scenarios, contract hashes, replay, summaries, build references, errors, and every serialized result; replay restore still fails closed for sanitised fill actions.
- Matching session/environment/contract provenance permits historical baseline use, while session/project/runtime/target/environment/contract mismatch produces `inconclusive` before post-fix actions. Build references remain explicitly untrusted and pre/post values may differ.
- Chromium launch, Chromium attach, Safari WebDriver, React/Vite, and Next capability/reset/framework fields remain truthful when optional evidence is absent.

Public/adaptor/fixture tests must additionally prove that the MCP catalog is unchanged; tool annotations and 150-second timeout stay aligned; legacy ambiguous fields are rejected; bare waits are rejected; SDK abort reaches the manager; attached multi-tab/no-page identity is stable; adapter reset/isolation metadata is correct; and async settlement, Next hydration/request settlement, and React post-resume readiness markers exist. Exercise both scenario tools through the in-memory MCP transport. A deterministic live complex async run must demonstrate stale-response reproduction and latest-response-wins verification against the temporary patched fixture with no selector-less wait or unconditional sleep.

## Concrete Steps

Work from `/Users/marlonjd/Developer/monorepos/web-debug-mcp` on the current branch. Preserve any user changes that appear after this plan is saved.

Focused checks, run before the full suite:

    npm test -- --run test/session-manager.test.ts test/mcp-server.test.ts test/chromium-policy.test.ts test/safari-adapter.test.ts test/complex-fixture-contract.test.ts test/next-fixture-contract.test.ts test/react-fixture-contract.test.ts
    node --check scripts/demo-compare.mjs

Required repository gates:

    npm test
    npm run typecheck
    npm run build
    npm run harness:check

Proportional live evidence, after build and only with exact availability reporting:

    npm run smoke:live
    npm run smoke:react-vite
    npm run smoke:next
    npm run smoke:safari
    npm run demo:compare -- --scenario=complex-async-fix --runs=1
    npm run demo:compare -- --runs=1

If a browser executable, Safari remote-automation permission, framework runtime, or approved external target is unavailable, report the exact command/status as `blocked`, `candidate-only`, or `not run`; do not convert it to a pass. After live runs, inspect for fixture, complex Vite, React/Vite, Next, Playwright, WebDriver/safaridriver, headless Chromium, and MCP-owned Chrome processes. Terminate only processes provably launched by the verification workflow.

## Validation and Acceptance

Local completion requires the focused tests, `npm test`, typecheck, build, and `npm run harness:check` to exit zero. The harness check must print `harness-check: PASS`. In-memory MCP coverage must prove schema, annotations, cancellation, redacted response shape, and absence of legacy fields. The live vanilla smoke must retain loopback/CDP/breakpoint evidence when Chromium is available. React/Vite must retain React, Vite, replay, authoritative adaptive scenario evidence, and observable post-resume readiness. Next must retain route/action/server evidence and use observable hydration/request settlement. Safari must either pass action/DOM/screenshot/console/network-source assertions with explicit non-isolation/debugger warnings or report its exact blocker; unavailable BiDi console cannot satisfy a console guardrail. The complex async comparison must report a reproduced pre-fix failure, an evidence-backed `verified` fixed result, adaptive level/escalation/attempt/rate/environment/contract/build-reference fields, bounded representative evidence, and no arbitrary scenario wait.

No acceptance result may claim `verified` when the baseline phase is absent, unmatched, unreliable, provenance-invalid, required evidence unavailable/stale, state reset insufficient for the declared risk, or only candidate evidence. Conflicting post-fix observations are always `inconclusive`/flaky. Repeated full screenshot, DOM, console, network, React, Vite, or Next bundles, an over-budget result, a leaked raw fill value, or a response over 256 KiB without deterministic pruning/truncation is a failure even when checks pass. Loopback-only, same-origin, redaction, bounded output, replay sanitisation, fail-closed restore, local-first behavior, exact attached-target ownership, and explicit remote/non-isolated warnings are non-negotiable.

## Idempotence and Recovery

Plan/document edits and deterministic tests are safe to rerun. Verification attempts replace only launch-owned Chromium resources. Candidate startup precedes atomic swap; if it fails, close the candidate, retain the prior adapter/session and representative evidence, record an inconclusive attempt, and never leak a half-started adapter into the session map. Attached Chromium/Safari reuse the exact selected target and never clear cookies, caches, storage, service workers, profiles, or other tabs. Abort and close wait only for the five-second cleanup ceiling, purge private scenarios/evidence, and report incomplete cleanup literally. Do not delete broad temporary directories. Temporary repair fixtures and screenshots remain under `web-debug-mcp-*` operating-system temporary paths, and cleanup targets only processes/artifacts created by the command.

## Artifacts and Notes

- Initial plan-review evidence will be recorded in `Surprises & Discoveries`, `Decision Log`, and `Revision History`; rejected suggestions will be noted when their rationale affects implementation.
- No durable scenario JSON artifact is planned. The output must state the in-memory/session-bound reuse boundary, environment fingerprint, sanitised contract hash, and untrusted build references so callers cannot infer cross-session or authenticated-build proof.
- The existing complex async fixture delays request 1 deterministically longer than request 2. The repair changes stale-response application, while the new observable settlement marker replaces the current fixed 350 ms wait.
- Representative screenshot paths remain temporary evidence handles; repeated attempt summaries must not create or return one screenshot per retry.

## Interfaces and Dependencies

Keep `@modelcontextprotocol/sdk`, Zod, `playwright-core`, WebDriver/BiDi, Node crypto, and existing framework adapters. Add no dependency unless current types/APIs prove insufficient. The stable public catalog remains the current 13 tools. Only the two scenario tools change shape. `BrowserAdapter` may gain the smallest internal checks-only observation, exact-target, owned-observer-reset, deadline/signal, and capability contract needed for truthful attempt behavior; framework adapters receive the same deadline/signal. Adapters must not decide verification outcomes or bypass core URL/redaction policy.

## Outcomes & Retrospective

The implementation now records an executing, session-owned sanitized scenario with a pre-fix baseline, separates the complete polarity-aware failure signature from acceptance/regression checks, and returns adaptive `verified`/`failed`/`inconclusive` outcomes. Launch-owned Chromium receives fresh adapter/process/context state for repeated attempts; attached Chromium and Safari retain exact target identity and disclose unavailable profile isolation. Checks-only attempts collect only fresh URL/DOM/console observations and return no network bundle, while the adapter-owned network buffer remains available only to that attempt's authoritative representative capture. Bounded child contexts make optional React/Vite/Next/screenshot enrichment warnings rather than verdict inputs. URL/DOM/console checks are tri-state with freshness/provenance, cancellation/deadlines flow through adapter and framework calls, and an exclusive session lease prevents concurrent mutation or late adapter completion. Verification replay resets per attempt, keeps monotonic indices and `attemptId`, and retains one capture-only frame; manual action replay remains available under its existing fail-closed fill rules. Results retain lightweight summaries and one canonical `evidence` bundle under the 256 KiB aggregate limit; close purges private scenarios/evidence, and screenshot handles remain in the owning session directory or are omitted with a warning when redaction would collide—without copying artifacts. The executable scenario URL stays private and raw fill values are scrubbed across nested evidence, replay, errors, and MCP JSON. The complex async comparison demonstrates a reproduced stale-response baseline, standard-level two-match/three-pass verification with current-attempt network evidence, sanitized contract/build-reference fields, and latest-response-wins after the temporary patch.

Validation evidence (2026-08-27 final narrow network-evidence correction): the focused command passed 7 files/36 tests plus `node --check scripts/demo-compare.mjs`; the standalone `npm test` gate passed 13 files/50 tests; `npm run typecheck` and `npm run build` passed; `npm run harness:check` passed (`harness-check: PASS (208 checks)`). The deterministic network-retention test proved checks-only snapshots return no network, authoritative baseline/post-fix captures retain only the active attempt's bounded sample, and the next attempt starts with a fresh observer buffer. `npm run smoke:live` passed with isolated launch, local-target, breakpoint, source/locals, screenshot, and clean-console assertions. `npm run smoke:react-vite` passed with React render-cause/commit, Vite module/HMR/transform provenance, replay timeline/seek/restore, breakpoint, screenshot, and clean-console assertions. `npm run smoke:next` passed with route, hydration/request settlement, Server Action execution/linkage, request traces, bounded logs, and clean-console assertions. `npm run smoke:safari` passed with `status: verified`, DOM/action/screenshot, BiDi-console, and Performance Resource Timing fallback evidence plus explicit debugger/profile/non-isolation warnings; the earlier no-BiDi run remains recorded literally above as historical blocked evidence. `npm run demo:compare -- --scenario=complex-async-fix --runs=1` passed with stale `Quote v1` reproduction, current-attempt network evidence, and standard-level latest-response-wins verification (2 baseline attempts, 3 post-fix attempts, rate 1), and `npm run demo:compare -- --runs=1` passed vanilla, React/Vite, Next, complex logic, complex async, and visual repair contracts. Process inspection found no verification-owned fixture/Vite/Next/Playwright/WebDriver/safaridriver/headless Chromium processes; the user's long-lived Chrome process was left untouched.

## Revision History

- (2026-08-27 16:32Z) Change: Created and registered the initial plan after repository inspection. Reason: Establish the required restartable contract before independent review or implementation.
- (2026-08-27) Change: Revised the plan after the required Sol xhigh and Sol ultra read-only reviews. Reason: Remove order-dependent and unenforceable behavior, close concurrency/retention/redaction/attached-target gaps, and make readiness, provenance, capability, cancellation, and test contracts exact before implementation.
- (2026-08-27) Change: Implemented adaptive scenario recording, repeated verification, exact target/isolation metadata, tri-state observations, cancellation/deadlines, bounded representative evidence, deterministic fixture readiness, docs, plugin timeout, and harness parity. Reason: Deliver the revised contract end to end while preserving the 13-tool MCP catalog and in-memory/session-bound scope.
- (2026-08-27) Change: Completed the Sol xhigh correction pass and final local evidence sweep. Reason: Make authoritative full capture decisive, evaluate complete failure signatures, preserve private raw URLs, bound late adapter cleanup, remove compatibility aliases, scrub every nested fill surface, and certify the updated deterministic/live/harness contracts.
- (2026-08-27) Change: Completed the second focused correction pass and final local/live evidence sweep. Reason: Honor framework-light checks-only snapshots, isolate optional enrichment failures from browser verdicts, bound and attribute verification replay, preserve session-owned screenshot artifacts without copying, and certify server-observed cancellation plus the updated test/harness counts.
- (2026-08-27) Change: Completed the final narrow network-evidence correction and evidence sweep. Reason: Preserve current-attempt request linkage for authoritative representatives without returning network data from checks-only observations or accumulating discarded retry state.
- (2026-08-27) Change: Final Sol xhigh implementation review accepted the plan and it moved from active to completed. Reason: All promised local behavior, repository-native checks, proportional browser/framework smokes, and comparison evidence passed; remote, hosted, credentialed, release, and production authority remain separate scopes.
