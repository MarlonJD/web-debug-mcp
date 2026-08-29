import { describe, expect, it } from "vitest";

import { boundText, redactValue, safeUrl } from "../src/core/redaction.js";

describe("redaction", () => {
  it("redacts sensitive URL parameters and bearer credentials", () => {
    expect(safeUrl("http://localhost:4173/?token=abc&view=checkout")).toContain("token=[REDACTED]");
    expect(safeUrl("http://localhost:4173/?token=abc&view=checkout")).toContain("view=checkout");
    expect(safeUrl("http://localhost:4173/?authorization=Bearer%20abc")).toContain("authorization=[REDACTED]");
  });

  it("redacts sensitive object keys without hiding ordinary identifiers", () => {
    expect(redactValue({ customerId: "c-1", accessToken: "secret", nested: { password: "pw" } })).toEqual({
      customerId: "c-1",
      accessToken: "[REDACTED]",
      nested: { password: "[REDACTED]" },
    });
  });

  it("bounds UTF-8 strings, keys, breadth, depth, and circular values", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = redactValue({
      text: "😀".repeat(10_000),
      ["k".repeat(1_000)]: "value",
      accessToken: "secret",
      entries: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`item-${index}`, index])),
      circular,
    }) as Record<string, unknown>;

    expect(Buffer.byteLength(String(result.text))).toBeLessThanOrEqual(8_000);
    expect(Object.keys(result).every((key) => Buffer.byteLength(key) <= 200)).toBe(true);
    expect(result.accessToken).toBe("[REDACTED]");
    expect(Object.keys(result.entries as Record<string, unknown>)).toHaveLength(50);
    expect(JSON.stringify(result)).toContain("[CIRCULAR]");
  });

  it("prefix-bounds multi-megabyte text and URLs before redaction work", () => {
    const huge = `Bearer secret-token ${"x".repeat(4 * 1024 * 1024)}`;
    const bounded = boundText(huge, 120);
    expect(bounded).toContain("Bearer [REDACTED]");
    expect(bounded).toHaveLength(120);
    expect(bounded).toMatch(/… \[TRUNCATED\]$/);

    const url = safeUrl(`http://127.0.0.1:4173/?view=${"x".repeat(4 * 1024 * 1024)}&token=late-secret`);
    expect(url.length).toBeLessThanOrEqual(2_560);
    expect(url).not.toContain("late-secret");
  });
});
