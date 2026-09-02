<!-- harness-plan:v1
id: mcp-binding-fail-closed-recovery
status: completed
created: 2026-09-02
updated: 2026-09-02
completed: 2026-09-02
owner: Platform Engineering
-->

# Make MCP startup self-healing and explicit Web Debug use fail closed

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). The user authorized implementation, one commit, and a push to the existing `main` branch. Do not publish npm/GitHub releases, install a replacement plugin, or change branches.

## Purpose / Big Picture

An explicitly requested Web Debug workflow must either begin with a real bundled `web_project_detect` tool call or stop with one exact MCP client-binding blocker. It must never silently substitute repository Playwright, Puppeteer, a naked stdio process, or a direct SDK transport. A Web Debug stdio server must also recover automatically from identity-verifiably stale process-registry debris left by abrupt host termination, while preserving the rule that no active or unverifiable process is signaled.

Success is observable when a registry at the record cap with dead/PID-reused entries self-reconciles and admits a new server, cleanup removes the exact stale record sidecars, doctor distinguishes server readiness from current-task binding, the plugin workflow forbids fallback for explicit invocation, and the repository gates pass without changing the 13-tool MCP surface.

## Progress

- [x] (2026-09-02 02:37Z) Confirmed clean `main` at `1b9edf3`, existing `origin/main`, and user authorization to implement, commit, and push without branch or release work.
- [x] (2026-09-02 02:37Z) Reconstructed the incident: 64 registry records blocked stdio startup; bounded cleanup classified 62 dead/stale, one live idle, and one identity mismatch; cleanup left orphan `.lock`/`.tmp` sidecars.
- [x] (2026-09-02 02:56Z) Implemented identity-safe pre-cap startup reconciliation, exact `.json`/`.lock`/`.tmp` stale-family removal, PID-reuse no-signal handling, retention of live/unverifiable records, and bounded stderr startup diagnostics.
- [x] (2026-09-02 02:56Z) Added schema-versioned doctor registry readiness plus explicit unverified current-task binding output, Gate 0 fallback prohibitions/recovery handoff, and Codex host/configuration guidance.
- [x] (2026-09-02 02:56Z) Added deterministic cap, sidecar, PID-reuse, retention, cleanup-idempotence, doctor-boundary, and plugin-policy coverage plus reliability/security/compatibility/harness documentation updates.
- [x] (2026-09-02 03:06Z) Root review added bounded orphan-sidecar reconciliation, one-line diagnostic coverage, honest Codex compatibility evidence, and source-next `0.8.0-next.0` identity while keeping the released plugin/runtime immutable at `0.7.0`.
- [x] (2026-09-02 03:06Z) Passed focused 45-test and full 32-file/169-test suites, typecheck, build, 618-check native harness, three skill validators, plugin validator, exact 13-tool stdio handshake, package dry-run, and `git diff --check`.
- [x] (2026-09-02 03:06Z) Prepared the single reviewed `main` commit and authorized `origin/main` push. The final commit hash and remote transport result are necessarily recorded in the user handoff after this plan is committed.

## Surprises & Discoveries

- `ProcessRegistry.start()` checks directory and record caps before attempting any stale-record reconciliation, so one abrupt multi-process shutdown can permanently block every later MCP initialization until a separate cleanup runs.
- The dead/stale cleanup branch removes only the `.json` record, while exact `.lock` and `.tmp` sidecars survive. After the incident cleanup, the owner-only registry still contained 42 entries: two JSON records and 40 sidecars.
- An identity mismatch proves that the registry record no longer authorizes signaling the current PID. Removing only that stale registry record and its sidecars is safe; signaling the mismatched process remains prohibited.
- `doctor` can return successful project/browser/URL checks but has no current-task binding facet. A standalone CLI cannot prove that Codex captured the MCP tools for the active task.
- The installed host is Codex CLI `0.146.0`. Official Codex `0.151.0` added optional-MCP discovery grace and `0.152.0` preserved MCP tools during binding/cache refreshes, so current compatibility guidance must name the supported host baseline rather than treating old-host behavior as a server defect.
- The current official MCP configuration documents `required = true` for direct `[mcp_servers.<name>]` `config.toml` entries, while plugin-provided server policy documents only `enabled` and tool-policy overrides. The bundled plugin `.mcp.json` therefore retains only supported launch fields and documents the strict direct-server override.
- A legitimate crash can leave three owned entries per process (`.json`, `.lock`, `.tmp`). Startup reconciliation therefore scans at most 192 entries/64 records, removes only stale exact families, then reapplies the ordinary 128-entry/64-record admission caps.
- Source changes after immutable `0.7.0` must not reuse the released version. The reviewed tree is `0.8.0-next.0`; npm/plugin publication and installed-plugin replacement remain separate, unauthorized release work.

