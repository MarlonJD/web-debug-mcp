import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("deterministic fixture contract", () => {
  it("contains a stable interaction and observable success state", () => {
    const html = readFileSync(resolve("fixtures/vanilla/index.html"), "utf8");
    const script = readFileSync(resolve("fixtures/vanilla/app.js"), "utf8");
    expect(html).toContain('id="submit"');
    expect(html).toContain('id="status"');
    expect(script).toContain('status.textContent = `Payment submitted: ${numericAmount.toFixed(2)}`');
  });
});
