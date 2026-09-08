import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

// Synthetic grader inputs, never model-evaluation evidence.
async function example(directory: string, variant = "native", repetition = 1) {
  const runId = `${variant}-${repetition}`;
  const artifacts = [];
  for (const [kind, content] of Object.entries({
    transcript: "synthetic reviewed source inspection",
    invocation: JSON.stringify({ model: "test-model", reasoning: "high" }),
    oracle: JSON.stringify({ schemaVersion: 1, runId, taskId: "source-only-review", observations: { sourceReviewed: true, workspaceUnchanged: true, browserWorkAbsent: true } }),
  })) {
    const path = `${runId}-${kind}.json`;
    await writeFile(join(directory, path), content);
    artifacts.push({ kind, path, sha256: digest(content) });
  }
  return {
    runId, taskId: "source-only-review", variant, repetition, status: "completed", model: "test-model", reasoning: "high",
    fixtureDigest: digest("fixture"), skillDigest: variant.startsWith("skills-") ? digest(variant) : null,
    runtimeDigest: digest("runtime"), toolInventoryDigest: digest(variant),
    metrics: { wallTimeMs: 1000, toolCalls: 3, inputTokens: 2000, cachedInputTokens: null, outputTokens: 100 },
    artifacts,
    review: { reviewer: "synthetic-test", unnecessaryApprovals: 0, falseSuccessClaims: 0, rootCauseCorrect: null, evidenceRefs: ["synthetic"] },
    cleanup: { ownedProcessesRemaining: 0 }, limitation: null,
  };
}
async function grade(directory: string, runs: unknown[], variants = ["native"], repetitions = 1) {
  const path = join(directory, "result.json");
  await writeFile(path, JSON.stringify({ schemaVersion: 2, experiment: { id: "synthetic-test", model: "test-model", reasoning: "high", taskIds: ["source-only-review"], variants, repetitions }, runs }));
  try {
    const { stdout } = await execFileAsync(process.execPath, ["scripts/agent-eval.mjs", "--grade", path]);
    return { code: 0, result: JSON.parse(stdout) };
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    return { code: failure.code, result: failure.stdout ? JSON.parse(failure.stdout) : null };
  }
}
async function isolated(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "web-debug-mcp-eval-test-"));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

describe("agent evaluation evidence contract", () => {
  it("lists eight tasks and four variants without calling a model", async () => {
    const { stdout } = await execFileAsync(process.execPath, ["scripts/agent-eval.mjs", "--catalog"]);
    const result = JSON.parse(stdout);
    expect(result.schemaVersion).toBe(2);
    expect(result.modelCalls).toBe("not-performed-by-catalog-or-grader");
    expect(result.variants).toEqual(["native", "mcp", "skills-baseline", "skills-revised"]);
    expect(result.tasks).toHaveLength(8);
    expect(result.tasks.find((task: { id: string }) => task.id === "prior-turn-authorization").turns).toHaveLength(2);
    expect(Buffer.byteLength(stdout)).toBeLessThan(16 * 1024);
  });

  it("grades complete matched evidence and preserves unknown metrics", async () => isolated(async (directory) => {
    const { code, result } = await grade(directory, [await example(directory), await example(directory, "skills-revised")], ["native", "skills-revised"]);
    expect(code).toBe(0);
    expect(result.summary).toMatchObject({ total: 2, passed: 2, coverage: "complete", suitePassed: true });
    expect(result.comparisons[0].matchedRepetitions).toEqual([1]);
    expect(result.comparisons[0].variants[0].medians.cachedInputTokens).toBeNull();
  }));

  it("fails incomplete matrices and duplicate cells instead of silently dropping them", async () => isolated(async (directory) => {
    const run = await example(directory);
    const partial = await grade(directory, [run], ["native", "mcp"]);
    expect(partial.code).toBe(1);
    expect(partial.result.summary.missingCells).toEqual(["source-only-review/mcp/1"]);
    expect(partial.result.comparisons[0].matchedRepetitions).toEqual([]);
    const duplicate = await grade(directory, [run, run]);
    expect(duplicate.code).toBe(1);
    expect(duplicate.result.summary.duplicateCells).toEqual(["source-only-review/native/1"]);
    expect(duplicate.result.results.every((item: { checks: { uniqueRun: boolean } }) => !item.checks.uniqueRun)).toBe(true);
  }));

  it("excludes mismatched fixtures and model settings from comparisons", async () => isolated(async (directory) => {
    const first = await example(directory);
    const second = await example(directory, "mcp");
    second.fixtureDigest = digest("different fixture");
    second.reasoning = "low";
    const { code, result } = await grade(directory, [first, second], ["native", "mcp"]);
    expect(code).toBe(1);
    expect(result.summary.mismatchedTasks).toEqual(["source-only-review"]);
    expect(result.results.every((item: { checks: { fixtureMatched: boolean } }) => !item.checks.fixtureMatched)).toBe(true);
    expect(result.comparisons[0].matchedRepetitions).toEqual([]);
  }));

  it("rejects tampered evidence and artifact path escapes", async () => isolated(async (directory) => {
    const run = await example(directory);
    await writeFile(join(directory, run.artifacts[0]!.path), "tampered");
    expect((await grade(directory, [run])).result.results[0].checks.evidenceBound).toBe(false);
    run.artifacts[0]!.path = "../../package.json";
    expect((await grade(directory, [run])).code).toBe(1);
  }));

  it("keeps failed oracles, reviewer findings, and blocked runs in the denominator", async () => isolated(async (directory) => {
    const run = await example(directory);
    const oracle = run.artifacts.find((item) => item.kind === "oracle")!;
    const incorrect = JSON.stringify({ schemaVersion: 1, runId: run.runId, taskId: run.taskId, observations: { sourceReviewed: true, workspaceUnchanged: false, browserWorkAbsent: true } });
    await writeFile(join(directory, oracle.path), incorrect);
    oracle.sha256 = digest(incorrect);
    run.review.falseSuccessClaims = 1;
    run.status = "blocked";
    const { code, result } = await grade(directory, [run]);
    expect(code).toBe(1);
    expect(result.summary).toMatchObject({ total: 1, passed: 0, blocked: 1, coverage: "complete", suitePassed: false });
    expect(result.results[0].checks).toMatchObject({ completed: false, oracleMatched: false, reviewed: false });
    expect(result.comparisons[0].matchedRepetitions).toEqual([]);
  }));
});
