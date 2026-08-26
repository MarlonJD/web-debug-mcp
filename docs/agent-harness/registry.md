# Agent Capability Registry

| Capability | Entry point | Purpose | Expected signal | Owner/update trigger | Status |
| --- | --- | --- | --- | --- | --- |
| Repository setup | `npm install --no-audit --no-fund` | Install pinned dependencies | Exit 0 and current lockfile | Platform Engineering; dependency change | verified locally |
| Focused tests | `npm test` | Exercise redaction, detection, sessions, and fixture contracts | Vitest exits 0 | Platform Engineering; behavior change | verified locally |
| Type/build validation | `npm run typecheck && npm run build` | Prove TypeScript contract and emitted server | Both commands exit 0 | Platform Engineering; source/dependency change | verified locally |
| Project-native harness gate | `npm run harness:check` | Check required paths, public tools, docs, and stdout boundary | Prints `harness-check: PASS` | Platform Engineering; repository contract change | verified locally |
| Fixture runtime | `npm run serve:fixture` | Launch deterministic loopback browser target | Reports `http://127.0.0.1:4173/` | Test ownership; fixture behavior change | candidate |
| Live browser smoke | `npm run smoke:live` | Exercise CDP breakpoint, pause-safe capture, screenshot, and cleanup | JSON reports `passed: true` | Platform Engineering; Chromium/CDP change | verified locally |
| Remote CDP policy | `test/chromium-policy.test.ts` | Verify remote endpoint default-deny and protocol validation | Deterministic `REMOTE_CDP_BLOCKED`/protocol failures before connection | No external host is exercised in this environment | Platform Engineering; remote target policy change | verified locally |
| Live React/Vite smoke | `npm run smoke:react-vite` | Exercise injected React component/state bridge, commit profiler/render-cause evidence, Vite source URL/module graph/transform diff, breakpoint, verification, and cleanup | JSON reports `passed: true` with React, profiler, Vite diff, and breakpoint assertions | Platform Engineering; React/Vite adapter change | verified locally |
| Live Next smoke | `npm run smoke:next` | Exercise Next `/_next/mcp`, App Router routes, route handler, bounded server log tail, browser state, and cleanup | JSON reports `passed: true` with Next runtime assertions | Platform Engineering; Next adapter or fixture change | verified locally |
| Live Safari smoke | `npm run smoke:safari` | Exercise Safari WebDriver actions, DOM, screenshot, cleanup, and explicit unsupported-capability warnings | JSON reports `passed: true` with Safari target evidence and CDP-gap warnings | Requires macOS Safari remote automation or a loopback WebDriver endpoint | Platform Engineering; Safari adapter or browser policy change | verified locally |
| Next inspection | `web_next_inspect` | Compile one local route or resolve one Server Action through the allowlisted Next MCP tools | Structured result with `routeSpecifier`/`issues` or action filename/function | Requires a running Next dev server and a known action ID for action lookup | Platform Engineering; Next inspection contract change | verified locally |
| Replay seek | `web_replay_seek` | Inspect one retained redacted frame from a live session without browser mutation | Structured frame with retained index, trigger, DOM, framework, and debugger state | Frames are bounded and older indices may be truncated | Platform Engineering; replay timeline change | verified locally |
| MCP runtime | `npm run dev` or `node dist/index.js` | Serve the MCP tool surface over stdio | Process stays alive with protocol stdout only | Platform Engineering; MCP API change | candidate |
| Browser evidence | `web_session_start` → `web_issue_capture` | Collect bounded runtime evidence | JSON evidence bundle with redaction marker | Platform Engineering; adapter change | candidate |
| Repro verification | `web_repro_record` → `web_fix_verify` | Replay a flow and evaluate checks | `passed: true` with evidence | Platform Engineering; scenario contract change | candidate |
| Source-control context | `git status --short --branch` | Inspect local changes before handoff | Current branch and worktree state | Platform Engineering; every handoff | verified locally |

Statuses are literal: `verified locally` means the command ran in this task environment; `candidate` means the path is implemented or documented but has not had a live Chromium exercise in this environment.
