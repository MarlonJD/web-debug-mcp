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
