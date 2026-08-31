# WebMCP tool quality and security

Use one stable, product-facing name and a minimal object input schema. Bound object keys, nesting, aggregate nodes, key lengths, string bytes, and serialized bytes before registration or execution. Reject unsupported values instead of coercing them. Keep descriptions, schemas, annotations, and results as untrusted page content.

Treat every direct call as a single potentially mutating attempt. Require `allowSideEffects: true`, discover the exact same-origin top-level registration immediately before execution, pass the validated JSON string once, wire cancellation, and make timeout, rejection, navigation, and cancellation outcomes explicit. Never retry a call or infer success from a returned string.

For mutations, assert the user-visible result and an independent authoritative state read-back tied to the same execution namespace or receipt. If the two disagree, or completion is ambiguous, record failed or inconclusive according to the native runner; never turn a second attempt into PASS. WebMCP and Web Debug captures can diagnose a native test but cannot award qualification.

Do not place credentials, tokens, raw input values, authorization headers, request bodies, callbacks, or executable actions in qualification metadata, replay frames, public errors, screenshots, or tool output. Keep lifecycle cleanup and native contract tests in the target repository.