## Decision Log

- 2026-09-02, user and Platform Engineering: Explicit Web Debug invocation is fail closed. If the bundled tools are not callable, do not continue with Playwright, Puppeteer, raw CDP, a naked `npx web-debug-mcp`, cleanup-as-binding-repair, or a direct MCP SDK transport.
- 2026-09-02, Platform Engineering: Reconcile only identity-verifiably stale/dead registry artifacts automatically at startup. Never signal an active, busy, identity-unavailable, or mismatched current process during startup repair.
- 2026-09-02, Platform Engineering: Treat server process startup and Codex task binding as separate states. Doctor may inspect registry/server readiness but must state that only a real bundled tool call proves task binding.
- 2026-09-02, Platform Engineering: Keep `required = true` out of plugin `.mcp.json` because the current official plugin schema documents that policy for direct Codex `config.toml` server entries; provide the exact user-config override and duplicate-disable policy instead.
- 2026-09-02, Platform Engineering: Use a 192-entry reconciliation envelope only to recover the maximum 64 exact record/lock/tmp families, then retain the existing 128-entry/64-record post-reconciliation admission caps. Rationale: recover old-version crash debris without making normal registry capacity unbounded.
- 2026-09-02, Platform Engineering: Advance source identity to `0.8.0-next.0` and keep released package/plugin runtime `0.7.0`. Rationale: doctor schema and lifecycle behavior changed, but the user authorized commit/push rather than publication or installation.
- 2026-09-02, Platform Engineering: Keep the public MCP catalog at exactly 13 tools. Recovery belongs in lifecycle core, CLI diagnostics, plugin configuration/guidance, and tests rather than a new public debug tool.
- 2026-09-02, user and Platform Engineering: Work on current `main`, create one reviewed commit, and push `origin/main`; do not publish or install a release in this task.

## Outcomes & Retrospective

The source-next server now self-reconciles identity-verifiably dead and PID-reused records before cap admission, removes exact stale record/lock/tmp families plus bounded old orphan sidecars, never signals during startup repair, retains live/unverifiable/malformed state, and emits bounded one-line stderr diagnostics. Doctor schema 3 reports registry readiness and always marks current-task binding unverified. The plugin skill makes a real bundled `web_project_detect` call Gate 0 and prohibits Playwright, Puppeteer, raw CDP, direct SDK, naked server, and cleanup fallback for explicit Web Debug requests.

Local evidence passed: focused 4 files/45 tests; full 32 files/169 tests; source/test typecheck; build; native harness `618` with unchanged 13-tool surface; all three skill validators; plugin validator; `git diff --check`; exact built stdio handshake reporting `0.8.0-next.0`, 13 tools, `web_project_detect` first and `web_session_close` last with clean close; and a 156-entry `npm pack --dry-run` for source-next.

No browser live smoke ran because browser/session code did not change. No local Codex `0.152.0+` Gate 0 binding, npm publication, GitHub release, plugin marketplace version bump, or installed-plugin replacement was authorized or claimed. The pushed source is locally verified and release pending; public/installed plugin runtime remains immutable `0.7.0` until a separate release task.

## Context and Orientation

