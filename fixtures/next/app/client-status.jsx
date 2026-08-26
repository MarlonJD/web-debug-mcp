"use client";

import { useState } from "react";

export function ClientStatus({ submitPayment }) {
  const [status, setStatus] = useState("Ready");

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
      <form action={submitPayment}>
        <button id="payment-button" type="submit">Submit payment</button>
      </form>
    </section>
  );
}
