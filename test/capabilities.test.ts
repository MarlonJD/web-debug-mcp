import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { detectProject } from "../src/core/capabilities.js";

describe("project capability detection", () => {
  it("detects the framework-neutral fixture as a browser target", () => {
    const descriptor = detectProject(resolve("fixtures/vanilla"));
    expect(descriptor.frameworks).toEqual(["vanilla"]);
    expect(descriptor.capabilities.browser).toBe(true);
    expect(descriptor.capabilities.javascriptDebugger).toBe(true);
    expect(descriptor.capabilities.react).toBe(false);
    expect(descriptor.warnings).toContain("No package.json found; framework-specific adapters cannot be inferred.");
  });

  it("detects the React/Vite fixture without requiring a running dev server", () => {
    const descriptor = detectProject(resolve("fixtures/react-vite"));
    expect(descriptor.frameworks).toEqual(["vite", "react"]);
    expect(descriptor.capabilities.vite).toBe(true);
    expect(descriptor.capabilities.react).toBe(true);
    expect(descriptor.capabilities.browser).toBe(true);
  });

  it("detects the Next App Router fixture and server runtime capability", () => {
    const descriptor = detectProject(resolve("fixtures/next"));
    expect(descriptor.frameworks).toEqual(["next", "react"]);
    expect(descriptor.capabilities.next).toBe(true);
    expect(descriptor.capabilities.serverRuntime).toBe(true);
  });

  it("detects Angular without claiming the encapsulated CLI Vite server", () => {
    const descriptor = detectProject(resolve("fixtures/angular"));
    expect(descriptor.frameworks).toEqual(["angular"]);
    expect(descriptor.markers).toContain("angular.json");
    expect(descriptor.capabilities.angular).toBe(true);
    expect(descriptor.capabilities.vue).toBe(false);
    expect(descriptor.capabilities.vite).toBe(false);
    expect(descriptor.capabilities.browser).toBe(true);
  });

  it("detects the Vue 3/Vite fixture in deterministic framework order", () => {
    const descriptor = detectProject(resolve("fixtures/vue-vite"));
    expect(descriptor.frameworks).toEqual(["vite", "vue"]);
    expect(descriptor.capabilities.vue).toBe(true);
    expect(descriptor.capabilities.angular).toBe(false);
    expect(descriptor.capabilities.vite).toBe(true);
  });
});
