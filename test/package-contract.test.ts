import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("package distribution contract", () => {
  it("exposes a runnable stdio MCP binary for agent clients", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      private?: boolean;
      bin?: Record<string, string>;
      files?: string[];
      scripts?: Record<string, string>;
    };
    const binaryPath = packageJson.bin?.["web-debug-mcp"];

    expect(packageJson.private).not.toBe(true);
    expect(binaryPath).toBe("./bin/web-debug-mcp.mjs");
    expect(existsSync(resolve(binaryPath ?? ""))).toBe(true);
    expect(packageJson.files).toEqual(expect.arrayContaining(["bin", "dist"]));
    expect(packageJson.scripts?.prepare).toBe("npm run build");
    expect(packageJson.scripts?.prepack).toBe("npm run build");
  });
});
