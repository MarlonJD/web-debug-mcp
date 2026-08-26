import { describe, expect, it } from "vitest";

import { redactValue, safeUrl } from "../src/core/redaction.js";

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
});
