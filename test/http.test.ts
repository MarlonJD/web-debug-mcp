import { describe, expect, it } from "vitest";

import { readResponseTextBounded } from "../src/core/http.js";

describe("bounded HTTP response reader", () => {
  it("rejects oversized declared and chunked responses", async () => {
    const declared = new Response("small", { headers: { "content-length": "1000" } });
    await expect(readResponseTextBounded(declared, 10, "declared response")).rejects.toMatchObject({ code: "UPSTREAM_RESPONSE_LIMIT_EXCEEDED" });

    const chunked = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
        controller.close();
      },
    }));
    await expect(readResponseTextBounded(chunked, 10, "chunked response")).rejects.toMatchObject({ code: "UPSTREAM_RESPONSE_LIMIT_EXCEEDED" });
  });

  it("returns an in-budget UTF-8 response exactly", async () => {
    const response = new Response("şifre değil");
    await expect(readResponseTextBounded(response, 64, "small response")).resolves.toBe("şifre değil");
  });

  it("aborts a response whose body never completes", async () => {
    const controller = new AbortController();
    const response = new Response(new ReadableStream<Uint8Array>({
      pull() { return new Promise<void>(() => undefined); },
    }));
    const reading = readResponseTextBounded(response, 64, "stalled response", controller.signal);
    controller.abort();
    await expect(reading).rejects.toMatchObject({ code: "UPSTREAM_RESPONSE_ABORTED" });
  });
});
