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
});
