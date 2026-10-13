import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

// Exercise the actual browser module without adding a second implementation.
async function fixture() {
  const source = await readFile("fixtures/vanilla/payment-tool.js", "utf8");
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  let tool: { execute: (input: unknown, options?: { signal: AbortSignal }) => Promise<string> };
  let registrationSignal: AbortSignal;
  const domain = vi.fn(async (_amount: number, _options: { signal: AbortSignal }) => {});
  const dispose = await module.registerPaymentTool({ registerTool: async (value: typeof tool, options: { signal: AbortSignal }) => { tool = value; registrationSignal = options.signal; } }, domain);
  return { execute: (input: unknown, signal?: AbortSignal) => tool.execute(input, signal ? { signal } : undefined), domain, dispose, registrationAborted: () => registrationSignal.aborted };
}

describe("product payment capability example", () => {
  it("restores one registration after BFCache return and invalidates retained executors", async () => {
    const source = await readFile("fixtures/vanilla/payment-tool.js", "utf8");
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
    const app = (await readFile("fixtures/vanilla/app.js", "utf8")).replace('"./payment-tool.js"', JSON.stringify(moduleUrl));
    const page = new EventTarget();
    const elements = { "#submit": new EventTarget(), "#amount": { value: "12.5" }, "#status": { textContent: "Ready" } };
    type RegisteredTool = { execute: (input: unknown) => Promise<string> };
    let active: RegisteredTool | null = null;
    const registered: RegisteredTool[] = [];
    vi.stubGlobal("window", page);
    vi.stubGlobal("document", {
      querySelector: (selector: keyof typeof elements) => elements[selector],
      modelContext: { registerTool: async (tool: RegisteredTool, { signal }: { signal: AbortSignal }) => {
        signal.throwIfAborted(); active = tool; registered.push(tool);
        signal.addEventListener("abort", () => { if (active === tool) active = null; }, { once: true });
      } },
    });
    try {
      await import(`data:text/javascript;base64,${Buffer.from(app).toString("base64")}`);
      expect(registered).toHaveLength(1);
      const original = registered[0]!;
      page.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true }));
      expect(active).toBeNull();
      await expect(original.execute({ amount: 12.5 })).rejects.toThrow("PAYMENT_CANCELLED");
      page.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
      expect(registered).toHaveLength(2);
      expect(await registered[1]!.execute({ amount: 12.5 })).toBe("payment-submitted");
      expect(elements["#status"].textContent).toBe("Payment submitted: 12.50");
      page.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
      expect(registered).toHaveLength(2);
      page.dispatchEvent(new Event("pagehide"));
      expect(active).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });

  it("reuses the domain function once and returns only an acknowledgement", async () => {
    const app = await fixture();
    expect(await app.execute({ amount: 12.5 })).toBe("payment-submitted");
    expect(app.domain).toHaveBeenCalledTimes(1);
    expect(app.domain.mock.calls[0]?.[0]).toBe(12.5);
    app.dispose(); app.dispose();
    expect(app.registrationAborted()).toBe(true);
    await expect(app.execute({ amount: 12.5 })).rejects.toThrow("PAYMENT_CANCELLED");
    expect(app.domain).toHaveBeenCalledTimes(1);
  });
  it.each([null, [], { amount: "12.5" }, { amount: 0 }, { amount: Infinity }, { amount: 1_000_001 }, { amount: 1, token: "private" }])("rejects malformed input before domain execution: %j", async (input) => {
    const app = await fixture();
    await expect(app.execute(input)).rejects.toThrow("PAYMENT_INPUT_INVALID");
    expect(app.domain).not.toHaveBeenCalled();
    app.dispose();
  });
  it("does not repeat a committed operation when cancellation makes its result uncertain", async () => {
    const app = await fixture();
    const controller = new AbortController();
    let ledger = 0;
    app.domain.mockImplementation(async (_amount, { signal }) => { ledger += 1; controller.abort("private cancellation reason"); expect(signal.aborted).toBe(true); });
    await expect(app.execute({ amount: 10 }, controller.signal)).rejects.toThrow("PAYMENT_CANCELLED");
    expect(ledger).toBe(1);
    expect(app.domain).toHaveBeenCalledTimes(1);
    app.dispose();
  });
  it("suppresses downstream error details and rejects an already cancelled execution", async () => {
    const app = await fixture();
    app.domain.mockRejectedValue(new Error("private domain receipt"));
    await expect(app.execute({ amount: 10 })).rejects.toThrow(/^PAYMENT_FAILED$/);
    const controller = new AbortController(); controller.abort();
    await expect(app.execute({ amount: 10 }, controller.signal)).rejects.toThrow(/^PAYMENT_CANCELLED$/);
    expect(app.domain).toHaveBeenCalledTimes(1);
    app.dispose();
  });
});
