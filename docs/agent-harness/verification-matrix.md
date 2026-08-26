# Verification Matrix

| Change surface | Fast check | Broader check | Behavioral evidence | Fallback or blocker | Owner/update trigger |
| --- | --- | --- | --- | --- | --- |
| Core/session logic | `npm test -- --run test/session-manager.test.ts` | `npm test` | Session starts, captures evidence, verifies a scenario, and closes | Live browser is not required for fake-adapter contract tests | Platform Engineering; lifecycle change |
| Redaction/privacy | `npm test -- --run test/redaction.test.ts` | `npm test` | Sensitive keys and URL values are redacted while ordinary IDs remain | Add a regression test for every new exposed field | Platform Engineering; evidence-shape change |
| MCP schemas | `npm run typecheck` | `npm run build` | Server compiles with the expected typed tool boundary | Live handshake remains candidate until an MCP client exercise | Platform Engineering; public tool change |
| Browser adapter | `npm run typecheck` | `npm run smoke:live` | DOM, console, network, screenshot, and debugger evidence from a loopback page | `WEB_DEBUG_CHROME_EXECUTABLE_PATH` or CDP endpoint may be unavailable | Platform Engineering; Playwright/CDP change |
| Fixture behavior | `npm test -- --run test/fixture-contract.test.ts` | Fixture server + live browser flow | Submit action produces the declared status text | No browser means structural fixture proof only | Test ownership; fixture change |
| React/Vite adapter | `npm run typecheck` | `npm run smoke:react-vite` | Component tree, hook state, bounded commit profiler/inferred render cause, source breakpoint, Vite module graph/HMR status and transform diff, screenshot, and scenario verification | Requires Vite dependencies and an explicit Chromium executable | Platform Engineering; React bridge, Vite plugin, or fixture change |
| Next adapter | `npm run typecheck` | `npm run smoke:next` | Next runtime tools, routes, project metadata, compilation issues, bounded server log tail, route handler, and browser evidence | Requires Next dev server and an explicit Chromium executable | Platform Engineering; Next adapter or fixture change |
| Next inspection | `npm run typecheck` | `npm run smoke:next` | Allowlisted route compilation and Server Action resolution through the single MCP facade | Requires Next 16 development MCP endpoint; missing optional tool remains explicit | Platform Engineering; `web_next_inspect` schema or adapter change |
| Harness/docs | `npm run harness:check` | `python3 /Users/marlonjd/.codex/skills/harness-engineering/scripts/harness.py check --root .` | Required routes, commands, docs, and tool names remain discoverable | Harness skill path is external tooling; project check remains native | Platform Engineering; authority or command change |
| Security boundary | `npm test` | Manual local review of `docs/SECURITY.md` plus live redaction exercise | Remote target rejection, same-origin policy, and redaction evidence | Production/security review is not in scope for this commit | Platform Engineering; trust-boundary change |

Use the narrowest fast check first. A missing browser blocks only live browser evidence; it does not turn deterministic core tests into a pass by inference.
