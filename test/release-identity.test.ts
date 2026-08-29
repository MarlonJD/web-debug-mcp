import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createServer } from "../src/index.js";
import { cleanupRegistry, ProcessRegistry } from "../src/core/process-registry.js";
import { PACKAGE_VERSION } from "../src/core/version.js";

describe("release identity", () => {
  it("keeps source-next package identity separate from the released plugin runtime", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string; webDebug: { releaseStatus: string; releasedPluginRuntimeVersion: string } };
    const packageLock = JSON.parse(await readFile("package-lock.json", "utf8")) as { version: string; packages: Record<string, { version?: string }> };
    const pluginMcp = JSON.parse(await readFile("plugins/web-debug/.mcp.json", "utf8")) as { mcpServers: Record<string, { args: string[] }> };
    const codexManifest = JSON.parse(await readFile("plugins/web-debug/.codex-plugin/plugin.json", "utf8")) as { version: string };
    const claudeManifest = JSON.parse(await readFile("plugins/web-debug/.claude-plugin/plugin.json", "utf8")) as { version: string };
    const codexMarketplace = JSON.parse(await readFile(".agents/plugins/marketplace.json", "utf8")) as { plugins: Array<{ name: string; version: string }> };
    const claudeMarketplace = JSON.parse(await readFile(".claude-plugin/marketplace.json", "utf8")) as { plugins: Array<{ name: string; version: string }> };

    expect(PACKAGE_VERSION).toBe(packageJson.version);
    expect(packageJson.webDebug.releaseStatus).toBe("source-next");
    const releasedPluginVersion = packageJson.webDebug.releasedPluginRuntimeVersion;
    expect(PACKAGE_VERSION).toBe("0.5.0-next.0");
    expect(releasedPluginVersion).toBe("0.4.0");
    expect(releasedPluginVersion).not.toBe(PACKAGE_VERSION);
    expect(packageLock.version).toBe(PACKAGE_VERSION);
    expect(packageLock.packages[""]?.version).toBe(PACKAGE_VERSION);
    expect(pluginMcp.mcpServers["web-debug-mcp"]?.args).toContain(`web-debug-mcp@${releasedPluginVersion}`);
    expect(codexManifest.version).toMatch(new RegExp(`^${releasedPluginVersion.replaceAll(".", "\\.")}\\+codex\\.`));
    expect(claudeManifest.version).toBe(releasedPluginVersion);
    expect(codexMarketplace.plugins.find((plugin) => plugin.name === "web-debug")?.version).toBe(releasedPluginVersion);
    expect(claudeMarketplace.plugins.find((plugin) => plugin.name === "web-debug")?.version).toBe(releasedPluginVersion);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    const client = new Client({ name: "release-identity-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    expect(client.getServerVersion()?.version).toBe(PACKAGE_VERSION);
    await client.close();
    await server.close();

    const directory = await mkdtemp(join(tmpdir(), "web-debug-registry-version-"));
    const registry = new ProcessRegistry({ directory, idleTtlMs: 0 });
    try {
      await registry.start();
      expect((await registry.read())?.packageVersion).toBe(PACKAGE_VERSION);
      await registry.requestShutdown(async () => undefined);
      expect((await cleanupRegistry({ directory })).version).toBe(PACKAGE_VERSION);
    } finally {
      await registry.requestShutdown(async () => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
