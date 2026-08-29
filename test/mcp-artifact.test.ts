import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { ArtifactStore, createServer } from "../src/index.js";
import { enforceSessionArtifactPolicy, MAX_SESSION_SCREENSHOTS } from "../src/core/artifact-store.js";
import type { ProcessRegistry } from "../src/core/process-registry.js";
import type { SessionManager } from "../src/core/session-manager.js";

describe("MCP screenshot resource registration", () => {
  it("returns and reads a non-enumerable opaque screenshot resource", async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), "web-debug-mcp-resource-test-"));
    const screenshotPath = join(artifactDir, "capture.png");
    await writeFile(screenshotPath, Buffer.from("resource-png"));
    const manager = {
      capture: async () => ({
        schemaVersion: 2,
        browser: { screenshotPath },
        session: { artifactDir },
      }),
    } as unknown as SessionManager;
    const requestAccounting: string[] = [];
    let failEndRequest = false;
    const registry = {
      beginRequest: async () => { requestAccounting.push("begin"); },
      endRequest: async () => { requestAccounting.push("end"); if (failEndRequest) throw new Error("accounting cleanup failed"); },
    } as unknown as ProcessRegistry;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer(manager, registry);
    const client = new Client({ name: "artifact-resource-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const result = await client.callTool({
        name: "web_issue_capture",
        arguments: { sessionId: "00000000-0000-4000-8000-000000000001", captureScreenshot: true },
      });
      expect(result.isError).not.toBe(true);
      const envelope = (result as { structuredContent?: { artifacts?: Array<{ uri: string }> } }).structuredContent;
      const uri = envelope?.artifacts?.[0]?.uri;
      expect(uri).toMatch(/^web-debug:\/\/artifact\/[0-9a-f-]+$/);
      const content = (result as { content?: Array<{ type: string }> }).content ?? [];
      expect(content.some((item) => item.type === "resource_link")).toBe(true);
      requestAccounting.length = 0;
      failEndRequest = true;
      const resource = await client.readResource({ uri: uri! });
      expect(resource.contents).toEqual([{ uri, mimeType: "image/png", blob: Buffer.from("resource-png").toString("base64") }]);
      expect(requestAccounting).toEqual(["begin", "end"]);
      const listed = await client.listResources();
      expect(listed.resources).toEqual([]);
    } finally {
      await client.close();
      await server.close();
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  it("returns a stable error when quota pruning expires an older handle", async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), "web-debug-mcp-resource-prune-test-"));
    const store = new ArtifactStore();
    try {
      const firstPath = join(artifactDir, "screenshot-100.png");
      await writeFile(firstPath, Buffer.from("first"));
      const prepared = await store.prepare([{ path: firstPath, artifactDir, name: "first.png" }], 0);
      prepared.commit();
      const uri = prepared.descriptors[0]!.uri;

      for (let index = 1; index <= MAX_SESSION_SCREENSHOTS; index += 1) {
        const path = join(artifactDir, `screenshot-${100 + index}.png`);
        await writeFile(path, Buffer.from(`capture-${index}`));
        await enforceSessionArtifactPolicy(artifactDir, path);
      }

      const parsed = new URL(uri);
      await expect(store.read(parsed.pathname.slice(1), parsed)).rejects.toMatchObject({ code: "ARTIFACT_NOT_FOUND" });
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });
});