`src/core/process-registry.ts` owns owner-only registry records, process identity verification, heartbeats, idle state, caps, and the cleanup CLI. `src/index.ts` starts the registry before connecting the stdio transport. `bin/web-debug-mcp.mjs` currently lets startup failures escape as raw stack traces. `src/core/doctor.ts` checks Node, project, browser, loopback target, Vite, and Next readiness but not registry capacity or Codex binding. `plugins/web-debug/.mcp.json` configures the bundled stdio server. `plugins/web-debug/skills/web-debug-workflow/SKILL.md` routes explicit Web Debug requests but currently leaves enough ambiguity for a native-browser fallback. `test/local-fidelity-contract.test.ts`, `test/doctor.test.ts`, and `test/plugin-skill-contract.test.ts` are the focused regression homes.

The process registry is a security boundary. Automatic recovery may delete only owner-only files with exact registry-owned names after bounded validation proves the recorded process is dead or the PID/start identity no longer matches. It must not scan or signal arbitrary processes. A live matching idle process remains cleanup-command territory, not startup reconciliation.

## Plan of Work

First, factor an identity-safe stale-artifact reconciliation path in `process-registry.ts`. Run it before cap enforcement, remove the exact JSON/lock/tmp family for dead or PID-reused records, keep unverifiable/live records, and retain bounded directory/report behavior. Make cleanup use the same exact artifact removal so it cannot leak sidecars. Convert expected startup-cap failures to concise stderr diagnostics without writing protocol noise to stdout.

Second, extend doctor with bounded registry readiness plus an explicit client-binding boundary. Doctor must never imply that package/project readiness means the active Codex task owns callable tools. Keep the output deterministic, bounded, and schema-versioned consistently with the repository's no-compatibility-layer rule.

Third, harden plugin behavior. For explicit Web Debug invocation, require a real `web_project_detect` call as Gate 0. If the tool is absent or initialization failed, report the exact binding/startup blocker and stop. Prohibit repository Playwright/Puppeteer/raw CDP/direct SDK/naked server/cleanup substitution. Provide only the supported recovery handoff: repair the reported server condition if identity-safe, then use Codex Settings MCP Restart or a new task/session. Adopt the current official Codex host baseline and use the supported required-MCP configuration if the plugin schema and validators accept it; otherwise document the exact strict user-config override without inventing an unsupported manifest field.

Finally, add deterministic cap, power-loss, PID-reuse, sidecar, doctor-boundary, startup-diagnostic, and skill-policy tests. Update reliability/security/compatibility/harness text with literal scoped claims, run the complete local definition of done, and move this plan to `completed/` only after every promised gate passes.

## Concrete Steps

Work from `/Users/marlonjd/Developer/monorepos/web-debug-mcp` on existing `main`.

