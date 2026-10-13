import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const pluginRoot = resolve("plugins/web-debug");

describe("Antigravity plugin packaging", () => {
  it("uses the host-native root manifest shape", async () => {
    const manifest = JSON.parse(await readFile(resolve(pluginRoot, "plugin.json"), "utf8")) as Record<string, unknown>;

    expect(Object.keys(manifest).sort()).toEqual(["description", "name"]);
    expect(manifest.name).toBe("web-debug");
    expect(manifest.description).toEqual(expect.any(String));
  });

  it("pins the standalone MCP server through Antigravity's stdio config", async () => {
    const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { version: string };
    const config = JSON.parse(await readFile(resolve(pluginRoot, "mcp_config.json"), "utf8")) as {
      mcpServers?: Record<string, Record<string, unknown>>;
    };
    const server = config.mcpServers?.["web-debug-mcp"];

    expect(Object.keys(config).sort()).toEqual(["mcpServers"]);
    expect(server).toEqual({
      command: "npx",
      args: ["-y", `web-debug-mcp@${packageJson.version}`],
    });
  });

  it("keeps all bundled skills discoverable from the shared layout", async () => {
    const skillNames = [
      "manual-parity-qualification",
      "web-debug-workflow",
      "webmcp-tool-authoring",
    ];

    for (const skillName of skillNames) {
      const skill = await readFile(resolve(pluginRoot, "skills", skillName, "SKILL.md"), "utf8");
      expect(skill).toMatch(new RegExp(`^---\\nname: ${skillName}\\n`));
      expect(skill).toMatch(/^description: .+/m);
    }
  });
});
