import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Angular fixture contract", () => {
  it("uses Angular 21 development tooling without an app-specific bridge", () => {
    const packageJson = JSON.parse(readFileSync(resolve("fixtures/angular/package.json"), "utf8"));
    const workspace = readFileSync(resolve("fixtures/angular/angular.json"), "utf8");
    const app = readFileSync(resolve("fixtures/angular/src/main.ts"), "utf8");
    expect(packageJson.dependencies["@angular/core"]).toBe("21.2.22");
    expect(packageJson.devDependencies.typescript).toBe("5.9.2");
    expect(workspace).toContain('"@angular/build:dev-server"');
    expect(workspace).not.toContain("webDebugVitePlugin");
    expect(app).toContain("CheckoutPanelComponent");
    expect(app).toContain("Payment submitted");
    expect(app).not.toContain("__WEB_DEBUG_ANGULAR__");
  });
});
