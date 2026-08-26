# Technical Debt Tracker

| ID | Area | Evidence | Impact | Owner | Next action or revisit trigger | Status |
| --- | --- | --- | --- | --- | --- | --- |
| DEBT-001 | Framework adapters | Capability detection reports React, Vite, and Next markers but no semantic adapter is wired yet | Live component/source correlation is not available | Platform Engineering | Add one adapter only after the core fixture and evidence contract remain stable | open |
| DEBT-002 | Live browser coverage | Tests use a fake adapter because this environment may not provide a Chromium executable | CDP breakpoint and screenshot behavior remains candidate-only until live smoke runs | Platform Engineering | Run the fixture with an isolated Chromium executable or CDP endpoint | open |
| DEBT-003 | Harness certification | Adaptive harness routes exist without HMAC evidence or a certification overlay | The repository is not `harness-ready` | Platform Engineering | Adopt the full certification profile only when evidence authority and attestation scope are explicitly required | open |
