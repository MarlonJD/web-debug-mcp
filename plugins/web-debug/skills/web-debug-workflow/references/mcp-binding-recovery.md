# MCP binding recovery

Read this only when a live Web Debug call is unavailable or startup fails. Repository review, skill editing, and native package tests do not require a browser binding.

An explicit request to execute Web Debug browser work is fail closed. The first browser-work operation must be one real call to the bundled `web_project_detect` tool in the current Codex task. A doctor result, an MCP process visible in a terminal, a package install, or a skill being loaded is not proof that this task owns a callable tool namespace.

If `web_project_detect` is absent, cannot be called, or MCP initialization/tool discovery failed, stop and report exactly one blocker: `MCP_CLIENT_BINDING_UNAVAILABLE` when the task cannot see the bundled tool, or `MCP_SERVER_STARTUP_UNAVAILABLE` when the bundled server reported a startup failure. Include the bounded server diagnostic when one is available. Do not continue with or substitute any of the following:

- repository Playwright or Puppeteer;
- raw CDP, browser DevTools, or another browser connector;
- a direct MCP SDK transport or an ad-hoc stdio client;
- a naked `npx web-debug-mcp`/`node` server process started from the task;
- `web-debug-mcp cleanup` as a way to bind tools or repair the current task.

These prohibitions apply even when the requested browser evidence appears simple. A native runner may be used only when the user separately asks for native-runner evidence or the request is not an explicit Web Debug invocation; it cannot be a fallback for a missing Web Debug binding.

The supported recovery handoff is: inspect the reported package/registry startup condition, repair only an identity-safe stale registry condition if needed, then use Codex Settings → MCP servers → Restart (or restart the IDE extension) and retry Gate 0 in the same task. If the tool namespace remains absent, start a new task/session. Never claim Web Debug evidence until the bundled `web_project_detect` call succeeds.

The current supported Codex host baseline is CLI `0.152.0` or newer. CLI `0.151.0` added optional-MCP discovery grace but does not replace a missing binding; older hosts are candidate-only for this recovery contract. Plugin `.mcp.json` supports the bundled launch command and bounded timeouts, but `required` is currently a `config.toml` MCP-server option rather than a plugin manifest field. Do not invent `required` in the plugin manifest. For a strict direct-server configuration, use the documented user config override with `required = true`, keep the plugin's bundled connection disabled to avoid duplicate registrations, and still require Gate 0.