1. Edit lifecycle core, doctor/CLI, plugin config/skill, focused tests, and matching docs. Do not change the public tool list or add a dependency.
2. Run focused Vitest files covering local fidelity, doctor, plugin skill, MCP server startup, and any new lifecycle module tests.
3. Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run harness:check`.
4. Run the repository-provided skill/plugin validators required by existing harness or package scripts, plus `git diff --check`.
5. Review `git diff`, update this plan's evidence and outcomes, move it to `completed/`, update `docs/exec-plans/index.md`, commit once, then run `env -u GH_TOKEN -u GITHUB_TOKEN git push origin main`.

Expected signals are zero exits, all tests passing, `harness-check: PASS`, an unchanged 13-tool catalog, and a clean working tree after push. If a test reveals that current Codex/plugin schema cannot express required MCP startup, retain fail-closed skill behavior and document the supported host configuration rather than adding a compatibility shim.

## Validation and Acceptance

- Focused local gate (2026-09-02 02:55Z): `npm test -- --run test/local-fidelity-contract.test.ts test/doctor.test.ts test/plugin-skill-contract.test.ts test/mcp-server.test.ts` passed, 4 files / 43 tests. This covers pre-cap stale reconciliation, exact sidecars, PID reuse without signaling, active/unverifiable retention, cleanup idempotence, doctor readiness/binding boundary, plugin Gate 0 policy, and the unchanged 13-tool MCP catalog.
- Root-reviewed focused gate (2026-09-02 03:01Z): the same command passed 4 files / 45 tests after adding old orphan-sidecar and bounded one-line diagnostic coverage.
- A temp registry containing 64 owner-only dead/stale records and sidecars admits a new `ProcessRegistry.start()` without manual cleanup.
- A PID-reused/identity-mismatched record is removed without signaling the unrelated live process.
- A matching active or unverifiable record is retained and still contributes to the cap; startup fails closed with a concise stable diagnostic when real capacity remains exhausted.
- Cleanup removes the exact `.json`, `.lock`, and `.tmp` family for stale records and remains idempotent.
- Doctor reports registry readiness and explicitly says it cannot verify current Codex task binding; an actual bundled `web_project_detect` call remains the only Gate 0 proof.
- The explicit Web Debug skill contract contains mechanical prohibitions against Playwright/Puppeteer/raw CDP/direct SDK/naked server/cleanup fallback and names supported Restart/new-session recovery.
- Plugin/config validation accepts the chosen strict startup policy, or the plan records a literal supported-config-only outcome.
- `npm test`, `npm run typecheck`, `npm run build`, `npm run harness:check`, relevant plugin/skill validators, and `git diff --check` pass.
- No browser live smoke is required unless implementation changes browser/session code; registry/stdio handshake tests are required because startup behavior changes.
- Full local gate (2026-09-02 03:06Z): `npm test` passed 32 files / 169 tests; `npm run typecheck`, `npm run build`, and `npm run harness:check` exited zero with `harness-check: PASS (618 checks; certification: stale-candidate)`.
- Distribution-shape gate (2026-09-02 03:06Z): all three `quick_validate.py` skill runs and `validate_plugin.py plugins/web-debug` passed; exact built stdio returned source version `0.8.0-next.0` and 13 tools, then removed its registry record on close; `npm pack --dry-run --json` reported 156 files and source-next identity without creating or publishing an archive.

## Idempotence and Recovery

Registry reconciliation and cleanup must be idempotent: removing an already absent owned artifact succeeds, and retrying startup cannot signal or delete a live matching record. Tests use isolated temporary directories and command-owned children only. No command targets a broad temp root or unregistered process. If implementation fails, preserve the active plan and working tree for review; do not reset, switch branches, or publish partial work. Commit only after all local gates pass. Push is retriable with the same commit and sanitized GitHub environment.

## Artifacts and Notes

- Official MCP configuration documents Settings Restart, `required = true`, and plugin-provided server policy: <https://learn.chatgpt.com/docs/extend/mcp>.
- Official Codex changelog documents discovery grace in `0.151.0` and MCP binding/cache preservation in `0.152.0`: <https://learn.chatgpt.com/docs/changelog>.

## Interfaces and Dependencies

Keep Node.js built-ins, `@modelcontextprotocol/sdk` `1.30.0`, Zod `4.4.3`, the 13 existing MCP tools, owner-only registry permissions, Linux/Darwin identity inspection, bounded CLI JSON, and stdout protocol purity. Do not add a daemon, hosted service, browser authority, compatibility layer, migration, or dependency.

## Revision History

- (2026-09-02 02:37Z) Change: Created and registered the plan from the reproduced Codex/registry incident. Reason: Make the cross-cutting lifecycle, host-binding, plugin-policy, and verification work restartable before Luna Max implementation.
- (2026-09-02 03:06Z) Change: Completed Luna Max implementation, root security review/corrections, source-next identity, all local gates, and the release-pending handoff boundary. Reason: Deliver self-healing server startup and explicit-invocation fail-closed behavior without claiming an unavailable Codex host rebinding API or publishing a release.
  Semantic-Review: reviewer=Platform Engineering; reviewed-at=2026-09-02 03:06Z; evidence=Reviewed process identity/no-signal behavior, exact artifact containment, reconciliation and admission bounds, doctor binding semantics, plugin fallback prohibitions, source/released version separation, 45 focused and 169 full tests, type/build/harness, validators, stdio handshake, package dry-run, and diff hygiene.
