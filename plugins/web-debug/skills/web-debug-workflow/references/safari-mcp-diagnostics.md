# Safari MCP diagnostics

Use this route only for a local Safari-focused diagnosis when a separately configured Safari 27 MCP server is already available. It is an optional external diagnostic session, not `SafariAdapter`, not a fallback transport, and not qualification evidence.

## Preconditions

- The user asked for Safari diagnosis or the current local bug needs Safari console/network evidence that WebDriver/BiDi did not provide decisively.
- The target is one exact non-credentialed loopback origin.
- The connected Safari MCP catalog exposes `create_tab`, `navigate_to_url`, `browser_console_messages`, `list_network_requests`, and `close_tab` with the observed handle fields.
- If any required tool or handle field is missing, skip this route and report it unavailable. Continue with WebDriver/BiDi; do not broaden the allowlist.

## Bounded workflow

1. Call `create_tab` once and retain only its returned handle.
2. Call `navigate_to_url` with that exact handle as `tab_uuid` and the approved loopback URL. Reject a non-loopback or different final origin.
3. Read summary-only console evidence with `browser_console_messages(tab_handle: ownedHandle, limit: 100, clear: true)`.
4. Read one network-summary batch with `list_network_requests(tab_handle: ownedHandle, clear: true)`. Do not request headers or bodies.
5. In `finally`, call `close_tab(handle: ownedHandle)`. Never enumerate, switch, inspect, navigate, or close another tab.

Keep at most 100 console rows, 100 network summary rows, and 32,000 serialized characters from each result in the diagnostic report. If the connector returns an oversized or malformed result before a bounded projection is possible, discard it and report the diagnostic as unavailable rather than partial success.

## Forbidden tools and claims

Do not call `list_tabs`, `switch_tab`, `get_network_request`, `page_info`, `page_interactions`, `get_page_content`, `screenshot`, `evaluate_javascript`, `set_viewport_size`, `wait_for_navigation`, `browser_dialogs`, or `set_emulated_media` from this route. Their observed Safari 27 schemas are ambient, full-detail, or otherwise outside the owned-handle diagnostic subset.

Report the result as `Safari MCP separate diagnostic session` with its own origin, tab handle, tool provenance, warnings, and cleanup outcome. Never merge it into a Web Debug evidence bundle, imply it observed the WebDriver session's state, use it as an independent mutation oracle, or let it award native qualification PASS.
