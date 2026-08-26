import { useState } from "react";

export function CheckoutForm({ currency = "TRY" }) {
  const [amount, setAmount] = useState("249.90");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  function handleSubmit() {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      console.error("Payment validation failed");
      setError("Invalid amount");
      setSubmitted(false);
      return;
    }
    setError(null);
    setSubmitted(true);
  }

  return (
    <section aria-labelledby="checkout-title">
      <h2 id="checkout-title">React checkout</h2>
      <label>
        Amount ({currency})
        <input
          aria-label="Amount"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setSubmitted(false);
          }}
        />
      </label>
      <button type="button" onClick={handleSubmit}>
        Submit payment
      </button>
      <p role="status">{error ?? (submitted ? `Payment submitted: ${amount}` : "Ready")}</p>
    </section>
  );
}

export function App() {
  return (
    <main>
      <h1>Checkout fixture</h1>
      <CheckoutForm />
    </main>
  );
}
