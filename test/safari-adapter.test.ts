import { describe, expect, it, vi } from "vitest";

import { SafariAdapter } from "../src/adapters/safari.js";

describe("Safari WebDriver adapter", () => {
  it("maps a bounded W3C WebDriver session into browser evidence", async () => {
    const responses = [
      { value: { sessionId: "safari-1" } },
      { value: null },
      { value: "Web Debug Fixture" },
      { value: { bodyText: "Checkout fixture Ready", elements: [] } },
      { value: "http://127.0.0.1:4176/" },
      { value: "Web Debug Fixture" },
      { value: { width: 1280, height: 800 } },
      { value: { "element-6066-11e4-a52e-4f735466cecf": "element-1" } },
      { value: null },
      { value: "http://127.0.0.1:4176/" },
      { value: "Web Debug Fixture" },
      { value: "http://127.0.0.1:4176/" },
      { value: { bodyText: "Checkout fixture Payment submitted: 249.90", elements: [] } },
      { value: "Web Debug Fixture" },
      { value: { width: 1280, height: 800 } },
      { value: null },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(responses.shift() ?? { value: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const adapter = new SafariAdapter("http://127.0.0.1:4444");
      const target = await adapter.start({ url: "http://127.0.0.1:4176/", headless: false });
      await adapter.act({ kind: "click", selector: "#submit" });
      const snapshot = await adapter.snapshot({ artifactDir: "/tmp/web-debug-safari-test", captureScreenshot: false });

      expect(target.browser).toBe("safari");
      expect(target.viewport).toEqual({ width: 1280, height: 800 });
      expect(snapshot.dom.bodyText).toContain("Payment submitted");
      expect(snapshot.console).toEqual([]);
      expect(snapshot.warnings[0]).toContain("Safari WebDriver does not expose Chromium CDP");
      await adapter.close();
      expect(fetchMock).toHaveBeenCalledTimes(16);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("blocks debugger and side-effect-free evaluation claims", async () => {
    const adapter = new SafariAdapter();
    await expect(adapter.setBreakpoint({ sourceUrl: "http://127.0.0.1/app.js", line: 1 })).rejects.toMatchObject({ code: "DEBUGGER_UNAVAILABLE" });
    await expect(adapter.evaluate("1 + 1", false)).rejects.toMatchObject({ code: "EVALUATION_SIDE_EFFECTS_BLOCKED" });
  });
});
