# Entropy Cleanup Checklist

Run this checklist when the public MCP surface, adapter set, or documentation changes:

- Confirm every public tool still has one owner in `src/index.ts`.
- Confirm adapters remain behind `src/adapters/browser.ts` and do not duplicate session policy.
- Confirm new evidence fields have bounds, redaction behavior, and a test.
- Confirm README, architecture, registry, and verification commands agree.
- Confirm fixture actions remain deterministic and do not depend on external services.
- Confirm temporary artifacts and browser processes have a documented cleanup path.
- Confirm unsupported framework or production claims remain explicit.

Repeated failures should become a focused test, a harness check, a reliability rule, or a tracked debt item rather than another informal note.
