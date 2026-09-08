import { registerPaymentTool } from "./payment-tool.js";

const submit = document.querySelector("#submit");
const amount = document.querySelector("#amount");
const status = document.querySelector("#status");

function submitPayment(numericAmount, { signal } = {}) {
  signal?.throwIfAborted();
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 1_000_000) throw new Error("PAYMENT_INPUT_INVALID");
  // Synthetic fixture ledger: separate from the rendered status and tool output.
  window.__WEB_DEBUG_PAYMENT_RECEIPT__ = `Payment submitted: ${numericAmount.toFixed(2)}`;
  status.textContent = `Payment submitted: ${numericAmount.toFixed(2)}`;
}

submit.addEventListener("click", () => {
  try { submitPayment(Number(amount.value)); }
  catch {
    console.error("Payment validation failed");
    status.textContent = "Invalid amount";
  }
});

const modelContext = document.modelContext;
if (modelContext && typeof modelContext.registerTool === "function") {
  let lifetime;
  const mount = () => {
    lifetime?.abort();
    lifetime = new AbortController();
    void registerPaymentTool(modelContext, submitPayment, { signal: lifetime.signal }).catch(() => {});
  };
  window.addEventListener("pagehide", () => lifetime?.abort());
  window.addEventListener("pageshow", (event) => { if (event.persisted) mount(); });
  mount();
}
