import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_RESULT_BYTES } from "../src/domain/types.js";
import { ArtifactStore } from "../src/core/artifact-store.js";
import { WebDebugError } from "../src/core/errors.js";
import { errorToolResult, successToolResult, toolOutputSchema } from "../src/core/mcp-response.js";

describe("MCP structured response and screenshot artifacts", () => {
  it("returns one canonical structured value and rejects oversized data", async () => {
    const result = await successToolResult({ status: "ready" }, new ArtifactStore());
    expect(toolOutputSchema.parse(result.structuredContent)).toMatchObject({ ok: true, data: { status: "ready" }, artifacts: [] });
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    await expect(successToolResult({ blob: "x".repeat(MAX_RESULT_BYTES) }, new ArtifactStore())).rejects.toMatchObject({ code: "RESULT_LIMIT_EXCEEDED" });

    const error = errorToolResult(new WebDebugError("TEST_ERROR", "failed", { blob: "x".repeat(MAX_RESULT_BYTES) }));
    expect(error.isError).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(error))).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(toolOutputSchema.parse(error.structuredContent)).toMatchObject({ ok: false, error: { code: "TEST_ERROR" } });

    const wideError = errorToolResult(new WebDebugError("WIDE_ERROR", "failed", Object.fromEntries(
      Array.from({ length: 18 }, (_, index) => [`field-${index}`, "x".repeat(8_000)]),
    )));
    expect(Buffer.byteLength(JSON.stringify(wideError))).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(toolOutputSchema.parse(wideError.structuredContent)).toMatchObject({ ok: false, error: { code: "WIDE_ERROR" } });

    const longIdentityError = errorToolResult(new WebDebugError("X".repeat(101), "m".repeat(501)));
    expect(toolOutputSchema.safeParse(longIdentityError.structuredContent).success).toBe(true);

    const nonJsonError = errorToolResult(new WebDebugError("NON_JSON", "bad details", { count: 1n, value: Number.POSITIVE_INFINITY }));
    expect(toolOutputSchema.safeParse(nonJsonError.structuredContent).success).toBe(true);
    expect((nonJsonError.structuredContent as { warnings?: string[] }).warnings).toContainEqual(expect.stringContaining("not JSON-serializable"));
  });

  it("inlines only a small contained screenshot and revalidates resource identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-mcp-artifact-test-"));
    const screenshot = join(root, "capture.png");
    const expiring = join(root, "expiring.png");
    let now = 100;
    try {
      await writeFile(screenshot, Buffer.from("small-png"));
      await writeFile(expiring, Buffer.from("expiring-png"));
      const store = new ArtifactStore(() => now);
      const result = await successToolResult({ screenshot: true }, store, [{ path: screenshot, artifactDir: root, name: "capture.png" }]);
      const envelope = toolOutputSchema.parse(result.structuredContent);
      expect(envelope.artifacts).toHaveLength(1);
      expect(envelope.artifacts[0]?.delivery).toBe("inline");
      expect(result.content.some((item) => item.type === "image")).toBe(true);
      const link = result.content.find((item) => item.type === "resource_link");
      expect(link?.type).toBe("resource_link");
      const uri = new URL(link && "uri" in link ? link.uri : "web-debug://artifact/missing");
      const id = uri.pathname.slice(1);
      await expect(store.read(id, uri)).resolves.toMatchObject({ contents: [{ mimeType: "image/png" }] });

      await writeFile(screenshot, Buffer.from("changed-png"));
      await expect(store.read(id, uri)).rejects.toMatchObject({ code: "ARTIFACT_CHANGED" });

      const expiringResult = await store.prepare([{ path: expiring, artifactDir: root, name: "expiring.png" }], 0);
      expiringResult.commit();
      const expiringUri = new URL(expiringResult.descriptors[0]!.uri);
      now += 60 * 60 * 1_000 + 1;
      await expect(store.read(expiringUri.pathname.slice(1), expiringUri)).rejects.toMatchObject({ code: "ARTIFACT_NOT_FOUND" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not evict published handles when a staged result exceeds the final wire budget", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-mcp-artifact-transaction-"));
    const screenshot = join(root, "capture.png");
    const store = new ArtifactStore();
    try {
      await writeFile(screenshot, Buffer.from("transaction-png"));
      let firstUri: URL | null = null;
      for (let index = 0; index < 64; index += 1) {
        const prepared = await store.prepare([{ path: screenshot, artifactDir: root, name: `capture-${index}.png` }], 0);
        prepared.commit();
        firstUri ??= new URL(prepared.descriptors[0]!.uri);
      }
      await expect(successToolResult(
        { blob: "x".repeat(MAX_RESULT_BYTES - 200) },
        store,
        [{ path: screenshot, artifactDir: root, name: "overflow.png" }],
      )).rejects.toMatchObject({ code: "RESULT_LIMIT_EXCEEDED" });
      await expect(store.read(firstUri!.pathname.slice(1), firstUri!)).resolves.toMatchObject({ contents: [{ mimeType: "image/png" }] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects symlinked, outside, and over-limit screenshot candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "web-debug-mcp-artifact-policy-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "web-debug-mcp-artifact-outside-"));
    const outside = join(outsideRoot, "outside.png");
    const linked = join(root, "linked.png");
    const huge = join(root, "huge.png");
    try {
      await writeFile(outside, Buffer.from("outside"));
      await symlink(outside, linked);
      await writeFile(huge, Buffer.alloc(4 * 1024 * 1024 + 1));
      const store = new ArtifactStore();
      const prepared = await store.prepare([
        { path: linked, artifactDir: root, name: "linked.png" },
        { path: outside, artifactDir: root, name: "outside.png" },
      ], 0);
      expect(prepared.descriptors).toEqual([]);
      expect(prepared.warnings).toHaveLength(2);
      const overLimit = await store.prepare([{ path: huge, artifactDir: root, name: "huge.png" }], 0);
      expect(overLimit.descriptors).toEqual([]);
      expect(overLimit.warnings.join(" ")).toContain("limit");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });
});
