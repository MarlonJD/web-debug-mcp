<!-- harness-plan:v1
id: manual-parity-qualification-skill
status: completed
created: 2026-08-30
updated: 2026-08-31
completed: 2026-08-31
owner: Web Debug maintainers
-->

# Add reviewed manual-parity qualification guidance

Maintain this plan according to [`../../PLANS.md`](../../PLANS.md). It is intentionally independent from the active capture/runtime-capability work and must preserve every pre-existing worktree change.

## Purpose / Big Picture

The Web Debug plugin should offer a second, separately routed skill for turning approved manual cases—or source-backed candidate requirements when no manual baseline exists—into traceable qualification coverage. The target repository's native Playwright, API, domain, and contract runners remain the execution authority. Web Debug remains a failure-diagnosis and browser-evidence provider and never awards business PASS.

Success is visible when the plugin discovers `manual-parity-qualification`, the skill keeps executable selectors/actions/assertions in typed repository-native code, deterministic metadata validation rejects false qualification claims, and the existing 13-tool MCP catalog and session-only scenario boundary remain unchanged.

## Progress

- [x] (2026-08-30 23:35Z) Reviewed the current plugin, native-runner routing, scenario-persistence decision, harness, and official OpenAI plugin/skill boundary.
- [x] (2026-08-30 23:45Z) Added the skill entrypoint, artifact contract, read-only metadata validator, deterministic tests, and discoverability documentation.
- [x] (2026-08-31 00:02Z) Ran both skill validators, plugin validation, focused/adversarial tests, full repository gates, and independent forward-testing.
- [x] (2026-08-31 00:03Z) Recorded literal outcomes and moved this plan to completed after every promised local gate passed.

## Surprises & Discoveries

- The repository already makes portable MCP scenario files and a standalone CI runner explicitly out of scope; qualification JSON must therefore remain non-executable metadata.
- The worktree contains an unrelated active capture/runtime-capability implementation. This plan must not edit, revert, or reinterpret those source and test changes.
- The Codex plugin manifest already exposes the complete `skills/` directory, so a second bundled skill needs no additional MCP server or public tool.
- The first full gate encountered the unrelated capture/runtime refactor between extraction steps and failed on its temporary duplicate/missing TypeScript declarations. This plan did not modify that source; after the active refactor converged, the same full gate passed with 31 files and 149 tests.
- Independent review found that requirement-only run results could be reused across manual cases and that run records were not tied to exact qualification bytes. Case-scoped results, one native-test owner per crosswalk row, qualification/crosswalk digest chaining, and execution-namespace-bound mutation evidence closed those false-PASS paths.

## Decision Log

- 2026-08-30, Web Debug maintainers: Add `manual-parity-qualification` as a second skill in the existing plugin. Rationale: qualification has a distinct trigger, PASS semantics, persistence owner, and native-runner dependency while remaining related to Web Debug failure diagnosis.
- 2026-08-30, Web Debug maintainers: Store only reviewed baselines, crosswalks, and run records as JSON. Keep Playwright actions, selectors, API calls, fixtures, and assertions in typed target-repository code. Rationale: avoid a second executable browser DSL.
- 2026-08-30, Web Debug maintainers: Treat model-derived scenarios as `candidate` until an explicit product/domain reviewer approves the baseline. Structural validation never authenticates reviewer identity or test evidence.
- 2026-08-30, Web Debug maintainers: Add no generic Playwright template asset in this increment. Rationale: role fixtures, auth, domain read-backs, and repository conventions are product-specific; a generic template would become a hidden framework.
- 2026-08-30, Web Debug maintainers: Do not change or publish package/plugin runtime versions. Rationale: the user requested local implementation, not a release, marketplace update, or installed-plugin mutation.
- 2026-08-31, Web Debug maintainers: Make official run records case-scoped with nested requirement evidence, exact catalog/crosswalk digests, and namespace-bound mutation proof. Rationale: prevent one result from passing multiple manual cases or surviving post-run requirement/approval drift.
- 2026-08-31, Web Debug maintainers: Keep execution-state precedence ahead of readiness/stability downgrades. Rationale: blocked and not-run executions must remain literal, while otherwise-passing flaky/unknown cases become inconclusive.

