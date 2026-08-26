import { ClientStatus } from "./client-status";
import { submitPayment } from "./actions";

async function getGreeting() {
  return "Next server component ready";
}

export default async function Page() {
  const greeting = await getGreeting();

  return (
    <main>
      <h1>Next checkout fixture</h1>
      <p id="server-status">{greeting}</p>
      <ClientStatus submitPayment={submitPayment} />
    </main>
  );
}
