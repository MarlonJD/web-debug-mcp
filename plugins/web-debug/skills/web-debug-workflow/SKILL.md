---
name: web-debug-workflow
description: Use when reproducing, inspecting, capturing, or verifying a bug in a running local web application with the bundled Web Debug MCP server.
---

# Web Debug Workflow

Use the bundled web-debug-mcp tools when a local web application needs browser-grounded evidence. The MCP server remains the execution boundary; this skill supplies the workflow and safety context.

## Workflow

1. Call web_project_detect with the current project root.
2. Start one explicit local session with web_session_start. Prefer a loopback URL and Chromium launch mode with an explicit executable path.
3. Reproduce the issue with bounded web_browser_action calls. Use web_breakpoint_set, web_debug_control, and web_debug_evaluate only when the evidence needs JavaScript debugger state.
4. Capture the failure with web_issue_capture. The result combines bounded browser, console, network, screenshot, debugger, framework, and replay evidence.
5. For React or Vite issues, inspect the automatic React bridge and Vite module/HMR evidence in the capture. For Next.js issues, use web_next_inspect only for route compilation or Server Action lookup.
6. For a repeatable regression, store the flow with web_repro_record and rerun it with web_fix_verify after the code change.
7. Use web_replay_seek for one retained frame or safe action restoration. Treat it as bounded action replay, not application-state time travel.
8. Close the session with web_session_close when the workflow ends.

## Safety and interpretation

- Keep targets on loopback by default. Do not set allowRemote without explicit user authorization.
- Do not use credentialed browser profiles or infer production readiness from local evidence.
- Side-effectful evaluation and replay restore mutate the browser. Request them only when the debugging task needs them.
- Missing optional framework or browser signals are capability warnings, not proof that the issue is absent.
- Treat redacted values, bounded arrays, and temporary screenshot paths as part of the evidence contract.
- If Vite evidence is needed, ensure the app uses webDebugVitePlugin in development only; never enable that plugin in production.
