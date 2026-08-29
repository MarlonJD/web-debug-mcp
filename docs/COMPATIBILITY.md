# Compatibility

This matrix separates the immutable released `0.4.0` runtime from source-only `0.5.0-next.0` behavior verified on exact local development fixtures. A version not listed as verified is not implicitly unsupported; it is candidate-only until its deterministic contract and live smoke pass. Exact local observations are recorded in [`compatibility-evidence.json`](compatibility-evidence.json); they are not release, plugin-promotion, HMAC-certification, or production authority.

| Surface | Declared | Verified locally | Candidate or unavailable |
| --- | --- | --- | --- |
| Node.js | `>=20` from `package.json` | `24.18.0` for deterministic tests, build, stdio, doctor, and Chromium flows | Node 20 and 22 minimum-runtime jobs are not run in this local-only task |
| MCP SDK | Package lock | `@modelcontextprotocol/sdk 1.30.0` with output schemas, structured content, progress, resources, cancellation, and in-memory transport | Other MCP client implementations require their own handshake |
| Chromium | Explicit executable or CDP endpoint | Google Chrome `151.0.7922.174` local launch; exact live result is recorded by the Chromium smokes | Approved external CDP remains authority-gated |
| Safari | Local W3C WebDriver | Safari `26.5.2` for visible WebDriver/BiDi compatibility when host automation is enabled | Debugger parity and pre-request top-level interception are unavailable; cross-origin state is post-navigation quarantined |
| React | Development runtime | React and React DOM `19.2.8` fixture | Other React majors are candidate-only |
| Vite | Development plugin endpoint | Vite `7.3.6` and `@vitejs/plugin-react 5.1.1` fixture | Other Vite/plugin combinations are candidate-only |
| Next.js | Compatible development `/_next/mcp` endpoint | Next `16.3.3` with React `19.2.8` fixture | Other Next versions are candidate-only |
| Angular | Chromium development runtime with documented `window.ng` globals | Angular `21.2.22`, TypeScript `5.9.2`, and Angular CLI development fixture with bounded DOM-host component/state evidence | Angular 22/TypeScript 6, optimized builds, injector/router/profiler trees, SSR/hydration, Safari enrichment, and other Angular versions are candidate-only |
| Vue | Vue 3 Chromium development runtime plus optional Web Debug Vite endpoint | Vue `3.5.42`, `@vitejs/plugin-vue 6.0.8`, and Vite `7.3.6` fixture with safely chained DevTools-hook component evidence and Vite HMR provenance | Vue 2, Nuxt, production devtools flags, DOM-private fallbacks, Safari enrichment, and other Vue versions are candidate-only |
| Test runner | Repository development gate | Vitest `4.1.11`; upgraded to satisfy Angular build's supported peer range | Other Vitest majors are not claimed |

## Update rule

Change a row to `verified locally` only after the exact package/runtime version passes its deterministic contract plus the relevant live smoke. Keep remote browsers, provider authority, production environments, and release publication as separate evidence scopes.
