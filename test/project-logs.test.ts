import { mkdtemp, mkdir, writeFile, symlink, link, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readProjectLog } from "../src/core/project-logs.js";

describe("project-contained log capture", () => {
  it("bounds the redacted filename after short-value expansion for fresh and unavailable logs", async () => {
    const root = await mkdtemp(join(tmpdir(), "long-log-name-"));
    const directories = Array.from({ length: 6 }, () => "e".repeat(64));
    const file = [...directories, "dev.log"].join("/");
    try {
      await mkdir(join(root, ...directories), { recursive: true });
      await writeFile(join(root, file), "Complete record\n");
      const fresh = await readProjectLog(root, file, ["e"]);
      expect(fresh.state).toBe("fresh");
      expect(fresh.file.length).toBeLessThanOrEqual(2_048);
      const unavailable = await readProjectLog(root, file.replace("dev.log", "missing.log"), ["e"]);
      expect(unavailable.state).toBe("unavailable");
      expect(unavailable.file.length).toBeLessThanOrEqual(2_048);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("redacts raw, URL-encoded and JSON-escaped inputs before line limits, and omits incomplete lines", async () => {
    const root = await mkdtemp(join(tmpdir(), "bounded-logs-"));
    try {
      const secret = 'private / value "quoted"\nsecond line';
      const lines = Array.from({ length: 240 }, (_, index) => `line ${index}`);
      lines.push(`raw=${secret}`, `encoded=${encodeURIComponent(secret)}`, `escaped=${JSON.stringify(secret)}`, 'Authorization: Bearer credential-value', 'password="space containing value"');
      await writeFile(join(root, "dev.log"), lines.join("\n") + "\nprivate-partial");
      const log = await readProjectLog(root, "dev.log", [secret]);
      expect(log.state).toBe("fresh");
      expect(log.truncated).toBe(true);
      expect(log.text).toContain("line 239");
      for (const value of [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1), "credential-value", "space containing value", "private-partial"]) expect(log.text).not.toContain(value);
      expect(log.text?.split("\n").length).toBeLessThanOrEqual(200);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects ancestor/final symlinks, hardlinks, traversal and missing files without reading content", async () => {
    const root = await mkdtemp(join(tmpdir(), "guarded-logs-"));
    try {
      await mkdir(join(root, "inside"));
      await writeFile(join(root, "inside", "dev.log"), "private-content\n");
      await symlink(join(root, "inside", "dev.log"), join(root, "linked.log"));
      await symlink(join(root, "inside"), join(root, "alias"));
      await link(join(root, "inside", "dev.log"), join(root, "hard.log"));
      for (const path of ["linked.log", "alias/dev.log", "hard.log", "inside/dev.log", "../dev.log", "missing.log"]) {
        expect(await readProjectLog(root, path)).toMatchObject({ state: "unavailable", text: null });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("drops a known private value crossing the bounded tail prefix", async () => {
    const root = await mkdtemp(join(tmpdir(), "log-cut-"));
    try {
      const secret = "cross-boundary-private-value\n".repeat(20);
      const suffix = "x".repeat(65_450) + "\nlast-complete\n";
      await writeFile(join(root, "dev.log"), "old\n".repeat(40_000) + secret + "\n" + suffix);
      const log = await readProjectLog(root, "dev.log", [secret]);
      expect(log).toMatchObject({ state: "fresh", truncated: true });
      expect(log.text).toContain("last-complete");
      expect(log.text).not.toContain("cross-boundary-private-value");
      expect(log.text!.length).toBeLessThanOrEqual(16_000);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
