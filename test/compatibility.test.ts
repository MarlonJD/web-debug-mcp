import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("declared compatibility matrix", () => {
  it("keeps exact verified fixture versions aligned with the root toolchain", async () => {
    const root = JSON.parse(await readFile("package.json", "utf8")) as {
      engines: { node: string };
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      webDebug: { releasedPackageVersion: string };
    };
    const lock = JSON.parse(await readFile("package-lock.json", "utf8")) as { packages: Record<string, { version?: string }> };
    const reactVite = JSON.parse(await readFile("fixtures/react-vite/package.json", "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const complexVite = JSON.parse(await readFile("fixtures/complex-vite/package.json", "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const next = JSON.parse(await readFile("fixtures/next/package.json", "utf8")) as { dependencies: Record<string, string> };
    const angular = JSON.parse(await readFile("fixtures/angular/package.json", "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const vueVite = JSON.parse(await readFile("fixtures/vue-vite/package.json", "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const compatibility = await readFile("docs/COMPATIBILITY.md", "utf8");
    const chromiumSmoke = await readFile("scripts/live-smoke.mjs", "utf8");
    const safariSmoke = await readFile("scripts/live-safari-smoke.mjs", "utf8");
    const evidence = JSON.parse(await readFile("docs/compatibility-evidence.json", "utf8")) as {
      schemaVersion: number;
      scope: string;
      baseCommit: string;
      sourceVersion: string;
      releaseBaseline: { version: string; commit: string };
      runtime: Record<string, string>;
      checks: Array<{ command: string; status: string; signal: string }>;
    };

    expect(root.engines.node).toBe(">=20");
    expect(Number(process.versions.node.split(".")[0])).toBeGreaterThanOrEqual(20);
    expect(lock.packages["node_modules/@modelcontextprotocol/sdk"]?.version).toBe(root.dependencies["@modelcontextprotocol/sdk"]);
    for (const fixture of [reactVite, complexVite]) {
      expect(fixture.dependencies.react).toBe(root.devDependencies.react);
      expect(fixture.dependencies["react-dom"]).toBe(root.devDependencies["react-dom"]);
      expect(fixture.devDependencies.vite).toBe(root.devDependencies.vite);
      expect(fixture.devDependencies["@vitejs/plugin-react"]).toBe(root.devDependencies["@vitejs/plugin-react"]);
    }
    expect(next.dependencies.next).toBe(root.devDependencies.next);
    expect(next.dependencies.react).toBe(root.devDependencies.react);
    expect(next.dependencies["react-dom"]).toBe(root.devDependencies["react-dom"]);
    expect(angular.dependencies["@angular/core"]).toBe(root.devDependencies["@angular/core"]);
    expect(angular.devDependencies["@angular/cli"]).toBe(root.devDependencies["@angular/cli"]);
    expect(angular.devDependencies.typescript).toBe(root.devDependencies.typescript);
    expect(vueVite.dependencies.vue).toBe(root.devDependencies.vue);
    expect(vueVite.devDependencies["@vitejs/plugin-vue"]).toBe(root.devDependencies["@vitejs/plugin-vue"]);
    expect(vueVite.devDependencies.vite).toBe(root.devDependencies.vite);
    expect(evidence).toMatchObject({ schemaVersion: 2, scope: "0.8.0-final-local", releaseBaseline: { version: "0.8.0" } });
    expect(evidence.sourceVersion).toBe(root.webDebug.releasedPackageVersion);
    expect(evidence.releaseBaseline.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(evidence.runtime.mcpSdk).toBe(root.dependencies["@modelcontextprotocol/sdk"]);
    expect(evidence.runtime.react).toBe(root.devDependencies.react);
    expect(evidence.runtime.vite).toBe(root.devDependencies.vite);
    expect(evidence.runtime.next).toBe(root.devDependencies.next);
    expect(evidence.runtime.angular).toBe(root.devDependencies["@angular/core"]);
    expect(evidence.runtime.vue).toBe(root.devDependencies.vue);
    expect(evidence.runtime.vitest).toBe(root.devDependencies.vitest);
    expect(evidence.checks.map((check) => check.command)).toEqual(expect.arrayContaining([
      "npm test",
      "npm run smoke:live",
      "npm run smoke:react-vite",
      "npm run smoke:next",
      "npm run smoke:safari",
      "npm run smoke:local-fidelity",
      "npm run smoke:vue-vite",
      "npm run smoke:angular",
      "npm run smoke:webmcp",
    ]));
    expect(evidence.checks.every((check) => ["passed", "failed", "blocked", "not-run"].includes(check.status))).toBe(true);
    expect(evidence.checks.filter((check) => check.status === "failed").map((check) => check.command)).toEqual(["Safari 27 MCP feasibility on caller-provided other MacBook"]);
    expect(evidence.checks.filter((check) => check.status === "failed").every((check) => check.signal.length > 0)).toBe(true);
    expect(chromiumSmoke).toContain("browserVersion: adapter.browserVersion()");
    expect(safariSmoke).toContain("safaridriver");
    expect(safariSmoke).toContain("browserVersion");
    for (const version of Object.values(evidence.runtime)) expect(compatibility).toContain(version);
  });
});
