// One fixture capability, sharing the application's submitPayment domain function.
// The caller owns UI/domain read-back; the returned acknowledgement is not an oracle.
export async function registerPaymentTool(modelContext, submitPayment, { signal: parentSignal } = {}) {
  const lifetime = new AbortController();
  const registrationSignal = parentSignal ? AbortSignal.any([lifetime.signal, parentSignal]) : lifetime.signal;
  const dispose = () => lifetime.abort();
  try {
    await modelContext.registerTool({
      name: "submit_payment",
      title: "Submit payment",
      description: "Submit one positive checkout amount up to 1000000.",
      inputSchema: {
        type: "object",
        properties: { amount: { type: "number", exclusiveMinimum: 0, maximum: 1_000_000 } },
        required: ["amount"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input, { signal } = {}) => {
        if (!input || typeof input !== "object" || Array.isArray(input)
          || Object.keys(input).length !== 1 || !Object.hasOwn(input, "amount")
          || typeof input.amount !== "number" || !Number.isFinite(input.amount)
          || input.amount <= 0 || input.amount > 1_000_000) throw new Error("PAYMENT_INPUT_INVALID");
        const operation = signal ? AbortSignal.any([registrationSignal, signal]) : registrationSignal;
        try {
          operation.throwIfAborted();
          await submitPayment(input.amount, { signal: operation });
          operation.throwIfAborted();
          return "payment-submitted";
        } catch {
          // Cancellation after a commit is deliberately ambiguous; callers read state.
          throw new Error(operation.aborted ? "PAYMENT_CANCELLED" : "PAYMENT_FAILED");
        }
      },
    }, { signal: registrationSignal });
    return dispose;
  } catch {
    dispose();
    throw new Error("PAYMENT_REGISTRATION_FAILED");
  }
}
