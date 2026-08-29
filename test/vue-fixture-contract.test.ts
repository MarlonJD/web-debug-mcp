import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Vue/Vite fixture contract", () => {
  it("uses Vue 3 with the existing Vite provenance plugin and no app-specific bridge", () => {
    const packageJson = JSON.parse(readFileSync(resolve("fixtures/vue-vite/package.json"), "utf8"));
    const config = readFileSync(resolve("fixtures/vue-vite/vite.config.ts"), "utf8");
    const app = readFileSync(resolve("fixtures/vue-vite/src/CheckoutForm.vue"), "utf8");
    expect(packageJson.dependencies.vue).toBe("3.5.42");
    expect(config).toContain("webDebugVitePlugin()");
    expect(config).toContain("vue()");
    expect(app).toContain("submitted: false");
    expect(app).not.toContain("__WEB_DEBUG_VUE__");
  });
});
