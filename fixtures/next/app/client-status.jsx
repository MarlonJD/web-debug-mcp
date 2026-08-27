"use client";

import { useActionState, useEffect, useState } from "react";

export function ClientStatus({ submitPayment }) {
  const [status, setStatus] = useState("Ready");
  const [hydrated, setHydrated] = useState(false);
  const [healthRequestSettled, setHealthRequestSettled] = useState(false);
  const [paymentState, paymentAction, paymentPending] = useActionState(submitPayment, null);

  useEffect(() => {
    setHydrated(true);
    document.querySelector("[data-testid='hydration-status']")?.setAttribute("data-hydrated", "true");
  }, []);

  async function checkHealth() {
    try {
      const response = await fetch("/api/health");
      const payload = await response.json();
      setStatus(payload.status);
    } finally {
      setHealthRequestSettled(true);
    }
  }

  return (
    <section aria-labelledby="client-status-title">
      <h2 id="client-status-title">Client health</h2>
      <p data-testid="hydration-status" data-hydrated={hydrated ? "true" : "false"}>{hydrated ? "Hydrated" : "Hydrating"}</p>
      <button id="health-button" type="button" onClick={checkHealth}>Check health</button>
      <p role="status">{status}</p>
      <p data-testid="health-request-settled">{healthRequestSettled ? "Health request settled" : "Health request pending"}</p>
      <form action={paymentAction}>
        <button id="payment-button" type="submit" disabled={paymentPending}>Submit payment</button>
      </form>
      <p id="server-action-status">{paymentState?.status ?? "Not submitted"}</p>
    </section>
  );
}
