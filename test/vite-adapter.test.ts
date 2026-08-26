import { describe, expect, it, vi } from "vitest";

import { ViteAdapter } from "../src/adapters/vite.js";
import { createTransformDiff } from "../src/adapters/vite-plugin.js";

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
          transform: {
            codeLength: 18,
            truncated: false,
            deps: [],
            dynamicDeps: [],
            sourceMap: { present: true, sourceCount: 1, sources: ["main.jsx"], namesCount: 1, mappingLength: 4, file: "main.jsx" },
          },
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
    expect(snapshot?.modules[0]?.transform?.sourceMap.present).toBe(true);
    vi.unstubAllGlobals();
  });

  it("creates a bounded line diff for transformed module snapshots", () => {
    const diff = createTransformDiff(
      { code: "const value = 1;\nreturn value;", truncated: false, deps: [], dynamicDeps: [], sourceMap: null },
      { code: "const value = 2;\nreturn value;", truncated: false, deps: [], dynamicDeps: [], sourceMap: null },
    );
    expect(diff.addedLines).toBe(1);
    expect(diff.removedLines).toBe(1);
    expect(diff.patch).toContain("-const value = 1;");
    expect(diff.patch).toContain("+const value = 2;");
    expect(diff.truncated).toBe(false);
  });
});
