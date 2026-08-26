import { describe, expect, it, vi } from "vitest";

import { ViteAdapter } from "../src/adapters/vite.js";

describe("Vite module graph adapter", () => {
  it("reads a bounded local graph snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      detected: true,
      root: "/fixture/react-vite",
      moduleCount: 2,
      modules: [
        {
          id: "/fixture/react-vite/src/main.jsx",
          url: "/src/main.jsx",
          file: "/fixture/react-vite/src/main.jsx",
          type: "js",
          importers: [],
          importedModules: ["/src/App.jsx"],
          acceptedHmrDeps: [],
          isSelfAccepting: true,
          lastHMRTimestamp: 0,
        },
      ],
      hmr: { active: true, lastUpdate: null },
      warnings: [],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const snapshot = await new ViteAdapter().snapshot("http://127.0.0.1:4174/");
    expect(snapshot?.detected).toBe(true);
    expect(snapshot?.moduleCount).toBe(2);
    expect(snapshot?.hmr.active).toBe(true);
    expect(snapshot?.modules[0]?.importedModules).toEqual(["/src/App.jsx"]);
    vi.unstubAllGlobals();
  });
});
