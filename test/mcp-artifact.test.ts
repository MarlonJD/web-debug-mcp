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
import { CAPTURE_ARTIFACT } from "../src/core/session-evidence.js";
import { chromiumRuntimeCapabilities } from "../src/adapters/runtime-capabilities.js";

describe("MCP screenshot resource registration", () => {
  it("returns and reads a non-enumerable opaque screenshot resource", async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), "web-debug-mcp-resource-test-"));
    const screenshotPath = join(artifactDir, "capture.png");
    await writeFile(screenshotPath, Buffer.from("resource-png"));
    const projectCapabilities = { browserTarget: true, react: false, angular: false, vue: false, vite: false, next: false, serverRuntime: false };
    const runtimeCapabilities = chromiumRuntimeCapabilities(true);
    const manager = {
      capture: async () => {
        const capture: Record<PropertyKey, unknown> = {
          schemaVersion: 5,
          profile: "full",
          capturedAt: "2026-08-30T00:00:00.000Z",
          cursor: "00000000-0000-4000-8000-000000000003",
          session: { id: "00000000-0000-4000-8000-000000000001", url: "http://127.0.0.1:4173/", status: "ready", target: null, projectCapabilities, runtimeCapabilities },
          project: { frameworks: ["vanilla"], confidence: "high", ambiguous: false, projectCapabilities },
          summary: {
            title: "Fixture", viewport: null, bodyText: "Fixture", domElements: 0,
            console: { total: 0, errors: 0, warnings: 0, latestErrors: [] },
            network: { total: 0, failed: 0, pending: 0, latestFailures: [] },
            debugger: { paused: false, reason: null, callFrames: 0, breakpoints: 0 },
            runtimes: { react: "not-detected", angular: "not-detected", vue: "not-detected", next: "not-detected", vite: "not-detected", accessibility: "present" },
            replay: { frames: 0, truncated: false, oldestIndex: null, newestIndex: null, restorable: true, restoreBlockedReason: null },
            webmcp: { state: "unsupported", callableTools: 0, truncated: false },
            observations: null,
          },
          redaction: { applied: true, policy: "default-sensitive-fields" },
          warnings: [],
          truncation: { applied: false, omittedSurfaces: [] },
          details: { screenshot: { status: "captured" } },
        };
        capture[CAPTURE_ARTIFACT] = { path: screenshotPath, artifactDir };
        return capture;
      },
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
        arguments: { sessionId: "00000000-0000-4000-8000-000000000001", view: { profile: "full" } },
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
