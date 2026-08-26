# Technical Debt Tracker

| ID | Area | Evidence | Impact | Owner | Next action or revisit trigger | Status |
| --- | --- | --- | --- | --- | --- | --- |
| DEBT-001 | Framework adapters | Automatically injected React bridge, Vite module graph/HMR summary, and Next dev-server metadata/log tail are available, but full React DevTools profiling, Vite hot-update diff/transform tracing, Next server debugging, and Server Action resolution are not wired | Deep framework diagnosis remains partial | Platform Engineering | Add one adapter only after its runtime contract has a deterministic fixture | open |
| DEBT-002 | Cross-host live browser coverage | Default tests use a fake adapter, while local vanilla, React/Vite, and Next live smokes pass with the explicit macOS Chrome executable | Other hosts still need their own Chromium/CDP evidence | Platform Engineering | Run the three live smoke commands on a host with an explicit browser target | open |
| DEBT-003 | Harness certification | Adaptive harness routes exist without HMAC evidence or a certification overlay | The repository is not `harness-ready` | Platform Engineering | Adopt the full certification profile only when evidence authority and attestation scope are explicitly required | open |
