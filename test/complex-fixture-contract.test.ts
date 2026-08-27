import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("complex demo fixture contract", () => {
  it("contains deterministic logic and visual repair markers", () => {
    const app = readFileSync(resolve("fixtures/complex-vite/src/App.jsx"), "utf8");
    const quoteApi = readFileSync(resolve("fixtures/complex-vite/src/quote-api.js"), "utf8");
    const styles = readFileSync(resolve("fixtures/complex-vite/src/styles.css"), "utf8");
    const runner = readFileSync(resolve("scripts/demo-compare.mjs"), "utf8");

    expect(app).toContain("  }, []);");
    expect(app).toContain("requestNumber = latestQuoteRequest.current + 1");
    expect(app).toContain("data-testid=\"incident-drawer-layer\"");
    expect(app).toContain("data-testid=\"drawer-layout-state\"");
    expect(app).toContain("Drawer layout aligned");
    expect(app).toContain("Drawer layout offset");
    expect(app).toContain("data-testid=\"refresh-quote\"");
    expect(quoteApi).toContain("requestId % 2 === 1 ? 220 : 35");
    expect(app).toContain("quote-requests-settled");
    expect(app).toContain("All quote requests settled");
    expect(runner).toContain("quote-requests-settled");
    expect(styles).toContain(".drawer-layer { position: absolute; inset: 76px 0 0;");
    expect(runner).toContain('"complex-logic-fix"');
    expect(runner).toContain('"complex-async-fix"');
    expect(runner).toContain('"visual-layout-fix"');
    expect(runner).toContain("viewport: { width: viewport.width, height: viewport.height }");
  });
});
