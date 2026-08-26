import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("React/Vite fixture contract", () => {
  it("keeps the React fixture free of app-specific bridge imports", () => {
    const html = readFileSync(resolve("fixtures/react-vite/index.html"), "utf8");
    const app = readFileSync(resolve("fixtures/react-vite/src/App.jsx"), "utf8");
    const bridge = readFileSync(resolve("src/adapters/react-bridge.ts"), "utf8");
    expect(html).not.toContain("react-debug-hook.js");
    expect(html).toContain('src/main.jsx');
    expect(app).toContain("export function CheckoutForm");
    expect(app).toContain("setSubmitted(true)");
    expect(bridge).toContain("REACT_DEBUG_BRIDGE_SCRIPT");
    expect(bridge).toContain("window.__WEB_DEBUG_REACT__");
    expect(bridge).toContain("commitCount");
    expect(bridge).toContain("commitSummaries");
    expect(bridge).toContain("renderCause");
    expect(bridge).toContain("actualDurationMs");
    expect(bridge).toContain("recordRenderTree");
  });
});
