const submit = document.querySelector("#submit");
const amount = document.querySelector("#amount");
const status = document.querySelector("#status");

submit.addEventListener("click", () => {
  const numericAmount = Number(amount.value);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    console.error("Payment validation failed");
    status.textContent = "Invalid amount";
    return;
  }
  status.textContent = `Payment submitted: ${numericAmount.toFixed(2)}`;
});

// The fixture exposes one deterministic WebMCP capability only when the
// browser has the opt-in page API enabled. The visible status and this
// in-memory receipt are independent oracles for direct-action smoke tests.
const modelContext = document.modelContext;
if (modelContext && typeof modelContext.registerTool === "function") {
  modelContext.registerTool({
    name: "submit_payment",
    title: "Submit payment",
    description: "Submit one positive checkout amount.",
    inputSchema: {
      type: "object",
      properties: { amount: { type: "number", exclusiveMinimum: 0 } },
      required: ["amount"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async ({ amount }) => {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error("amount must be positive");
      const receipt = `Payment submitted: ${numericAmount.toFixed(2)}`;
      status.textContent = receipt;
      window.__WEB_DEBUG_PAYMENT_RECEIPT__ = receipt;
      return receipt;
    },
  });
}
