import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Next fixture contract", () => {
  it("contains App Router, server-rendered, client, and route-handler surfaces", () => {
    const layout = readFileSync(resolve("fixtures/next/app/layout.jsx"), "utf8");
    const page = readFileSync(resolve("fixtures/next/app/page.jsx"), "utf8");
    const client = readFileSync(resolve("fixtures/next/app/client-status.jsx"), "utf8");
    const actions = readFileSync(resolve("fixtures/next/app/actions.js"), "utf8");
    const route = readFileSync(resolve("fixtures/next/app/api/health/route.js"), "utf8");
    const config = readFileSync(resolve("fixtures/next/next.config.mjs"), "utf8");

    expect(layout).toContain("Next Debug Fixture");
    expect(page).toContain("async function getGreeting");
    expect(page).toContain("Next server component ready");
    expect(client).toContain('"use client"');
    expect(client).toContain("/api/health");
    expect(client).toContain("useActionState");
    expect(client).toContain("action={paymentAction}");
    expect(client).toContain("hydration-status");
    expect(client).toContain("health-request-settled");
    expect(actions).toContain('"use server"');
    expect(actions).toContain("export async function submitPayment");
    expect(route).toContain("export function GET");
    expect(config).toContain("agentRules: false");
  });
});
