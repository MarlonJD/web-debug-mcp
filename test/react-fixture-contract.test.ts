import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("React/Vite fixture contract", () => {
  it("loads the bridge before the React entry point", () => {
    const html = readFileSync(resolve("fixtures/react-vite/index.html"), "utf8");
    const app = readFileSync(resolve("fixtures/react-vite/src/App.jsx"), "utf8");
    const bridge = readFileSync(resolve("fixtures/react-vite/src/react-debug-hook.js"), "utf8");
    expect(html.indexOf("react-debug-hook.js")).toBeLessThan(html.indexOf("src/main.jsx"));
    expect(app).toContain("export function CheckoutForm");
    expect(app).toContain("setSubmitted(true)");
    expect(bridge).toContain("window.__WEB_DEBUG_REACT__");
    expect(bridge).toContain("commitCount");
    expect(bridge).toContain("recordRenderTree");
  });
});
