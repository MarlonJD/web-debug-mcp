# Product Specifications

The public README remains the installation and user-facing overview. Durable behavior is now split because setup/readiness, structured MCP output, session lifecycle, browser actions, compatibility, and evaluation have independent change triggers.

- [`web-debug-contract.md`](web-debug-contract.md) owns the public workflow, output, action, trust, and lifecycle contract.
- [`../COMPATIBILITY.md`](../COMPATIBILITY.md) owns declared versus locally verified runtime versions.
- [`../design-docs/scenario-persistence-boundary.md`](../design-docs/scenario-persistence-boundary.md) owns the in-memory scenario decision.
- [`../demos/agent-evaluation.md`](../demos/agent-evaluation.md) owns frozen agent repair tasks and graders.
