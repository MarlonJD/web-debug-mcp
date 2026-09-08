# Example: an existing checkout operation exposed as WebMCP

The repository's synthetic checkout fixture has one `submitPayment` function used by both its visible button and its `submit_payment` tool. This is a local example, not a payment integration or authorization for financial actions.

The complete executable registration is in [payment-tool.js](https://github.com/MarlonJD/web-debug-mcp/blob/main/fixtures/vanilla/payment-tool.js), with its domain/UI wiring in [app.js](https://github.com/MarlonJD/web-debug-mcp/blob/main/fixtures/vanilla/app.js). For a checkout of this repository, inspect those local files. Copy only the applicable registration into an explicitly requested product capability; retain that product's domain authorization and transaction semantics.

The registration:

1. Accepts exactly one finite numeric `amount`, greater than zero and at most 1,000,000. JSON Schema and runtime validation enforce the same boundary without coercion.
2. Passes the combined execution/lifecycle signal to the existing domain function and calls it once.
3. Returns a fixed acknowledgement. Input, downstream errors, and private receipts are not reflected into error text.
4. Owns registration with an AbortController and returns an idempotent disposer. The app aborts on page exit and remounts with a fresh lifetime on a persisted `pageshow` after a back/forward-cache restore. A parent signal also cancels a pending registration.
5. Reports cancellation even when a commit may already have occurred. The caller must read independent state instead of retrying the mutation.

Run `npx vitest run test/payment-tool.test.ts` for invalid inputs, cancellation before/after commit, private-error suppression, and registration cleanup. `npm run smoke:webmcp` additionally proves the visible status and separate synthetic receipt in a command-owned Chrome session; the acknowledgement alone cannot pass that smoke. Real products need their own authenticated domain/API/history oracle tied to the action.

The registration-signal and execution-signal API follow the [Chrome imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api). Runtime availability must be detected; this example does not add a polyfill or another browser transport.