## Outcomes & Retrospective

Implemented the second bundled `manual-parity-qualification` skill without changing the MCP catalog, `.mcp.json`, or browser runtime. The skill now distinguishes candidate and approved baselines, golden witness campaigns and atomic branches, coverage/execution/stability axes, native-runner authority, diagnostic-only Web Debug evidence, and ambiguous mutation handling.

The bundled Node validator performs bounded project-root-contained reads, exact-field/schema checks, source/reference closure, one crosswalk row per manual case, unique test ownership, campaign/test reconciliation, exact qualification/crosswalk digest binding, per-case and nested requirement aggregation, required evidence facets, manual review, mutation proof, and stored-summary reconciliation. It remains structural-only and read-only.

Local validation passed: both skills passed the skill validator, the plugin validator passed, the focused contract suite passed, the full repository suite passed 31 files/149 tests, typecheck/build passed, the native harness passed 572 checks, and `git diff --check` passed. Independent candidate-baseline and ambiguous-mutation forward-tests preserved non-gating/inconclusive behavior; the final adversarial validator review returned PASS.

No browser smoke, plugin install, marketplace write, npm publication, remote target, or release action ran because no MCP/browser runtime changed and the user did not request distribution. Harness certification remains literally `stale-candidate`.

## Context and Orientation

`plugins/web-debug/skills/web-debug-workflow/SKILL.md` owns isolated browser-bug reproduction and same-session fix verification. `docs/design-docs/scenario-persistence-boundary.md` keeps MCP scenarios in-memory and repository-native tests durable. `plugins/web-debug/.codex-plugin/plugin.json` exposes the whole skills directory. `scripts/harness-check.mjs` mechanically checks plugin paths and routing language. The qualification skill adds one focused reference and one read-only Node validator under its own folder; it does not import application code or modify the MCP server.

The validator will consume explicit project-root-contained paths for `qualification.json`, `crosswalk.json`, and an optional run record. It will emit bounded JSON and exit non-zero on structural inconsistency. It will distinguish review, coverage, execution, and stability; reject executable browser-DSL fields; require source/reference closure; prevent candidate, partial, ambiguous, blocked, inconclusive, or flaky evidence from becoming aggregate PASS; and keep Web Debug references diagnostic-only.

## Plan of Work

Milestone 1 adds a concise skill entrypoint and a detailed artifact contract. The entrypoint routes manual-parity, role-journey, authorization-branch, and qualification requests while handing isolated bugs back to `web-debug-workflow`. The reference defines the default target-repository layout, source/reviewer gate, golden-versus-atomic split, evidence facets, mutation certainty, and three metadata documents.

Milestone 2 adds the deterministic validator. The script performs bounded contained reads, exact-field validation, reference resolution, crosswalk completeness, run aggregation, and truthful PASS gating without executing tests or trusting hashes as attestations.

Milestone 3 integrates the skill with the plugin contract and documentation. A new test exercises a complete approved example and adversarial candidate/action-DSL/ambiguous-mutation records. Harness checks require both skill paths and the non-overlapping routing boundary.

Milestone 4 runs the skill creator validator, plugin validator, focused tests, the full deterministic/type/build/native-harness gates, and `git diff --check`. Independent subagents exercise realistic no-manual-baseline, approved-two-role, JSON-action-import, and mutable-timeout prompts in temporary workspaces. Browser smokes are not required because no browser or MCP runtime behavior changes.

## Concrete Steps

Work in `/Users/marlonjd/Developer/monorepos/web-debug-mcp` on the current branch only.

