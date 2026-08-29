import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("agent evaluation task contract", () => {
  it("emits three bounded repair tasks without invoking a model", async () => {
    const { stdout } = await execFileAsync(process.execPath, ["scripts/agent-eval.mjs", "--catalog"], { cwd: process.cwd() });
    const result = JSON.parse(stdout) as { schemaVersion: number; modelCalls: string; tasks: Array<{ id: string; required: Record<string, boolean> }> };
    expect(result.schemaVersion).toBe(1);
    expect(result.modelCalls).toBe("not-performed-by-repository");
    expect(result.tasks.map((task) => task.id)).toEqual(["react-filter-stale-memo", "react-latest-response-wins", "responsive-drawer-viewport"]);
    expect(result.tasks.every((task) => Object.values(task.required).every(Boolean))).toBe(true);
    expect(Buffer.byteLength(stdout)).toBeLessThan(16 * 1024);
  });

  it("grades a bounded reviewed run with deterministic task checks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "web-debug-mcp-eval-test-"));
    const path = join(directory, "result.json");
    await writeFile(path, JSON.stringify({
      schemaVersion: 1,
      runs: [{
        taskId: "react-filter-stale-memo",
        model: "test-model",
        reasoning: "high",
        wallTimeMs: 1_000,
        toolCalls: 8,
        inputTokens: 2_000,
        outputTokens: 500,
        observed: { bugReproduced: true, behavior: "Showing 1 incident" },
        patch: { summary: "Corrected the memo dependency.", scope: "useMemo dependency list" },
        rootCause: { summary: "The memo omitted the active filter dependency.", reviewed: true },
        verification: { outcome: "verified" },
      }],
    }));
    try {
      const { stdout } = await execFileAsync(process.execPath, ["scripts/agent-eval.mjs", "--grade", path], { cwd: process.cwd() });
      const result = JSON.parse(stdout) as { summary: { total: number; passed: number; failed: number; coverage: string; suitePassed: boolean; missingTasks: string[] }; results: Array<{ passed: boolean }> };
      expect(result.summary).toMatchObject({ total: 1, passed: 1, failed: 0, coverage: "partial", suitePassed: false });
      expect(result.summary.missingTasks).toHaveLength(2);
      expect(result.results[0]?.passed).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
