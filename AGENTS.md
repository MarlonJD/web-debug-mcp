# Repository Agent Guide

Use this file as the short route into the project contract. Keep detailed rationale in the linked documents.

## Start here

- Documentation map: [`docs/index.md`](docs/index.md)
- Current architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Planning contract: [`docs/PLANS.md`](docs/PLANS.md)
- Active work: [`docs/exec-plans/index.md`](docs/exec-plans/index.md)
- Harness routes: [`docs/agent-harness/index.md`](docs/agent-harness/index.md)
- Security boundary: [`docs/SECURITY.md`](docs/SECURITY.md)

## Orientation

- `src/index.ts` is the single MCP facade.
- `src/core/` owns project detection, session ownership, redaction, and evidence composition.
- `src/adapters/` owns browser transport details; adapters must not bypass core safety policy.
- `fixtures/` contains deterministic browser targets for contract tests.
- `scripts/` contains repository-native setup and verification commands.

## Commands

| Intent | Command | Expected signal |
| --- | --- | --- |
| Install | `npm install --no-audit --no-fund` | Dependencies resolve and `package-lock.json` is current |
| Focused tests | `npm test` | Vitest exits 0 with all tests passing |
| Type check | `npm run typecheck` | TypeScript exits 0 with no diagnostics |
| Build | `npm run build` | `dist/` is emitted successfully |
| Harness check | `npm run harness:check` | Project contract check prints `harness-check: PASS` |
| Fixture runtime | `npm run serve:fixture` | Server reports a loopback URL and stops on SIGINT/SIGTERM |
| Live browser smoke | `npm run smoke:live` | JSON reports `passed: true` for vanilla CDP breakpoint evidence |
| React/Vite smoke | `npm run smoke:react-vite` | JSON reports `passed: true` for React state, render-cause/commit evidence, Vite transform diff, replay timeline/seek, source, and module evidence |
| Next smoke | `npm run smoke:next` | JSON reports `passed: true` for Next runtime metadata, bounded server log evidence, and UI evidence |
| Safari smoke | `npm run smoke:safari` | JSON reports `passed: true` for Safari WebDriver actions, DOM, screenshot, and explicit capability warnings |

## Working contract

- Use the active ExecPlan for cross-cutting or context-loss-sensitive changes.
- Keep the MCP surface small; add an adapter before adding a new public tool when an existing tool can carry the behavior.
- Keep protocol output on stdout and diagnostics on stderr.
- Preserve loopback-only targets, same-origin navigation, bounded output, and redaction defaults.
- Do not add remote, production, credentialed, destructive, or hosted behavior without explicit scope and a matching security/verification update.
- Do not create or switch branches as part of ordinary implementation.

## Definition of done

A change is locally complete when the focused tests, type check, build, and `npm run harness:check` pass; the relevant evidence contract and active plan are updated; and any unverified browser, framework, or production surface is named explicitly.
