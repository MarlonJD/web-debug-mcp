# Documentation Map

| Topic | Canonical source | Update trigger |
| --- | --- | --- |
| Agent instructions | [`../AGENTS.md`](../AGENTS.md) | Commands, constraints, or definition of done changes |
| Architecture | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Components, boundaries, or data flow changes |
| Product behavior | [`../README.md`](../README.md) | Public workflow or supported boundary changes |
| Source-next product contract | [`product-specs/web-debug-contract.md`](product-specs/web-debug-contract.md) | Output, action, trust, lifecycle, or release-pending behavior changes |
| Plugin packaging | [`../plugins/web-debug/`](../plugins/web-debug/), [`../.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json), and [`../.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) | Codex/ChatGPT/Claude Code plugin identity, bundled MCP, skill, or marketplace changes |
| Security | [`SECURITY.md`](SECURITY.md) | Sensitive data, trust boundary, or permission changes |
| Reliability | [`RELIABILITY.md`](RELIABILITY.md) | Lifecycle, timeout, retry, or cleanup changes |
| Comparison demo | [`demos/comparison.md`](demos/comparison.md) | Before/after debugging examples and measured local evidence coverage |
| Agent task evaluation | [`demos/agent-evaluation.md`](demos/agent-evaluation.md) | Frozen repair prompts, deterministic graders, or run metadata changes |
| Release notes | [`releases/0.4.0.md`](releases/0.4.0.md) | Public release behavior, breaking changes, or verification scope changes |
| Compatibility | [`COMPATIBILITY.md`](COMPATIBILITY.md) and [`compatibility-evidence.json`](compatibility-evidence.json) | Declared or locally verified runtime/framework versions change |
| Examples and evidence | [`examples-evidence.md`](examples-evidence.md) | User-facing before/after stories, evidence snippets, and why to use the MCP |
| ExecPlan policy | [`PLANS.md`](PLANS.md) | Planning or lifecycle changes |
| Work registry | [`exec-plans/index.md`](exec-plans/index.md) | A plan starts, completes, or is superseded |
| Agent harness | [`agent-harness/index.md`](agent-harness/index.md) | Agent capabilities or verification paths change |
| Design rationale | [`design-docs/index.md`](design-docs/index.md) | A cross-cutting design decision changes |