1. Add `plugins/web-debug/skills/manual-parity-qualification/` with `SKILL.md`, `references/artifact-contract.md`, and `scripts/validate-manual-parity.mjs`.
2. Add an isolated validator test; update native harness required files and routing checks.
3. Update architecture, product/readme discoverability, and the scenario-persistence decision without changing its ownership boundary.
4. Run focused validator tests and direct valid/invalid CLI probes.
5. Run skill/plugin validators, `npm test`, `npm run typecheck`, `npm run build`, `npm run harness:check`, and `git diff --check`.
6. Run independent forward-tests, apply only evidence-backed corrections, then complete this plan and registry entry if every promised gate passes.

If an unrelated active-plan change breaks a full gate, preserve that change, record the exact scoped blocker, and continue every independent validation available to this plan.

## Validation and Acceptance

- `python3 /Users/marlonjd/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/web-debug/skills/manual-parity-qualification` exits zero.
- `python3 /Users/marlonjd/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/web-debug` exits zero when its Python dependencies are available; otherwise the exact environment blocker is recorded and native manifest/harness checks still run.
- The validator accepts one approved, fully evidenced native-runner record and emits `ok: true` with a computed `passed` verdict.
- The validator rejects unknown action/selector fields, missing crosswalk rows, candidate self-approval, ambiguous mutating PASS, missing required facets, and stored aggregate drift.
- `npm test`, `npm run typecheck`, `npm run build`, and `npm run harness:check` exit zero. The public MCP tool count remains 13.
- Independent forward-tests keep candidate baselines non-gating, native code executable, Web Debug diagnostic-only, and ambiguous mutations inconclusive.

## Idempotence and Recovery

The validator is read-only and deterministic for the same bytes. It resolves only explicit paths contained by the supplied project root, rejects symlink escapes and oversized/non-regular inputs, and never rewrites qualification artifacts. Re-running local validation is safe.

No branch, release, install, marketplace, remote browser, credential, or production action belongs to this plan. If implementation needs rollback, remove only files introduced by this plan and reverse only this plan's exact documentation/harness additions through an explicit patch; never reset the worktree.

## Artifacts and Notes

- Official plugin architecture: <https://developers.openai.com/plugins/concepts/plugins>
- Existing scenario boundary: [`../../design-docs/scenario-persistence-boundary.md`](../../design-docs/scenario-persistence-boundary.md)
- Existing bug workflow: [`../../../plugins/web-debug/skills/web-debug-workflow/SKILL.md`](../../../plugins/web-debug/skills/web-debug-workflow/SKILL.md)
- Final local gates: `npm test` (31 files/149 tests), `npm run typecheck`, `npm run build`, `npm run harness:check` (572 checks, stale-candidate certification), and `git diff --check` all exited zero.
- Skill/plugin validation used isolated `uv run --with pyyaml` because the host `python3` environment lacks the `yaml` module; both skill validators and the plugin validator exited zero.

## Interfaces and Dependencies

Use only Node built-ins in the validator. Do not add `@playwright/test`, a JSON Schema package, a database, a service, a second MCP server, or a new public tool. Keep the existing plugin manifest's `./skills/` discovery path and immutable `web-debug-mcp@0.5.0` runtime pin.

The metadata schemas start at version 1 and are qualification-specific; they are not MCP scenario schema 5 and must not be accepted by `web_repro_record`.

## Revision History

- (2026-08-30 23:35Z) Change: Created the plan after architecture, skill, plugin, security, and dirty-worktree review. Reason: Make the approved implementation restartable without expanding the MCP boundary.
- (2026-08-31 00:03Z) Change: Completed the skill, structural validator, adversarial tests, plugin/docs/harness integration, forward-testing, and all local gates. Reason: Deliver the approved manual-parity capability while preserving native-runner and MCP boundaries.
  Semantic-Review: reviewer=Web Debug maintainers; reviewed-at=2026-08-31 00:03Z; content-sha256=2a3fcfdcc9c70f32e027229620342b53bca367fad14ed0db4548975fecc386c0; evidence=Reviewed every checked milestone, candidate and mutation verdict boundary, case-scoped digest-bound validator invariant, adversarial containment result, plugin routing change, full deterministic/type/build/harness evidence, and explicit non-release scope.
