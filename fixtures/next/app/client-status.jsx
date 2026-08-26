"use client";

import { useActionState, useState } from "react";

export function ClientStatus({ submitPayment }) {
  const [status, setStatus] = useState("Ready");
  const [paymentState, paymentAction, paymentPending] = useActionState(submitPayment, null);

  async function checkHealth() {
    const response = await fetch("/api/health");
    const payload = await response.json();
    setStatus(payload.status);
  }

  return (
    <section aria-labelledby="client-status-title">
      <h2 id="client-status-title">Client health</h2>
      <button id="health-button" type="button" onClick={checkHealth}>Check health</button>
      <p role="status">{status}</p>
      <form action={paymentAction}>
        <button id="payment-button" type="submit" disabled={paymentPending}>Submit payment</button>
      </form>
      <p id="server-action-status">{paymentState?.status ?? "Not submitted"}</p>
    </section>
  );
}
