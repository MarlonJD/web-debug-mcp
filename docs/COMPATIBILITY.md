# Compatibility

This matrix records source-next `0.7.0-next.0` behavior on exact local development fixtures and package handshakes. The immutable released npm/GitHub and installed plugin runtime remain `0.6.0`. A version not listed as verified is not implicitly unsupported; it is candidate-only until its deterministic contract and live smoke pass. Exact local observations are recorded in [`compatibility-evidence.json`](compatibility-evidence.json); they are not HMAC certification, provider authority, deployment, or production evidence.

| Surface | Declared | Verified locally | Candidate or unavailable |
| --- | --- | --- | --- |
| Node.js | `>=20` from `package.json` | `24.18.0` for deterministic tests/build/live flows; `20.20.2` and `22.23.2` for exact final-archive stdio initialization, 13-tool listing, and output schemas | Full deterministic and live browser matrices under Node 20/22 remain candidate-only |
| MCP SDK | Package lock | `@modelcontextprotocol/sdk 1.30.0` with output schemas, structured content, progress, resources, cancellation, and in-memory transport | Other MCP client implementations require their own handshake |
| Chromium | Explicit executable or CDP endpoint | Google Chrome `151.0.7922.174` local launch; exact live result is recorded by the Chromium smokes | Approved external CDP remains authority-gated |
| Chrome WebMCP | Explicit `--enable-features=WebMCP` local-development opt-in | Google Chrome `151.0.7922.174` headless and visible command-owned sessions; `document.modelContext`, registration/discovery, exact JSON-string execution, opaque result, replay/screenshot safety, and independent fixture oracle pass | Origin-trial/native provenance, cross-origin exposure, and remote browsers remain candidate-only |
| Safari | Local W3C WebDriver | Safari `26.6.2` deterministic and fresh source-next WebDriver/BiDi action/DOM/screenshot/network-fallback contracts pass; immutable `0.5.0` retains historical evidence | Safari `27.0` MCP initialized on another MacBook but failed the full cutover gate (36 passed/10 failed/7 blocked); WebDriver/BiDi remains the sole internal transport. The workflow-only owned-handle console/network diagnostic subset is candidate-only on this host |
| React | Development runtime | React and React DOM `19.2.8` fixture | Other React majors are candidate-only |
| Vite | Development plugin endpoint | Vite `7.3.6` and `@vitejs/plugin-react 5.1.1` fixture | Other Vite/plugin combinations are candidate-only |
| Next.js | Compatible development `/_next/mcp` endpoint | Next `16.3.3` with React `19.2.8` fixture | Other Next versions are candidate-only |
| Angular | Chromium development runtime with documented `window.ng` globals | Angular `21.2.22`, TypeScript `5.9.2`, and Angular CLI development fixture with bounded DOM-host component/state evidence | Angular 22/TypeScript 6, optimized builds, injector/router/profiler trees, SSR/hydration, Safari enrichment, and other Angular versions are candidate-only |
| Vue | Vue 3 Chromium development runtime plus optional Web Debug Vite endpoint | Vue `3.5.42`, `@vitejs/plugin-vue 6.0.8`, and Vite `7.3.6` fixture with safely chained DevTools-hook component evidence and Vite HMR provenance | Vue 2, Nuxt, production devtools flags, DOM-private fallbacks, Safari enrichment, and other Vue versions are candidate-only |
| Test runner | Repository development gate | Vitest `4.1.11`; upgraded to satisfy Angular build's supported peer range | Other Vitest majors are not claimed |

## Update rule

Change a row to `verified locally` only after the exact package/runtime version passes its deterministic contract plus the relevant live smoke. Keep remote browsers, provider authority, production environments, and release publication as separate evidence scopes.
