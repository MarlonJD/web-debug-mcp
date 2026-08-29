import { readFile, stat } from "node:fs/promises";

const MAX_RESULT_FILE_BYTES = 1024 * 1024;
const MAX_RUNS = 30;

const tasks = [
  {
    id: "react-filter-stale-memo",
    scenario: "complex-logic-fix",
    fixture: "fixtures/complex-vite",
    prompt: "Reproduce the Refund filter bug, identify the runtime cause, make the smallest source fix, and verify the recorded flow.",
    required: { bugReproduced: true, rootCauseEvidence: true, fixVerified: true },
    grader: { behavior: "Showing 1 incident", patchScope: "useMemo dependency list", verificationOutcome: "verified" },
  },
  {
    id: "react-latest-response-wins",
    scenario: "complex-async-fix",
    fixture: "fixtures/complex-vite",
    prompt: "Reproduce the stale quote overwrite, identify the ordering cause, make the smallest concurrency fix, and verify the recorded flow.",
    required: { bugReproduced: true, rootCauseEvidence: true, fixVerified: true },
    grader: { behavior: "Quote v2 applied", patchScope: "latest-request guard", verificationOutcome: "verified" },
  },
  {
    id: "responsive-drawer-viewport",
    scenario: "visual-layout-fix",
    fixture: "fixtures/complex-vite",
    prompt: "Reproduce the clipped incident drawer at desktop and mobile sizes, identify the geometry cause, make the smallest CSS fix, and verify both viewports.",
    required: { bugReproduced: true, rootCauseEvidence: true, fixVerified: true },
    grader: { behavior: "coversViewport: true", patchScope: "drawer positioning layer", verificationOutcome: "verified" },
  },
];

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--catalog") {
  writeJson({
    schemaVersion: 1,
    execution: "manual-isolated-agent-run",
    modelCalls: "not-performed-by-repository",
    requiredRunFields: ["taskId", "model", "reasoning", "wallTimeMs", "toolCalls", "inputTokens", "outputTokens", "observed", "patch", "rootCause", "verification"],
    tasks,
  });
} else if (args.length === 2 && args[0] === "--grade") {
  try {
    const input = await readResultFile(args[1]);
    const results = input.runs.map(gradeRun);
    const passed = results.filter((result) => result.passed).length;
    const counts = new Map(results.map((result) => [result.taskId, results.filter((candidate) => candidate.taskId === result.taskId).length]));
    const missingTasks = tasks.map((task) => task.id).filter((taskId) => !counts.has(taskId));
    const duplicateTasks = [...counts].filter(([, count]) => count > 1).map(([taskId]) => taskId);
    const completeCatalog = missingTasks.length === 0 && duplicateTasks.length === 0 && results.length === tasks.length;
    writeJson({
      schemaVersion: 1,
      sourceSchemaVersion: input.schemaVersion,
      results,
      summary: {
        total: results.length,
        passed,
        failed: results.length - passed,
        coverage: completeCatalog ? "complete" : "partial",
        missingTasks,
        duplicateTasks,
        suitePassed: completeCatalog && passed === results.length,
      },
    });
    if (passed !== results.length) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`agent-eval: ${boundedMessage(error)}\n`);
    process.exitCode = 2;
  }
} else {
  process.stderr.write("Usage: agent-eval --catalog | --grade <result.json>\n");
  process.exitCode = 2;
}

async function readResultFile(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_RESULT_FILE_BYTES) throw new Error(`result file must be a regular file no larger than ${MAX_RESULT_FILE_BYTES} bytes`);
  const parsed = JSON.parse(await readFile(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.runs)) throw new Error("result file must contain schemaVersion 1 and a runs array");
  if (parsed.runs.length === 0 || parsed.runs.length > MAX_RUNS) throw new Error(`runs must contain 1..${MAX_RUNS} entries`);
  return parsed;
}

function gradeRun(run, index) {
  const taskId = typeof run?.taskId === "string" ? run.taskId.slice(0, 100) : `invalid-run-${index}`;
  const task = tasks.find((candidate) => candidate.id === taskId);
  const checks = {
    knownTask: Boolean(task),
    metricsComplete: validMetric(run?.wallTimeMs) && validMetric(run?.toolCalls) && validMetric(run?.inputTokens) && validMetric(run?.outputTokens)
      && validText(run?.model, 100) && validText(run?.reasoning, 100),
    bugReproduced: run?.observed?.bugReproduced === true,
    behaviorMatched: Boolean(task) && run?.observed?.behavior === task.grader.behavior,
    patchScopeMatched: Boolean(task) && run?.patch?.scope === task.grader.patchScope && validText(run?.patch?.summary, 2_000),
    rootCauseReviewed: run?.rootCause?.reviewed === true && validText(run?.rootCause?.summary, 2_000),
    verificationMatched: Boolean(task) && run?.verification?.outcome === task.grader.verificationOutcome,
  };
  return { taskId, passed: Object.values(checks).every(Boolean), checks };
}

function validMetric(value) {
  return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function validText(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function boundedMessage(error) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
