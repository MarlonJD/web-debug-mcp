# Compatibility

This matrix separates declared package support from behavior verified on an exact local runtime. It describes the source-next working tree and remains release pending; the published npm/plugin `0.3.3` contract is unchanged. A version not listed as verified is not implicitly unsupported; it is simply candidate-only until the corresponding deterministic fixture and live smoke pass. The exact current local observations are recorded in [`compatibility-evidence.json`](compatibility-evidence.json).

| Surface | Declared | Verified locally | Candidate or unavailable |
| --- | --- | --- | --- |
| Node.js | `>=20` from `package.json` | `24.18.0` for deterministic tests, build, stdio, doctor, and Chromium flows | Node 20 and 22 minimum-runtime jobs are not run in this local-only task |
| MCP SDK | Package lock | `@modelcontextprotocol/sdk 1.30.0` with output schemas, structured content, progress, resources, cancellation, and in-memory transport | Other MCP client implementations require their own handshake |
| Chromium | Explicit executable or CDP endpoint | Google Chrome `151.0.7922.174` local launch; exact live result is recorded by the Chromium smokes | Approved external CDP remains authority-gated |
| Safari | Local W3C WebDriver | Safari `26.5.2` for visible WebDriver/BiDi compatibility when host automation is enabled | Debugger parity and pre-request top-level interception are unavailable; cross-origin state is post-navigation quarantined |
| React | Development runtime | React and React DOM `19.2.8` fixture | Other React majors are candidate-only |
| Vite | Development plugin endpoint | Vite `7.3.6` and `@vitejs/plugin-react 5.1.1` fixture | Other Vite/plugin combinations are candidate-only |
| Next.js | Compatible development `/_next/mcp` endpoint | Next `16.3.3` with React `19.2.8` fixture | Other Next versions are candidate-only |

## Update rule

Change a row to `verified locally` only after the exact package/runtime version passes its deterministic contract plus the relevant live smoke. Keep remote browsers, provider authority, production environments, and release publication as separate evidence scopes.
