import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(".");
const skillsRoot = resolve("plugins/web-debug/skills");
const validatorPath = resolve(skillsRoot, "manual-parity-qualification/scripts/validate-manual-parity.mjs");
const baselineDigest = "a".repeat(64);
const sourceDigest = "b".repeat(64);

interface Fixture {
  qualification: Record<string, unknown>;
  crosswalk: Record<string, unknown>;
  run: Record<string, unknown>;
}

async function invokeValidator(root: string, qualificationPath: string, crosswalkPath: string, runPath?: string) {
  const args = [
    validatorPath,
    "--root", root,
    "--qualification", qualificationPath,
    "--crosswalk", crosswalkPath,
    ...(runPath ? ["--run", runPath] : []),
  ];
  try {
    const result = await execFileAsync(process.execPath, args, { cwd: repositoryRoot, maxBuffer: 2 * 1024 * 1024 });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    return { exitCode: typeof failure.code === "number" ? failure.code : 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

function createFixture(): Fixture {
  const qualification = {
    schemaVersion: 1,
    qualificationId: "account-qualification",
    baseline: {
      id: "manual-2026-08",
      digest: baselineDigest,
      review: {
        status: "approved",
        reviewedBy: "product-owner",
        reviewedAt: "2026-08-30T20:00:00Z",
        note: "Approved against the named source revision.",
      },
    },
    sources: [{ id: "manual", kind: "manual", revision: "2026-08", digest: sourceDigest, location: "docs/manual.md" }],
    actors: [{ id: "account-manager", purpose: "Owns the approved account workflow." }],
    nativeTests: [{ id: "qualification.account.create", ref: "tests/manual-parity/campaigns/account.spec.ts" }],
    requirements: [{
      id: "REQ-001",
      title: "An authorized manager can create an account.",
      sourceIds: ["manual"],
      ownerCaseId: "E2E-001",
      review: "approved",
      reason: null,
      requiredFacets: ["visible-ui", "api-readback"],
      mutation: { kind: "mutating", receiptRequired: true },
    }],
    manualCases: [{
      id: "E2E-001",
      title: "Create an account through the visible workflow.",
      sourceIds: ["manual"],
      requirementIds: ["REQ-001"],
      actorIds: ["account-manager"],
      kind: "golden",
    }],
    campaigns: [{
      id: "golden-account",
      kind: "golden",
      orderedCaseIds: ["E2E-001"],
      nativeTestIds: ["qualification.account.create"],
    }],
  };
  const crosswalk = {
    schemaVersion: 1,
    qualificationId: "account-qualification",
    qualificationDigest: "",
    baselineDigest,
    rows: [{
      manualCaseId: "E2E-001",
      requirementIds: ["REQ-001"],
      nativeTestIds: ["qualification.account.create"],
      executionClass: "ui-required",
      coverage: "full",
      requiredFacets: ["visible-ui", "api-readback"],
      reason: null,
    }],
  };
  const run = {
    schemaVersion: 1,
    qualificationId: "account-qualification",
    qualificationDigest: "",
    baselineDigest,
    crosswalkDigest: "",
    run: {
      id: "run-2026-08-30-001",
      repositoryRevision: "reviewed-build-001",
      targetProfile: "local-dev",
      datasetId: "seed-001",
      executionNamespace: "account-run-001",
      runner: { name: "Playwright", version: "project-owned", command: "npm run test:manual-parity" },
      startedAt: "2026-08-30T20:10:00Z",
      completedAt: "2026-08-30T20:12:00Z",
    },
    results: [{
      manualCaseId: "E2E-001",
      nativeTestIds: ["qualification.account.create"],
      execution: "passed",
      stability: "clean",
      requirements: [{
        requirementId: "REQ-001",
        execution: "passed",
        stability: "clean",
        observedFacets: [
          { kind: "visible-ui", ref: "playwright-report/account-create", digest: null },
          { kind: "api-readback", ref: "run-data/account-create.json", digest: null },
        ],
        mutationCertainty: "confirmed",
        mutationEvidence: {
          executionNamespace: "account-run-001",
          correlationId: "corr-account-create-001",
          objectRef: "account-001",
          expectedRevision: "0",
          receiptRef: "run-data/account-create-receipt.json",
          receiptDigest: "c".repeat(64),
          idempotencyKeyDigest: "d".repeat(64),
        },
        manualReview: null,
      }],
      diagnostics: { webDebugRefs: [] },
      artifacts: [{ kind: "trace", ref: "playwright-report/account-create.zip", digest: null }],
    }],
    summary: {
      verdict: "passed",
      requirements: { passed: 1, failed: 0, inconclusive: 0, blocked: 0, notRun: 0 },
      manualCases: { passed: 1, failed: 0, inconclusive: 0, blocked: 0, notRun: 0 },
      stability: { clean: 1, flaky: 0, unknown: 0 },
    },
  };
  return { qualification, crosswalk, run };
}

async function validateFixture(fixture: Fixture, afterDigestBinding?: (fixture: Fixture) => void) {
  const root = await mkdtemp(join(tmpdir(), "manual-parity-validator-"));
  try {
    await mkdir(join(root, "tests/manual-parity"), { recursive: true });
    await mkdir(join(root, "artifacts/manual-parity/runs"), { recursive: true });
    const qualificationText = `${JSON.stringify(fixture.qualification, null, 2)}\n`;
    const qualificationDigest = createHash("sha256").update(qualificationText).digest("hex");
    (fixture.crosswalk as { qualificationDigest: string }).qualificationDigest = qualificationDigest;
    const crosswalkText = `${JSON.stringify(fixture.crosswalk, null, 2)}\n`;
    (fixture.run as { qualificationDigest: string }).qualificationDigest = qualificationDigest;
    (fixture.run as { crosswalkDigest: string }).crosswalkDigest = createHash("sha256").update(crosswalkText).digest("hex");
    afterDigestBinding?.(fixture);
    const runText = `${JSON.stringify(fixture.run, null, 2)}\n`;
    await Promise.all([
      writeFile(join(root, "tests/manual-parity/qualification.json"), qualificationText),
      writeFile(join(root, "tests/manual-parity/crosswalk.json"), crosswalkText),
      writeFile(join(root, "artifacts/manual-parity/runs/run.json"), runText),
    ]);
    return await invokeValidator(root, "tests/manual-parity/qualification.json", "tests/manual-parity/crosswalk.json", "artifacts/manual-parity/runs/run.json");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("bundled plugin skills", () => {
  it("discovers three uniquely named and correctly routed skills", async () => {
    const directories = (await readdir(skillsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    expect(directories).toEqual(["manual-parity-qualification", "web-debug-workflow", "webmcp-tool-authoring"]);
    const names = [];
    for (const directory of directories) {
      const text = await readFile(join(skillsRoot, directory, "SKILL.md"), "utf8");
      const name = text.match(/^name:\s*([^\n]+)$/m)?.[1]?.trim();
      expect(name).toBe(directory);
      names.push(name);
    }
    expect(new Set(names).size).toBe(names.length);

    const qualificationSkill = await readFile(join(skillsRoot, "manual-parity-qualification/SKILL.md"), "utf8");
    expect(qualificationSkill).toContain("Never promote your own generated baseline to `approved`");
    expect(qualificationSkill).toContain("typed native test code");
    expect(qualificationSkill).toContain("Web Debug diagnostics never award qualification PASS");
    expect(qualificationSkill).toContain("record `inconclusive`");
    const webmcpSkill = await readFile(join(skillsRoot, "webmcp-tool-authoring/SKILL.md"), "utf8");
    expect(webmcpSkill).toContain("approved, reviewed product requirement");
    expect(webmcpSkill).toContain("not replayable");
    expect(webmcpSkill).toContain("never retried");
    const workflowSkill = await readFile(join(skillsRoot, "web-debug-workflow/SKILL.md"), "utf8");
    const safariDiagnostics = await readFile(join(skillsRoot, "web-debug-workflow/references/safari-mcp-diagnostics.md"), "utf8");
    expect(workflowSkill).toContain("Gate 0");
    expect(workflowSkill).toContain("MCP_CLIENT_BINDING_UNAVAILABLE");
    expect(workflowSkill).toContain("MCP_SERVER_STARTUP_UNAVAILABLE");
    for (const forbidden of ["Playwright", "Puppeteer", "raw CDP", "direct MCP SDK", "npx web-debug-mcp", "web-debug-mcp cleanup"]) expect(workflowSkill).toContain(forbidden);
    expect(workflowSkill).toContain("Settings → MCP servers → Restart");
    expect(workflowSkill).toContain("new task/session");
    expect(workflowSkill).toContain("0.152.0");
    const mcpConfig = JSON.parse(await readFile(resolve("plugins/web-debug/.mcp.json"), "utf8")) as { mcpServers?: Record<string, { required?: unknown }> };
    expect(mcpConfig.mcpServers?.["web-debug-mcp"]?.required).toBeUndefined();
    expect(workflowSkill).toContain("references/safari-mcp-diagnostics.md");
    expect(safariDiagnostics).toContain("create_tab");
    expect(safariDiagnostics).toContain("navigate_to_url");
    expect(safariDiagnostics).toContain("browser_console_messages");
    expect(safariDiagnostics).toContain("list_network_requests");
    expect(safariDiagnostics).toContain("close_tab");
    expect(safariDiagnostics).toContain("Do not call `list_tabs`");
    expect(safariDiagnostics).toContain("Do not call `list_tabs`, `switch_tab`, `get_network_request`");
    expect(safariDiagnostics).toContain("Never merge it into a Web Debug evidence bundle");
    expect(safariDiagnostics).toContain("qualification PASS");
  });
});

describe("manual parity metadata validator", () => {
  it("accepts an approved, fully evidenced native-runner record", async () => {
    const result = await validateFixture(createFixture());
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout) as { ok: boolean; crosswalk: { ready: boolean }; run: { computedSummary: { verdict: string } }; errors: unknown[] };
    expect(output.ok).toBe(true);
    expect(output.crosswalk.ready).toBe(true);
    expect(output.run.computedSummary.verdict).toBe("passed");
    expect(output.errors).toEqual([]);
  });

  it("binds run records to the exact qualification catalog bytes", async () => {
    const result = await validateFixture(createFixture(), (fixture) => {
      (fixture.run as { qualificationDigest: string }).qualificationDigest = "e".repeat(64);
    });
    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout) as { errors: Array<{ message: string }> };
    expect(output.errors.some((error) => error.message.includes("exact qualification.json bytes"))).toBe(true);
  });

  it("preserves a blocked execution instead of relabeling unknown stability inconclusive", async () => {
    const fixture = createFixture();
    const caseResult = (fixture.run.results as Array<{ execution: string; stability: string; requirements: Array<Record<string, unknown>> }>)[0]!;
    caseResult.execution = "blocked";
    caseResult.stability = "unknown";
    caseResult.requirements[0] = {
      ...caseResult.requirements[0]!,
      execution: "blocked",
      stability: "unknown",
      observedFacets: [],
      mutationCertainty: "not-applicable",
      mutationEvidence: null,
    };
    fixture.run.summary = {
      verdict: "blocked",
      requirements: { passed: 0, failed: 0, inconclusive: 0, blocked: 1, notRun: 0 },
      manualCases: { passed: 0, failed: 0, inconclusive: 0, blocked: 1, notRun: 0 },
      stability: { clean: 0, flaky: 0, unknown: 1 },
    };
    const result = await validateFixture(fixture);
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as { run: { computedSummary: { verdict: string } } };
    expect(output.run.computedSummary.verdict).toBe("blocked");
  });

  it("does not let one native test own multiple manual cases", async () => {
    const fixture = createFixture();
    (fixture.qualification.requirements as Array<Record<string, unknown>>).push({
      id: "REQ-002",
      title: "A viewer cannot create an account.",
      sourceIds: ["manual"],
      ownerCaseId: "BR-001",
      review: "approved",
      reason: null,
      requiredFacets: ["api-readback"],
      mutation: { kind: "mutating", receiptRequired: true },
    });
    (fixture.qualification.manualCases as Array<Record<string, unknown>>).push({
      id: "BR-001",
      title: "Reject viewer account creation without drift.",
      sourceIds: ["manual"],
      requirementIds: ["REQ-002"],
      actorIds: ["account-manager"],
      kind: "atomic",
    });
    (fixture.qualification.campaigns as Array<Record<string, unknown>>).push({
      id: "atomic-account",
      kind: "atomic",
      orderedCaseIds: ["BR-001"],
      nativeTestIds: ["qualification.account.create"],
    });
    (fixture.crosswalk.rows as Array<Record<string, unknown>>).push({
      manualCaseId: "BR-001",
      requirementIds: ["REQ-002"],
      nativeTestIds: ["qualification.account.create"],
      executionClass: "api-only",
      coverage: "full",
      requiredFacets: ["api-readback"],
      reason: null,
    });
    const result = await validateFixture(fixture);
    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout) as { errors: Array<{ message: string }> };
    expect(output.errors.some((error) => error.message.includes("already owned by manual case"))).toBe(true);
  });

  it.each([
    ["executable JSON field", (fixture: Fixture) => { ((fixture.crosswalk.rows as Array<Record<string, unknown>>)[0]!).selector = "#submit"; }, "not a recognized field"],
    ["missing manual case row", (fixture: Fixture) => { fixture.crosswalk.rows = []; }, "missing manual case"],
    ["API-only UI claim", (fixture: Fixture) => { ((fixture.crosswalk.rows as Array<Record<string, unknown>>)[0]!).executionClass = "api-only"; }, "cannot claim visible-ui parity"],
    ["campaign test drift", (fixture: Fixture) => {
      (fixture.qualification.nativeTests as Array<Record<string, unknown>>).push({ id: "qualification.unrelated", ref: "tests/manual-parity/unrelated.spec.ts" });
      ((fixture.qualification.campaigns as Array<{ nativeTestIds: string[] }>)[0]!).nativeTestIds.push("qualification.unrelated");
    }, "must exactly equal the union"],
    ["candidate self-approval", (fixture: Fixture) => {
      const baseline = fixture.qualification.baseline as { review: Record<string, unknown> };
      baseline.review = { status: "candidate", reviewedBy: null, reviewedAt: null, note: null };
      ((fixture.qualification.requirements as Array<Record<string, unknown>>)[0]!).review = "candidate";
    }, "cannot receive qualification PASS"],
    ["ambiguous mutating PASS", (fixture: Fixture) => {
      const caseResult = (fixture.run.results as Array<{ requirements: Array<Record<string, unknown>> }>)[0]!;
      caseResult.requirements[0]!.mutationCertainty = "ambiguous";
      caseResult.requirements[0]!.mutationEvidence = null;
    }, "forces inconclusive execution"],
    ["missing qualifying facet", (fixture: Fixture) => {
      const caseResult = (fixture.run.results as Array<{ requirements: Array<Record<string, unknown>> }>)[0]!;
      caseResult.requirements[0]!.observedFacets = [{ kind: "visible-ui", ref: "playwright-report/account-create", digest: null }];
    }, "missing required facet 'api-readback'"],
    ["flaky child hidden by parent PASS", (fixture: Fixture) => {
      const caseResult = (fixture.run.results as Array<{ requirements: Array<Record<string, unknown>> }>)[0]!;
      caseResult.requirements[0]!.stability = "flaky";
    }, "must equal computed case execution 'inconclusive'"],
    ["stored aggregate drift", (fixture: Fixture) => {
      const summary = fixture.run.summary as { requirements: { passed: number } };
      summary.requirements.passed = 0;
    }, "does not match validator-computed aggregate"],
  ])("rejects %s", async (_name, mutate, expectedMessage) => {
    const fixture = createFixture();
    mutate(fixture);
    const result = await validateFixture(fixture);
    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout) as { ok: boolean; errors: Array<{ message: string }> };
    expect(output.ok).toBe(false);
    expect(output.errors.some((error) => error.message.includes(expectedMessage))).toBe(true);
  });

  it("rejects absolute, escaping, symlinked, directory, and oversized inputs", async () => {
    const outer = await mkdtemp(join(tmpdir(), "manual-parity-containment-"));
    const root = join(outer, "project");
    try {
      await mkdir(join(root, "tests/manual-parity"), { recursive: true });
      const minimal = "{}\n";
      const qualificationPath = join(root, "tests/manual-parity/qualification.json");
      const crosswalkPath = join(root, "tests/manual-parity/crosswalk.json");
      const outsidePath = join(outer, "outside.json");
      await Promise.all([
        writeFile(qualificationPath, minimal),
        writeFile(crosswalkPath, minimal),
        writeFile(outsidePath, minimal),
        writeFile(join(root, "tests/manual-parity/oversized.json"), Buffer.alloc(1024 * 1024 + 1, 0x20)),
      ]);
      await symlink(outsidePath, join(root, "tests/manual-parity/escape.json"));
      const cases = [
        [qualificationPath, "path must be a non-empty path relative"],
        ["../outside.json", "path escapes --root"],
        ["tests/manual-parity/escape.json", "real path escapes --root"],
        ["tests/manual-parity", "must be a regular JSON file"],
        ["tests/manual-parity/oversized.json", "must be a regular JSON file"],
      ] as const;
      for (const [path, expected] of cases) {
        const result = await invokeValidator(root, path, "tests/manual-parity/crosswalk.json");
        expect(result.exitCode).toBe(2);
        const output = JSON.parse(result.stdout) as { error: { message: string } };
        expect(output.error.message).toContain(expected);
      }
    } finally {
      await rm(outer, { recursive: true, force: true });
    }
  });
});
