import { join, resolve } from "node:path";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { detectProject } from "../src/core/capabilities.js";

describe("project capability detection", () => {
  it("detects the framework-neutral fixture as a browser target", () => {
    const descriptor = detectProject(resolve("fixtures/vanilla"));
    expect(descriptor.frameworks).toEqual(["vanilla"]);
    expect(descriptor.projectCapabilities.browserTarget).toBe(true);
    expect(descriptor.projectCapabilities.react).toBe(false);
    expect(descriptor.warnings).toContain("No package.json found; framework-specific adapters cannot be inferred.");
  });

  it("detects the React/Vite fixture without requiring a running dev server", () => {
    const descriptor = detectProject(resolve("fixtures/react-vite"));
    expect(descriptor.frameworks).toEqual(["vite", "react"]);
    expect(descriptor.projectCapabilities.vite).toBe(true);
    expect(descriptor.projectCapabilities.react).toBe(true);
    expect(descriptor.projectCapabilities.browserTarget).toBe(true);
  });

  it("detects the Next App Router fixture and server runtime capability", () => {
    const descriptor = detectProject(resolve("fixtures/next"));
    expect(descriptor.frameworks).toEqual(["next", "react"]);
    expect(descriptor.projectCapabilities.next).toBe(true);
    expect(descriptor.projectCapabilities.serverRuntime).toBe(true);
  });

  it("detects Angular without claiming the encapsulated CLI Vite server", () => {
    const descriptor = detectProject(resolve("fixtures/angular"));
    expect(descriptor.frameworks).toEqual(["angular"]);
    expect(descriptor.markers).toContain("angular.json");
    expect(descriptor.projectCapabilities.angular).toBe(true);
    expect(descriptor.projectCapabilities.vue).toBe(false);
    expect(descriptor.projectCapabilities.vite).toBe(false);
    expect(descriptor.projectCapabilities.browserTarget).toBe(true);
  });

  it("detects the Vue 3/Vite fixture in deterministic framework order", () => {
    const descriptor = detectProject(resolve("fixtures/vue-vite"));
    expect(descriptor.frameworks).toEqual(["vite", "vue"]);
    expect(descriptor.projectCapabilities.vue).toBe(true);
    expect(descriptor.projectCapabilities.angular).toBe(false);
    expect(descriptor.projectCapabilities.vite).toBe(true);
  });

  it("does not promote repository dev dependencies into application frameworks", () => {
    const descriptor = detectProject(resolve("."));
    expect(descriptor.kind).toBe("library");
    expect(descriptor.frameworks).toEqual([]);
    expect(descriptor.confidence).toBe("low");
    expect(descriptor.projectCapabilities.browserTarget).toBe(false);
    expect(descriptor.frameworkDetections.map((detection) => detection.framework)).toEqual(expect.arrayContaining(["next", "angular", "vite", "react", "vue"]));
    expect(descriptor.frameworkDetections.every((detection) => detection.selected === false)).toBe(true);
  });

  it("does not treat an unrelated app directory as standalone Next evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-content-root-"));
    try {
      await mkdir(join(root, "app"));
      await writeFile(join(root, "package.json"), JSON.stringify({ name: "content-library", scripts: { note: "echo next" } }));
      const descriptor = detectProject(root);
      expect(descriptor).toMatchObject({ kind: "library", confidence: "none", frameworks: [], markers: [], projectCapabilities: { browserTarget: false, next: false } });
      expect(descriptor.frameworkDetections).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports declared workspace candidates without auto-selecting a child", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-workspace-detect-"));
    const outside = await mkdtemp(join(tmpdir(), "web-debug-workspace-outside-"));
    try {
      await mkdir(join(root, "apps", "site"), { recursive: true });
      await writeFile(join(outside, "index.html"), "<main>outside</main>");
      await symlink(outside, join(root, "apps", "escape"));
      await writeFile(join(root, "package.json"), JSON.stringify({ private: true, workspaces: ["apps/*", "unsupported/**"], devDependencies: { react: "19.0.0" } }));
      await writeFile(join(root, "apps", "site", "index.html"), "<main>site</main>");
      const descriptor = detectProject(root);
      expect(descriptor.kind).toBe("workspace");
      expect(descriptor.frameworks).toEqual([]);
      expect(descriptor.projectCapabilities.browserTarget).toBe(false);
      expect(descriptor.workspace).toMatchObject({ declared: true, truncated: false, unsupportedPatterns: ["unsupported/**"] });
      expect(descriptor.workspace.candidates).toHaveLength(1);
      expect(descriptor.workspace.candidates[0]).toMatchObject({ frameworks: ["vanilla"], confidence: "high", ambiguous: false });
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("bounds declared workspace patterns and reports truncation", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-workspace-cap-"));
    try {
      await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: Array.from({ length: 33 }, (_, index) => `packages-${index}`) }));
      expect(detectProject(root).workspace).toMatchObject({ declared: true, candidates: [], truncated: true });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed on incompatible high-confidence framework hosts", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-ambiguous-detect-"));
    try {
      await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { react: "19.0.0" } }));
      await writeFile(join(root, "index.html"), "<main>ambiguous</main>");
      await writeFile(join(root, "angular.json"), "{}");
      await writeFile(join(root, "vite.config.ts"), "export default {};");
      const descriptor = detectProject(root);
      expect(descriptor.kind).toBe("application");
      expect(descriptor.ambiguous).toBe(true);
      expect(descriptor.frameworks).toEqual([]);
      expect(descriptor.projectCapabilities.browserTarget).toBe(false);
      expect(descriptor.warnings.join(" ")).toContain("Incompatible application framework signals");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
