import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { SessionManager } from "../dist/core/session-manager.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const browserPath = process.env.WEB_DEBUG_CHROME_EXECUTABLE_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const defaultRuns = 3;

const scenarioDefinitions = {
  vanilla: {
    id: "vanilla-validation",
    title: "Vanilla payment validation",
    description: "A browser-only validation error with a form value that should not leak into replay evidence.",
    projectRoot: join(repositoryRoot, "fixtures/vanilla"),
    serverScript: join(repositoryRoot, "scripts/serve-fixture.mjs"),
    portEnv: "WEB_DEBUG_FIXTURE_PORT",
    port: Number(process.env.WEB_DEBUG_DEMO_VANILLA_PORT ?? 4183),
    urlPath: "/",
    actions: [
      { kind: "fill", selector: "#amount", value: "not-a-number" },
      { kind: "click", selector: "#submit" },
      { kind: "wait", selector: "#status", text: "Invalid amount", timeoutMs: 5_000 },
    ],
    checks: [{ kind: "textContains", value: "Invalid amount" }],
    baselineSurfaces: ["DOM", "console", "network", "source file"],
    baselineInspect: async ({ projectRoot }) => ({
      sourceFile: "fixtures/vanilla/app.js",
      validationBranchFound: (await readFile(join(projectRoot, "app.js"), "utf8")).includes("Payment validation failed"),
    }),
    mcpHighlights: ["redacted replay input", "console error linked to DOM state", "one evidence bundle"],
  },
  "react-vite": {
    id: "react-render-cause",
    title: "React state and render-cause diagnosis",
    description: "A state update whose result can be checked against the component hook and render-cause evidence.",
    projectRoot: join(repositoryRoot, "fixtures/react-vite"),
    serverScript: join(repositoryRoot, "scripts/serve-react-vite.mjs"),
    portEnv: "WEB_DEBUG_REACT_VITE_PORT",
    port: Number(process.env.WEB_DEBUG_DEMO_REACT_VITE_PORT ?? 4184),
    urlPath: "/",
    actions: [
      { kind: "click", selector: "button" },
      { kind: "wait", selector: "[role=status]", text: "Payment submitted: 249.90", timeoutMs: 5_000 },
    ],
    checks: [
      { kind: "textContains", value: "Payment submitted: 249.90" },
      { kind: "noConsoleErrors" },
    ],
    baselineSurfaces: ["DOM", "console", "network", "source file"],
    baselineInspect: async ({ projectRoot }) => ({
      sourceFile: "fixtures/react-vite/src/App.jsx",
      stateSetterFound: (await readFile(join(projectRoot, "src/App.jsx"), "utf8")).includes("setSubmitted(true)"),
      runtimeRenderCause: "unavailable without the MCP React bridge",
    }),
    mcpHighlights: ["hook state", "render cause", "flat flamegraph", "Vite module graph"],
  },
  next: {
    id: "next-server-action",
    title: "Next.js Server Action linkage",
    description: "A client flow whose Server Action request can be linked to its manifest resolution and server trace.",
    projectRoot: join(repositoryRoot, "fixtures/next"),
    serverScript: join(repositoryRoot, "scripts/serve-next.mjs"),
    portEnv: "WEB_DEBUG_NEXT_PORT",
    port: Number(process.env.WEB_DEBUG_DEMO_NEXT_PORT ?? 4185),
    urlPath: "/",
    actions: [
      { kind: "wait", timeoutMs: 500 },
      { kind: "click", selector: "#health-button" },
      { kind: "wait", selector: "[role=status]", text: "Healthy", timeoutMs: 5_000 },
    ],
    checks: [
      { kind: "textContains", value: "Healthy" },
      { kind: "noConsoleErrors" },
    ],
    postActions: [
      { kind: "wait", timeoutMs: 500 },
      { kind: "click", selector: "#payment-button" },
      { kind: "wait", selector: "#server-action-status", text: "Submitted", timeoutMs: 5_000 },
    ],
    baselineSurfaces: ["DOM", "console", "network", "manifest file", "server log"],
    baselineInspect: async ({ projectRoot, actionId }) => {
      const manifestPath = join(projectRoot, ".next", "dev", "server", "server-reference-manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const manifestIds = [
        ...Object.keys(manifest.node ?? {}),
        ...Object.keys(manifest.edge ?? {}),
      ];
      const logPath = join(projectRoot, ".next", "dev", "logs", "next-development.log");
      return {
        manifestActionIdFound: manifestIds.includes(actionId),
        serverLogAvailable: existsSync(logPath),
        requestToManifestLink: "manual correlation required",
      };
    },
    mcpHighlights: ["route metadata", "Server Action resolution", "request trace linkage", "bounded log tail"],
  },
  "complex-logic-fix": {
    kind: "repair",
    id: "complex-logic-fix",
    title: "Complex React filter regression and fix verification",
    description: "A derived incident list becomes stale after a search change because its memo dependencies are incomplete.",
    fixtureRoot: join(repositoryRoot, "fixtures/complex-vite"),
    serverScript: join(repositoryRoot, "scripts/serve-complex-vite.mjs"),
    portEnv: "WEB_DEBUG_COMPLEX_VITE_PORT",
    rootEnv: "WEB_DEBUG_COMPLEX_VITE_ROOT",
    port: Number(process.env.WEB_DEBUG_DEMO_COMPLEX_LOGIC_PORT ?? 4186),
    urlPath: "/",
    viewport: { width: 1_440, height: 900 },
    diagnosisActions: [
      { kind: "fill", selector: "[aria-label='Search incidents']", value: "Refund" },
    ],
    diagnosisChecks: [{ kind: "textContains", value: "Showing 1 incident" }],
    verificationActions: [
      { kind: "fill", selector: "[aria-label='Search incidents']", value: "Refund" },
      { kind: "wait", selector: "[data-testid='visible-count']", text: "Showing 1 incident", timeoutMs: 5_000 },
    ],
    verificationChecks: [
      { kind: "textContains", value: "Showing 1 incident" },
      { kind: "noConsoleErrors" },
    ],
    fixes: [{ file: "src/App.jsx", from: "  }, []);", to: "  }, [query, status]);" }],
    baselineInspect: async ({ projectRoot }) => ({
      sourceFile: "src/App.jsx",
      staleMemoDependencyMarker: (await readFile(join(projectRoot, "src/App.jsx"), "utf8")).includes("  }, []);"),
    }),
    mcpHighlights: ["failed pre-fix check", "React hook change", "render cause", "replay", "fixed scenario verification"],
  },
  "complex-async-fix": {
    kind: "repair",
    id: "complex-async-fix",
    title: "Out-of-order async quote regression and fix verification",
    description: "Two deterministic quote requests resolve out of order, allowing a stale response to overwrite the latest result.",
    fixtureRoot: join(repositoryRoot, "fixtures/complex-vite"),
    serverScript: join(repositoryRoot, "scripts/serve-complex-vite.mjs"),
    portEnv: "WEB_DEBUG_COMPLEX_VITE_PORT",
    rootEnv: "WEB_DEBUG_COMPLEX_VITE_ROOT",
    port: Number(process.env.WEB_DEBUG_DEMO_COMPLEX_ASYNC_PORT ?? 4188),
    urlPath: "/",
    viewport: { width: 1_440, height: 900 },
    diagnosisActions: [
      { kind: "fill", selector: "[aria-label='Quote quantity']", value: "3" },
      { kind: "fill", selector: "[aria-label='Quote promo code']", value: "SAVE20" },
      { kind: "click", selector: "[data-testid='refresh-quote']" },
      { kind: "click", selector: "[data-testid='refresh-quote']" },
      { kind: "wait", selector: "[data-testid='quote-status']", text: "Quote ready", timeoutMs: 5_000 },
      { kind: "wait", timeoutMs: 350 },
    ],
    diagnosisChecks: [{ kind: "textContains", value: "Quote v2 applied" }],
    verificationActions: [
      { kind: "fill", selector: "[aria-label='Quote quantity']", value: "3" },
      { kind: "fill", selector: "[aria-label='Quote promo code']", value: "SAVE20" },
      { kind: "click", selector: "[data-testid='refresh-quote']" },
      { kind: "click", selector: "[data-testid='refresh-quote']" },
      { kind: "wait", selector: "[data-testid='quote-status']", text: "Quote ready", timeoutMs: 5_000 },
      { kind: "wait", timeoutMs: 350 },
    ],
    verificationChecks: [
      { kind: "textContains", value: "Quote v2 applied" },
      { kind: "noConsoleErrors" },
    ],
    fixes: [{ file: "src/App.jsx", from: "    const result = await requestQuote({ quantity: Number(quantity), coupon });\n    setQuote({ status: \"Quote ready\", requestId: result.requestId, total: result.total });", to: "    const result = await requestQuote({ quantity: Number(quantity), coupon });\n    if (requestNumber !== latestQuoteRequest.current) return;\n    setQuote({ status: \"Quote ready\", requestId: result.requestId, total: result.total });" }],
    baselineInspect: async ({ projectRoot }) => ({
      sourceFile: "src/App.jsx",
      staleResponseMarker: (await readFile(join(projectRoot, "src/App.jsx"), "utf8")).includes("requestNumber !== latestQuoteRequest.current") === false,
    }),
    mcpHighlights: ["two rapid async requests", "out-of-order completion", "React hook timeline", "stale result evidence", "fixed latest-request-wins verification"],
  },
  "visual-layout-fix": {
    kind: "repair",
    id: "visual-layout-fix",
    title: "Responsive incident drawer visual fix",
    description: "An incident details layer starts below the topbar, so the backdrop and drawer are not full-viewport on desktop or mobile.",
    fixtureRoot: join(repositoryRoot, "fixtures/complex-vite"),
    serverScript: join(repositoryRoot, "scripts/serve-complex-vite.mjs"),
    portEnv: "WEB_DEBUG_COMPLEX_VITE_PORT",
    rootEnv: "WEB_DEBUG_COMPLEX_VITE_ROOT",
    port: Number(process.env.WEB_DEBUG_DEMO_VISUAL_PORT ?? 4187),
    urlPath: "/",
    viewportSizes: [
      { label: "desktop", width: 1_440, height: 900 },
      { label: "mobile", width: 390, height: 844 },
    ],
    diagnosisActions: [
      { kind: "click", selector: "[data-testid='view-refund']" },
      { kind: "wait", selector: "[data-testid='incident-drawer']", timeoutMs: 5_000 },
    ],
    diagnosisChecks: [
      { kind: "textContains", value: "Refund request" },
      { kind: "noConsoleErrors" },
    ],
    verificationActions: [
      { kind: "click", selector: "[data-testid='view-refund']" },
      { kind: "wait", selector: "[data-testid='incident-drawer']", timeoutMs: 5_000 },
    ],
    verificationChecks: [
      { kind: "textContains", value: "Refund request" },
      { kind: "noConsoleErrors" },
    ],
    fixes: [{ file: "src/styles.css", from: ".drawer-layer { position: absolute; inset: 76px 0 0;", to: ".drawer-layer { position: fixed; inset: 0;" }],
    baselineInspect: async ({ projectRoot }) => ({
      sourceFile: "src/styles.css",
      clippedLayerMarker: (await readFile(join(projectRoot, "src/styles.css"), "utf8")).includes(".drawer-layer { position: absolute; inset: 76px 0 0;"),
    }),
    mcpHighlights: ["before screenshot", "desktop/mobile geometry", "viewport coverage invariant", "after screenshot", "no desktop regression"],
  },
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const selected = options.scenario === "all"
    ? Object.keys(scenarioDefinitions)
    : [options.scenario];

  if (!existsSync(browserPath)) {
    throw new Error(`Chromium executable not found: ${browserPath}. Set WEB_DEBUG_CHROME_EXECUTABLE_PATH.`);
  }

  const artifactDir = await mkdtemp(join(tmpdir(), "web-debug-mcp-demo-"));
  const results = [];
  for (const scenarioName of selected) {
    const definition = scenarioDefinitions[scenarioName];
    if (!definition) throw new Error(`Unknown scenario: ${scenarioName}. Choose vanilla, react-vite, next, or all.`);
    results.push(definition.kind === "repair"
      ? await runRepairScenario(definition, options.runs, artifactDir)
      : await runScenario(definition, options.runs, artifactDir));
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "local-headless",
    comparison: "raw Playwright and direct fixture inspection versus web-debug-mcp SessionManager",
    runs: options.runs,
    browser: browserPath,
    node: process.version,
    artifactDir,
    results,
    notes: [
      "Timings are machine measurements for repeatable local flows, not a promise about human DevTools time.",
      "The baseline intentionally does not use web-debug-mcp adapters, the React bridge, the Vite endpoint, or the Next MCP endpoint.",
      "Cold fixture-server startup is outside both paths; browser/session startup is reported separately from diagnostic work.",
      "Run the same scenario three or more times when comparing changes; use median and p90 rather than one run.",
    ],
  };

  process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${renderMarkdown(report)}\n`);
}

async function runScenario(definition, runs, artifactDir) {
  const child = spawn(process.execPath, [definition.serverScript], {
    cwd: repositoryRoot,
    env: { ...process.env, [definition.portEnv]: String(definition.port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverOutput = collectProcessOutput(child);
  const url = `http://127.0.0.1:${definition.port}${definition.urlPath}`;

  try {
    await waitForUrl(url, child);
    const actionId = definition.id === "next-server-action"
      ? await waitForServerActionId(definition.projectRoot, child)
      : null;
    const baselineRuns = [];
    const mcpRuns = [];
    for (let index = 0; index < runs; index += 1) {
      baselineRuns.push(await runBaseline(definition, url, actionId, artifactDir, index));
      mcpRuns.push(await runMcp(definition, url, actionId));
    }

    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      url,
      baseline: {
        method: "raw Playwright + direct fixture/source inspection",
        surfaces: definition.baselineSurfaces,
        runs: baselineRuns,
        summary: summarizeRuns(baselineRuns),
      },
      mcp: {
        method: "web-debug-mcp SessionManager workflow",
        highlights: definition.mcpHighlights,
        workflow: mcpWorkflow(definition),
        runs: mcpRuns,
        summary: summarizeRuns(mcpRuns),
      },
      comparison: compareEvidence(baselineRuns, mcpRuns),
    };
  } catch (error) {
    const output = serverOutput.text().slice(-1_000);
    throw new Error(`${definition.id} demo failed: ${error instanceof Error ? error.message : String(error)}${output ? `\nFixture output:\n${output}` : ""}`);
  } finally {
    await stopProcess(child);
  }
}

async function runRepairScenario(definition, runs, artifactDir) {
  const runtime = await prepareRepairRuntime(definition);
  const child = spawn(process.execPath, [definition.serverScript], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      [definition.portEnv]: String(definition.port),
      [definition.rootEnv]: runtime.root,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverOutput = collectProcessOutput(child);
  const url = `http://127.0.0.1:${definition.port}${definition.urlPath}`;
  const records = [];

  try {
    await waitForUrl(url, child);
    for (let index = 0; index < runs; index += 1) {
      await writeRepairVariant(runtime, "buggy");
      const baseline = await runRepairBaseline(definition, url, runtime.root, artifactDir, index);
      const diagnosis = await runRepairMcpPhase(
        definition,
        url,
        runtime.root,
        definition.diagnosisActions,
        definition.diagnosisChecks,
        "before",
      );

      const patchStartedAt = performance.now();
      await writeRepairVariant(runtime, "fixed");
      const patchToReadyMs = elapsed(patchStartedAt);
      const fix = await runRepairMcpPhase(
        definition,
        url,
        runtime.root,
        definition.verificationActions,
        definition.verificationChecks,
        "after",
      );
      records.push({ baseline, mcp: { diagnosis, fix, patchToReadyMs } });
    }

    const baselineRuns = records.map((record) => record.baseline);
    const mcpRuns = records.map((record) => record.mcp);
    const fixTimingRuns = records.map((record) => ({
      timingsMs: {
        patchToReady: record.mcp.patchToReadyMs,
        verification: record.mcp.fix.timingsMs.total,
        total: record.mcp.patchToReadyMs + record.mcp.fix.timingsMs.total,
      },
    }));

    return {
      type: "repair",
      id: definition.id,
      title: definition.title,
      description: definition.description,
      url,
      runtimeRoot: runtime.root,
      baseline: {
        method: "raw Playwright + direct fixture/source inspection on the buggy variant",
        surfaces: ["DOM", "console", "network", "source file", ...(definition.viewportSizes ? ["desktop/mobile viewport"] : [])],
        runs: baselineRuns,
        summary: { diagnosis: summarizeRuns(baselineRuns) },
      },
      mcp: {
        method: "web-debug-mcp SessionManager diagnosis → patch → verification workflow",
        workflow: ["web_project_detect", "web_session_start", "web_browser_action", "web_issue_capture", "web_repro_record", "web_fix_verify", "web_session_close"],
        highlights: definition.mcpHighlights,
        runs: mcpRuns,
        summary: {
          diagnosis: summarizeRuns(mcpRuns.map((run) => run.diagnosis)),
          fixVerification: summarizeRuns(fixTimingRuns),
        },
      },
      comparison: compareRepair(definition, baselineRuns, mcpRuns),
    };
  } catch (error) {
    const output = serverOutput.text().slice(-1_000);
    throw new Error(`${definition.id} demo failed: ${error instanceof Error ? error.message : String(error)}${output ? `\nFixture output:\n${output}` : ""}`);
  } finally {
    await stopProcess(child);
  }
}

async function prepareRepairRuntime(definition) {
  const root = await mkdtemp(join(tmpdir(), "web-debug-mcp-repair-"));
  await cp(definition.fixtureRoot, root, {
    recursive: true,
    filter: (source) => source !== join(definition.fixtureRoot, "node_modules"),
  });
  await symlink(join(repositoryRoot, "node_modules"), join(root, "node_modules"), "dir");
  const configPath = join(root, "vite.config.ts");
  const pluginPath = JSON.stringify(join(repositoryRoot, "dist/adapters/vite-plugin.js"));
  const rootLiteral = JSON.stringify(root);
  const config = [
    'import { defineConfig } from "vite";',
    'import react from "@vitejs/plugin-react";',
    `import { webDebugVitePlugin } from ${pluginPath};`,
    "",
    "export default defineConfig({",
    `  root: ${rootLiteral},`,
    "  plugins: [webDebugVitePlugin(), react()],",
    "  server: { host: \"127.0.0.1\", port: Number(process.env.WEB_DEBUG_COMPLEX_VITE_PORT ?? 4186), strictPort: true },",
    "});",
    "",
  ].join("\n");
  await writeFile(configPath, config, "utf8");

  const buggyFiles = {};
  const fixedFiles = {};
  for (const fix of definition.fixes) {
    const path = join(root, fix.file);
    const buggy = await readFile(path, "utf8");
    buggyFiles[fix.file] = buggy;
    fixedFiles[fix.file] = replaceExact(buggy, fix.from, fix.to, fix.file);
  }
  return { root, buggyFiles, fixedFiles };
}

async function writeRepairVariant(runtime, variant) {
  const files = variant === "fixed" ? runtime.fixedFiles : runtime.buggyFiles;
  await Promise.all(Object.entries(files).map(([relativePath, contents]) => writeFile(join(runtime.root, relativePath), contents, "utf8")));
}

async function runRepairBaseline(definition, url, projectRoot, artifactDir, runIndex) {
  const startedAt = performance.now();
  const viewports = definition.viewportSizes ?? [definition.viewport];
  const views = [];
  for (const viewport of viewports) {
    views.push(await runRepairRawView(definition, url, viewport, artifactDir, runIndex));
  }
  const inspectionStartedAt = performance.now();
  const inspection = await definition.baselineInspect({ projectRoot });
  const inspectionMs = elapsed(inspectionStartedAt);
  const bugReproduced = repairBugObserved(definition, views);
  return {
    timingsMs: { diagnosis: elapsed(startedAt), inspection: inspectionMs, total: elapsed(startedAt) },
    bugReproduced,
    rootCauseEvidence: false,
    views,
    sourceInspection: inspection,
    evidence: repairBaselineEvidence(definition, views, inspection),
  };
}

async function runRepairRawView(definition, url, viewport, artifactDir, runIndex) {
  const startedAt = performance.now();
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const observed = installRawObservers(page);
  try {
    const flowStartedAt = performance.now();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await performRawActions(page, definition.diagnosisActions);
    const flowMs = elapsed(flowStartedAt);
    const observation = await readRepairObservation(page, definition);
    const screenshotPath = join(artifactDir, `${definition.id}-baseline-${viewport.label ?? "desktop"}-${runIndex + 1}.png`);
    const captureStartedAt = performance.now();
    await page.screenshot({ path: screenshotPath });
    const captureMs = elapsed(captureStartedAt);
    const consoleEntries = observed.console.concat(observed.pageErrors);
    return {
      viewport,
      timingsMs: { flow: flowMs, capture: captureMs, total: elapsed(startedAt) },
      observation,
      consoleErrorCount: consoleEntries.filter((entry) => entry.level === "error" || entry.level === "pageerror").length,
      networkCount: observed.network.length,
      screenshotPath,
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function runRepairMcpPhase(definition, url, projectRoot, actions, checks, phase) {
  const startedAt = performance.now();
  const viewports = definition.viewportSizes ?? [definition.viewport];
  const views = [];
  for (const viewport of viewports) {
    views.push(await runRepairMcpView(definition, url, projectRoot, viewport, actions, checks, phase));
  }
  const passed = views.every((view) => view.passed && (definition.id !== "visual-layout-fix" || view.observation?.coversViewport === true));
  return {
    timingsMs: { total: elapsed(startedAt) },
    passed,
    bugObserved: phase === "before" ? repairMcpBugObserved(definition, views) : false,
    rootCauseEvidence: phase === "before" ? repairRootCauseEvidence(definition, views) : false,
    views,
    evidence: repairMcpEvidence(definition, views, phase),
  };
}

async function runRepairMcpView(definition, url, projectRoot, viewport, actions, checks, phase) {
  const startedAt = performance.now();
  const manager = new SessionManager();
  let session = null;
  try {
    const sessionStartedAt = performance.now();
    session = await manager.start({
      projectRoot,
      url,
      executablePath: browserPath,
      headless: true,
      viewport: { width: viewport.width, height: viewport.height },
    });
    const sessionStartupMs = elapsed(sessionStartedAt);
    const scenario = manager.recordScenario({
      name: `${definition.title} (${phase})`,
      url,
      actions,
      checks,
    });
    const verification = await manager.verifyScenario(session.id, scenario.id);
    const react = verification.evidence.browser.react;
    const component = findComponent(react?.components ?? [], "IncidentDashboard");
    const observation = definition.id === "visual-layout-fix"
      ? await evaluateRepairLayout(manager, session.id)
      : definition.id === "complex-async-fix"
        ? {
            quoteResult: verification.evidence.browser.dom.bodyText.match(/Quote v\d+ applied: \$[\d.]+/)?.[0] ?? "",
            quoteStatus: verification.evidence.browser.dom.bodyText.includes("Quote ready") ? "Quote ready" : "",
            query: component?.hooks?.[0] ?? null,
          }
        : {
          query: component?.hooks?.[0] ?? null,
          visibleCountText: verification.evidence.browser.dom.bodyText.match(/Showing \d+ incident[s]?/)?.[0] ?? "",
        };
    return {
      viewport,
      timingsMs: { sessionStartup: sessionStartupMs, verification: elapsed(startedAt), total: elapsed(startedAt) },
      passed: verification.passed,
      checks: verification.checks,
      observation,
      consoleErrorCount: verification.evidence.browser.console.filter((entry) => entry.level === "error" || entry.level === "pageerror").length,
      networkCount: verification.evidence.browser.network.length,
      screenshotPath: verification.evidence.browser.screenshotPath,
      replayFrames: verification.evidence.replay.frames.length,
      react: react
        ? {
            detected: react.detected,
            commitCount: react.commitCount,
            component: component
              ? { renderCount: component.renderCount, renderCause: component.renderCause, hookChanges: component.hookChanges, propChanges: component.propChanges }
              : null,
            flamegraphNodes: react.flamegraph.length,
          }
        : null,
      vite: verification.evidence.browser.vite
        ? { moduleCount: verification.evidence.browser.vite.moduleCount, hmrActive: verification.evidence.browser.vite.hmr.active }
        : null,
      warnings: verification.evidence.browser.warnings,
    };
  } finally {
    await manager.closeAll();
  }
}

async function evaluateRepairLayout(manager, sessionId) {
  const expression = `(() => {
    const layer = document.querySelector('[data-testid="incident-drawer-layer"]');
    const drawer = document.querySelector('[data-testid="incident-drawer"]');
    if (!layer || !drawer) return { available: false };
    const layerRect = layer.getBoundingClientRect();
    const drawerRect = drawer.getBoundingClientRect();
    return {
      available: true,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      layerTop: Number(layerRect.top.toFixed(2)),
      layerBottom: Number(layerRect.bottom.toFixed(2)),
      drawerTop: Number(drawerRect.top.toFixed(2)),
      drawerBottom: Number(drawerRect.bottom.toFixed(2)),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      coversViewport: layerRect.top <= 1 && layerRect.left <= 1 && layerRect.right >= window.innerWidth - 1 && layerRect.bottom >= window.innerHeight - 1,
      drawerInsideViewport: drawerRect.top >= -1 && drawerRect.left >= -1 && drawerRect.right <= window.innerWidth + 1 && drawerRect.bottom <= window.innerHeight + 1,
    };
  })()`;
  return (await manager.evaluate(sessionId, expression, false)).value;
}

async function readRepairObservation(page, definition) {
  if (definition.id === "visual-layout-fix") {
    return page.evaluate(() => {
      const layer = document.querySelector('[data-testid="incident-drawer-layer"]');
      const drawer = document.querySelector('[data-testid="incident-drawer"]');
      if (!layer || !drawer) return { available: false };
      const layerRect = layer.getBoundingClientRect();
      const drawerRect = drawer.getBoundingClientRect();
      return {
        available: true,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        layerTop: Number(layerRect.top.toFixed(2)),
        layerBottom: Number(layerRect.bottom.toFixed(2)),
        drawerTop: Number(drawerRect.top.toFixed(2)),
        drawerBottom: Number(drawerRect.bottom.toFixed(2)),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        coversViewport: layerRect.top <= 1 && layerRect.left <= 1 && layerRect.right >= window.innerWidth - 1 && layerRect.bottom >= window.innerHeight - 1,
        drawerInsideViewport: drawerRect.top >= -1 && drawerRect.left >= -1 && drawerRect.right <= window.innerWidth + 1 && drawerRect.bottom <= window.innerHeight + 1,
      };
    });
  }
  if (definition.id === "complex-async-fix") {
    return page.evaluate(() => ({
      quantity: document.querySelector('[aria-label="Quote quantity"]')?.value ?? "",
      quoteStatus: document.querySelector('[data-testid="quote-status"]')?.textContent?.trim() ?? "",
      quoteResult: document.querySelector('[data-testid="quote-result"]')?.textContent?.trim() ?? "",
    }));
  }
  return page.evaluate(() => ({
    query: document.querySelector('[aria-label="Search incidents"]')?.value ?? "",
    visibleCountText: document.querySelector('[data-testid="visible-count"]')?.textContent?.trim() ?? "",
    visibleRows: document.querySelectorAll('tbody tr[data-testid^="incident-row-"]').length,
  }));
}

function repairBugObserved(definition, views) {
  if (definition.id === "complex-logic-fix") return views[0]?.observation?.visibleRows !== 1 || views[0]?.observation?.visibleCountText !== "Showing 1 incident";
  if (definition.id === "complex-async-fix") return views[0]?.observation?.quoteResult.includes("Quote v1 applied");
  return views.some((view) => view.observation?.available && view.observation.coversViewport === false);
}

function repairMcpBugObserved(definition, views) {
  if (definition.id === "complex-logic-fix") return views.some((view) => view.checks.some((check) => check.kind === "textContains" && check.passed === false));
  if (definition.id === "complex-async-fix") return views.some((view) => view.checks.some((check) => check.kind === "textContains" && check.passed === false));
  return views.some((view) => view.observation?.available && view.observation.coversViewport === false);
}

function repairRootCauseEvidence(definition, views) {
  if (definition.id === "complex-logic-fix" || definition.id === "complex-async-fix") return views.some((view) => view.react?.component?.hookChanges?.length > 0 && view.react?.component?.renderCause === "state");
  return views.some((view) => view.observation?.available && view.observation.coversViewport === false);
}

function repairBaselineEvidence(definition, views, inspection) {
  return {
    coverage: {
      dom: true,
      console: true,
      network: views.some((view) => view.networkCount > 0),
      screenshot: views.every((view) => Boolean(view.screenshotPath)),
      debuggerSnapshot: false,
      replay: false,
      redactionPolicy: false,
      reactRuntime: false,
      renderCause: false,
      flamegraph: false,
      viteModuleGraph: false,
      layoutGeometry: definition.id === "visual-layout-fix",
      rootCauseCorrelation: false,
      fixVerification: false,
    },
    views: views.map((view) => ({
      viewport: view.viewport,
      observation: view.observation,
      consoleErrorCount: view.consoleErrorCount,
      networkCount: view.networkCount,
      screenshotPath: view.screenshotPath,
    })),
    sourceInspection: inspection,
    limitation: "The raw path observes the symptom and source marker but does not join runtime state, geometry, replay, and post-fix verification into one contract.",
  };
}

function repairMcpEvidence(definition, views, phase) {
  return {
    coverage: {
      dom: true,
      console: true,
      network: views.some((view) => view.networkCount > 0),
      screenshot: views.every((view) => Boolean(view.screenshotPath)),
      debuggerSnapshot: true,
      replay: views.every((view) => view.replayFrames > 0),
      redactionPolicy: true,
      reactRuntime: views.every((view) => view.react?.detected === true),
      renderCause: views.some((view) => Boolean(view.react?.component?.renderCause)),
      flamegraph: views.some((view) => (view.react?.flamegraphNodes ?? 0) > 0),
      viteModuleGraph: views.some((view) => (view.vite?.moduleCount ?? 0) > 0),
      layoutGeometry: definition.id === "visual-layout-fix" && views.every((view) => view.observation?.available === true),
      rootCauseCorrelation: phase === "before" && views.some((view) => Boolean(view.react?.component) || view.observation?.coversViewport === false),
      fixVerification: phase === "after" && views.every((view) => view.passed),
    },
    phase,
    views: views.map((view) => ({
      viewport: view.viewport,
      passed: view.passed,
      checks: view.checks,
      observation: view.observation,
      consoleErrorCount: view.consoleErrorCount,
      networkCount: view.networkCount,
      replayFrames: view.replayFrames,
      screenshotPath: view.screenshotPath,
      react: view.react,
      vite: view.vite,
      warnings: view.warnings,
    })),
  };
}

function compareRepair(definition, baselineRuns, mcpRuns) {
  const baselineCoverage = baselineRuns[0].evidence.coverage;
  const mcpDiagnosisCoverage = mcpRuns[0].diagnosis.evidence.coverage;
  const addedEvidence = Object.keys(mcpDiagnosisCoverage).filter((key) => mcpDiagnosisCoverage[key] && !baselineCoverage[key]);
  const baselineTotal = median(baselineRuns.map((run) => run.timingsMs.total));
  const mcpDiagnosisTotal = median(mcpRuns.map((run) => run.diagnosis.timingsMs.total));
  const fixedViews = mcpRuns.flatMap((run) => run.fix.evidence.views);
  const beforeViews = mcpRuns.flatMap((run) => run.diagnosis.evidence.views);
  return {
    baselineCoverageCount: Object.values(baselineCoverage).filter(Boolean).length,
    mcpCoverageCount: Object.values(mcpDiagnosisCoverage).filter(Boolean).length,
    addedEvidence,
    bugReproduced: baselineRuns.every((run) => run.bugReproduced) && mcpRuns.every((run) => run.diagnosis.bugObserved),
    rootCauseEvidence: mcpRuns.every((run) => run.diagnosis.rootCauseEvidence),
    fixVerified: mcpRuns.every((run) => run.fix.passed),
    medianDiagnosisDeltaMs: round(mcpDiagnosisTotal - baselineTotal),
    medianDiagnosisRatio: baselineTotal > 0 ? round(mcpDiagnosisTotal / baselineTotal, 2) : null,
    visual: definition.id === "visual-layout-fix"
      ? {
          desktopBeforeBroken: beforeViews.some((view) => view.viewport.label === "desktop" && view.observation?.coversViewport === false),
          mobileBeforeBroken: beforeViews.some((view) => view.viewport.label === "mobile" && view.observation?.coversViewport === false),
          desktopAfterCovered: fixedViews.some((view) => view.viewport.label === "desktop" && view.observation?.coversViewport === true),
          mobileAfterContained: fixedViews.some((view) => view.viewport.label === "mobile" && view.observation?.coversViewport === true && view.observation?.drawerInsideViewport === true),
        }
      : null,
    interpretation: "A positive diagnosis delta is the cost of structured evidence in this scripted run. The repair result is measured separately through root-cause evidence and fixed-flow verification.",
  };
}

function replaceExact(source, from, to, file) {
  const occurrences = source.split(from).length - 1;
  if (occurrences !== 1) throw new Error(`Repair marker must occur exactly once in ${file}; found ${occurrences}.`);
  return source.replace(from, to);
}

async function runBaseline(definition, url, actionId, artifactDir, runIndex) {
  const startedAt = performance.now();
  const browserStartedAt = performance.now();
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1_440, height: 900 } });
  const page = await context.newPage();
  const observed = installRawObservers(page);
  const browserStartupMs = elapsed(browserStartedAt);

  try {
    const flowStartedAt = performance.now();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await performRawActions(page, definition.actions);
    const flowMs = elapsed(flowStartedAt);

    const inspectionStartedAt = performance.now();
    const inspection = await definition.baselineInspect({ projectRoot: definition.projectRoot, actionId });
    const inspectionMs = elapsed(inspectionStartedAt);

    const captureStartedAt = performance.now();
    const snapshot = await readRawSnapshot(page);
    const screenshotPath = join(artifactDir, `${definition.id}-baseline-${runIndex + 1}.png`);
    await page.screenshot({ path: screenshotPath });
    const captureMs = elapsed(captureStartedAt);
    let postFlowMs = 0;
    if (definition.postActions) {
      const postStartedAt = performance.now();
      await performRawActions(page, definition.postActions);
      await readRawSnapshot(page);
      postFlowMs = elapsed(postStartedAt);
    }

    const consoleEntries = observed.console.concat(observed.pageErrors);
    const network = observed.network;
    const bodyContainsExpected = snapshot.bodyText.includes(expectedText(definition));
    const consoleErrors = consoleEntries.filter((entry) => entry.level === "error" || entry.level === "pageerror");

    return {
      timingsMs: {
        browserStartup: browserStartupMs,
        flow: flowMs,
        inspection: inspectionMs,
        capture: captureMs,
        postFlow: postFlowMs,
        total: elapsed(startedAt),
      },
      passed: bodyContainsExpected,
      checks: {
        expectedText: bodyContainsExpected,
        consoleErrors: consoleErrors.length,
      },
      evidence: baselineEvidence(definition, snapshot, consoleEntries, network, inspection, screenshotPath),
      networkSample: network.slice(-5),
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function runMcp(definition, url, actionId) {
  const startedAt = performance.now();
  const manager = new SessionManager();
  let session = null;

  try {
    const detectionStartedAt = performance.now();
    const project = manager.detect(definition.projectRoot);
    const projectDetectionMs = elapsed(detectionStartedAt);
    const sessionStartedAt = performance.now();
    session = await manager.start({
      projectRoot: definition.projectRoot,
      url,
      executablePath: browserPath,
      headless: true,
    });
    const sessionMs = elapsed(sessionStartedAt);

    const inspectionStartedAt = performance.now();
    const inspections = {};
    if (definition.id === "next-server-action") {
      inspections.route = await manager.inspectNext(session.id, { kind: "compileRoute", routeSpecifier: "/" });
      inspections.serverAction = await manager.inspectNext(session.id, { kind: "resolveServerAction", actionId });
    }
    const inspectionMs = elapsed(inspectionStartedAt);

    const verifyStartedAt = performance.now();
    const scenario = manager.recordScenario({
      name: definition.title,
      url,
      actions: definition.actions,
      checks: definition.checks,
    });
    const verification = await manager.verifyScenario(session.id, scenario.id);
    const verifyMs = elapsed(verifyStartedAt);

    let postFlow = null;
    if (definition.postActions) {
      const postStartedAt = performance.now();
      for (const action of definition.postActions) await manager.act(session.id, action);
      postFlow = await manager.capture(session.id, false);
      postFlow = { evidence: postFlow, elapsedMs: elapsed(postStartedAt) };
    }

    const evidence = postFlow?.evidence ?? verification.evidence;
    return {
      timingsMs: {
        projectDetection: projectDetectionMs,
        sessionStartup: sessionMs,
        frameworkInspection: inspectionMs,
        flowAndCapture: verifyMs,
        postFlow: postFlow?.elapsedMs ?? 0,
        total: elapsed(startedAt),
      },
      passed: verification.passed,
      checks: verification.checks,
      evidence: mcpEvidence(definition, verification, evidence, postFlow?.evidence ?? null),
      inspections: Object.keys(inspections).length > 0 ? inspections : undefined,
      capabilities: project.capabilities,
      target: session.target,
    };
  } finally {
    await manager.closeAll();
  }
}

function baselineEvidence(definition, snapshot, consoleEntries, network, inspection, screenshotPath) {
  const consoleErrors = consoleEntries.filter((entry) => entry.level === "error" || entry.level === "pageerror");
  const nextActionRequests = network.filter((entry) => entry.nextActionId);
  const coverage = {
    dom: true,
    console: true,
    network: true,
    screenshot: Boolean(screenshotPath),
    debuggerSnapshot: false,
    replay: false,
    redactionPolicy: false,
    reactRuntime: false,
    renderCause: false,
    flamegraph: false,
    viteModuleGraph: false,
    nextRuntime: false,
    serverActionResolution: false,
    serverActionTraceLinkage: false,
  };

  return {
    coverage,
    bodyText: snapshot.bodyText.slice(0, 500),
    consoleErrorCount: consoleErrors.length,
    networkCount: network.length,
    nextActionRequestCount: nextActionRequests.length,
    sourceOrServerInspection: inspection,
    screenshotPath,
    limitation: "Runtime framework state and cross-surface correlation require separate manual tools or source/log correlation.",
  };
}

function mcpEvidence(definition, verification, evidence, actionEvidence) {
  const initialEvidence = verification.evidence;
  const react = definition.id === "react-render-cause" ? (evidence.browser.react ?? initialEvidence.browser.react) : null;
  const vite = definition.id === "react-render-cause" ? (evidence.browser.vite ?? initialEvidence.browser.vite) : null;
  const nextRuntime = definition.id === "next-server-action" ? (actionEvidence?.browser.next ?? evidence.browser.next) : null;
  const reactComponent = findComponent(react?.components ?? [], "CheckoutForm");
  const next = nextRuntime;
  const actionExecution = next?.serverActionExecutions?.find((execution) => execution.request?.method === "POST") ?? null;
  const coverage = {
    dom: Boolean(evidence.browser.dom),
    console: Array.isArray(evidence.browser.console),
    network: Array.isArray(evidence.browser.network),
    screenshot: Boolean(evidence.browser.screenshotPath ?? initialEvidence.browser.screenshotPath),
    debuggerSnapshot: Boolean(evidence.browser.debugger ?? initialEvidence.browser.debugger),
    replay: initialEvidence.replay.frames.length > 0,
    redactionPolicy: initialEvidence.redaction.applied === true,
    reactRuntime: Boolean(react?.detected),
    renderCause: Boolean(reactComponent?.renderCause),
    flamegraph: (react?.flamegraph?.length ?? 0) > 0,
    viteModuleGraph: (vite?.moduleCount ?? 0) > 0,
    nextRuntime: Boolean(next?.detected),
    serverActionResolution: Boolean(actionExecution?.resolution),
    serverActionTraceLinkage: Boolean(actionExecution?.trace?.spans?.length),
  };

  return {
    coverage,
    bodyText: evidence.browser.dom.bodyText.slice(0, 500),
    consoleErrorCount: evidence.browser.console.filter((entry) => entry.level === "error" || entry.level === "pageerror").length,
    networkCount: evidence.browser.network.length,
    replayFrames: initialEvidence.replay.frames.length,
    replayInputSanitized: replayInputSanitized(initialEvidence.replay.frames),
    warnings: [...new Set([...initialEvidence.browser.warnings, ...evidence.browser.warnings])],
    react: react
      ? {
          commitCount: react.commitCount,
          component: reactComponent
            ? {
                renderCount: reactComponent.renderCount,
                renderCause: reactComponent.renderCause,
                hookChanges: reactComponent.hookChanges,
                treeDurationMs: reactComponent.treeDurationMs,
              }
            : null,
          flamegraphNodes: react.flamegraph.length,
        }
      : null,
    vite: vite
      ? {
          moduleCount: vite.moduleCount,
          hmrActive: vite.hmr.active,
          appModulePresent: vite.modules.some((module) => module.url.includes("/src/App.jsx")),
        }
      : null,
    next: next
      ? {
          routesPresent: Boolean(next.routes),
          logTailPresent: Boolean(next.logTail),
          requestInsightsPresent: Boolean(next.requestInsights),
          requestTraceCount: next.requestTraces.length,
          serverActionExecution: actionExecution
            ? {
                actionId: actionExecution.actionId,
                resolved: Boolean(actionExecution.resolution),
                traceSpanCount: actionExecution.trace?.spans?.length ?? 0,
              }
            : null,
        }
      : null,
    verification: {
      passed: verification.passed,
      checks: verification.checks,
    },
  };
}

function compareEvidence(baselineRuns, mcpRuns) {
  const baselineCoverage = baselineRuns[0].evidence.coverage;
  const mcpCoverage = mcpRuns[0].evidence.coverage;
  const addedEvidence = Object.keys(mcpCoverage).filter((key) => mcpCoverage[key] && !baselineCoverage[key]);
  const baselineTotal = median(baselineRuns.map((run) => run.timingsMs.total));
  const mcpTotal = median(mcpRuns.map((run) => run.timingsMs.total));
  return {
    medianTotalDeltaMs: round(mcpTotal - baselineTotal),
    medianTotalRatio: baselineTotal > 0 ? round(mcpTotal / baselineTotal, 2) : null,
    baselineCoverageCount: Object.values(baselineCoverage).filter(Boolean).length,
    mcpCoverageCount: Object.values(mcpCoverage).filter(Boolean).length,
    addedEvidence,
    interpretation: "A positive timing delta measures the MCP workflow overhead in this scripted run; the main gain is structured, repeatable cross-surface evidence.",
  };
}

function summarizeRuns(runs) {
  const keys = Object.keys(runs[0].timingsMs);
  return Object.fromEntries(keys.map((key) => {
    const values = runs.map((run) => run.timingsMs[key]);
    return [key, { median: round(median(values)), p90: round(percentile(values, 0.9)), min: round(Math.min(...values)), max: round(Math.max(...values)) }];
  }));
}

function renderMarkdown(report) {
  const lines = [
    "# web-debug-mcp comparison demo",
    "",
    `Local headless run with ${report.runs} repetition(s). Browser startup is separated from diagnostic work.`,
    "",
    "| Scenario | Baseline diagnosis | MCP diagnosis | MCP fix/verify | MCP − baseline | Evidence baseline → MCP | Added MCP evidence |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  for (const result of report.results) {
    const baseline = result.type === "repair" ? result.baseline.summary.diagnosis.total.median : result.baseline.summary.total.median;
    const mcp = result.type === "repair" ? result.mcp.summary.diagnosis.total.median : result.mcp.summary.total.median;
    const fix = result.type === "repair" ? result.mcp.summary.fixVerification.total.median : null;
    lines.push(`| ${result.title} | ${formatMs(baseline)} | ${formatMs(mcp)} | ${fix === null ? "—" : formatMs(fix)} | ${formatSignedMs(mcp - baseline)} | ${result.comparison.baselineCoverageCount} → ${result.comparison.mcpCoverageCount} | ${result.comparison.addedEvidence.join(", ")} |`);
  }

  lines.push("", "## Details", "");
  for (const result of report.results) {
    lines.push(`### ${result.title}`, "", result.description, "");
    lines.push(`- Baseline method: ${result.baseline.method}; surfaces: ${result.baseline.surfaces.join(", ")}.`);
    lines.push(`- MCP highlights: ${result.mcp.highlights.join(", ")}.`);
    if (result.type === "repair") {
      lines.push(`- Bug reproduced before the fix: ${result.comparison.bugReproduced ? "yes" : "no"}; root-cause evidence: ${result.comparison.rootCauseEvidence ? "yes" : "no"}; fixed verification: ${result.comparison.fixVerified ? "passed" : "failed"}.`);
      if (result.comparison.visual) {
        lines.push(`- Visual geometry: desktop before broken=${result.comparison.visual.desktopBeforeBroken}, mobile before broken=${result.comparison.visual.mobileBeforeBroken}, desktop after covered=${result.comparison.visual.desktopAfterCovered}, mobile after contained=${result.comparison.visual.mobileAfterContained}.`);
      }
      lines.push(`- Baseline diagnosis timing: ${formatTimingSummary(result.baseline.summary.diagnosis)}.`);
      lines.push(`- MCP diagnosis timing: ${formatTimingSummary(result.mcp.summary.diagnosis)}.`);
      lines.push(`- MCP fix/verify timing: ${formatTimingSummary(result.mcp.summary.fixVerification)}.`);
    } else {
      lines.push(`- Baseline timing: ${formatTimingSummary(result.baseline.summary)}.`);
      lines.push(`- MCP timing: ${formatTimingSummary(result.mcp.summary)}.`);
    }
    lines.push(`- Interpretation: ${result.comparison.interpretation}`);
    lines.push("");
  }

  lines.push("## Notes", "", ...report.notes.map((note) => `- ${note}`), "", `Artifacts: ${report.artifactDir}`);
  return lines.join("\n");
}

function formatTimingSummary(summary) {
  return Object.entries(summary)
    .map(([key, value]) => `${key} median ${formatMs(value.median)} / p90 ${formatMs(value.p90)}`)
    .join(", ");
}

function installRawObservers(page) {
  const consoleEntries = [];
  const pageErrors = [];
  const network = [];
  const requestEntries = new WeakMap();

  page.on("console", (message) => {
    const entry = { level: normalizeConsoleLevel(message.type()), text: message.text().slice(0, 2_000) };
    consoleEntries.push(entry);
  });
  page.on("pageerror", (error) => {
    pageErrors.push({ level: "pageerror", text: error.message.slice(0, 2_000) });
  });
  page.on("request", (request) => {
    const headers = request.headers();
    const entry = {
      requestId: `${network.length + 1}`,
      method: request.method(),
      url: displayUrl(request.url()),
      resourceType: request.resourceType(),
      status: null,
      nextActionId: headers["next-action"],
    };
    requestEntries.set(request, entry);
    network.push(entry);
  });
  page.on("response", (response) => {
    const entry = requestEntries.get(response.request());
    if (entry) entry.status = response.status();
  });

  return { console: consoleEntries, pageErrors, network };
}

async function readRawSnapshot(page) {
  return page.evaluate(() => ({
    bodyText: document.body?.innerText ?? "",
    elements: Array.from(document.querySelectorAll("body *")).slice(0, 50).map((element) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      role: element.getAttribute("role"),
      text: (element.textContent ?? "").trim().slice(0, 300),
    })),
  }));
}

async function performRawActions(page, actions) {
  for (const action of actions ?? []) {
    if (action.kind === "click") await page.locator(action.selector).click();
    if (action.kind === "fill") await page.locator(action.selector).fill(action.value);
    if (action.kind === "navigate") await page.goto(action.url, { waitUntil: "domcontentloaded" });
    if (action.kind === "reload") await page.reload({ waitUntil: "domcontentloaded" });
    if (action.kind === "wait") {
      if (action.text) {
        await page.waitForFunction(
          ({ selector, text }) => (document.querySelector(selector ?? "body")?.textContent ?? "").includes(text),
          { selector: action.selector, text: action.text },
          { timeout: action.timeoutMs ?? 1_000 },
        );
      } else if (action.selector) {
        await page.locator(action.selector).waitFor({ state: "visible", timeout: action.timeoutMs ?? 1_000 });
      } else if (action.timeoutMs) {
        await page.waitForTimeout(action.timeoutMs);
      }
    }
  }
}

async function waitForUrl(url, child) {
  const deadline = Date.now() + 30_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Fixture server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Fixture did not become ready: ${lastError}`);
}

async function waitForServerActionId(projectRoot, child) {
  const manifestPath = join(projectRoot, ".next", "dev", "server", "server-reference-manifest.json");
  const deadline = Date.now() + 30_000;
  let lastError = "manifest not ready";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next fixture exited with code ${child.exitCode}.`);
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const actionId = Object.keys(manifest.node ?? {})[0] ?? Object.keys(manifest.edge ?? {})[0];
      if (actionId) return actionId;
      lastError = "server-reference-manifest.json contains no action IDs";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Next Server Action manifest did not become ready: ${lastError}`);
}

function collectProcessOutput(child) {
  let output = "";
  const append = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-4_000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  return { text: () => output };
}

async function stopProcess(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

function parseOptions(args) {
  const scenarioArg = args.find((arg) => arg.startsWith("--scenario="));
  const runsArg = args.find((arg) => arg.startsWith("--runs="));
  const runs = Number(runsArg?.slice("--runs=".length) ?? defaultRuns);
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error("--runs must be an integer between 1 and 10.");
  return {
    scenario: scenarioArg?.slice("--scenario=".length) ?? "all",
    runs,
    json: args.includes("--json"),
  };
}

function expectedText(definition) {
  return definition.id === "vanilla-validation"
    ? "Invalid amount"
    : definition.id === "react-render-cause"
      ? "Payment submitted: 249.90"
      : "Healthy";
}

function mcpWorkflow(definition) {
  return [
    "web_project_detect",
    "web_session_start",
    "web_repro_record",
    "web_fix_verify",
    ...(definition.postActions ? ["web_browser_action", "web_issue_capture"] : []),
    "web_session_close",
  ];
}

function findComponent(nodes, name) {
  for (const node of nodes) {
    if (node.name === name) return node;
    const child = findComponent(node.children ?? [], name);
    if (child) return child;
  }
  return null;
}

function replayInputSanitized(frames) {
  const fillFrames = frames.filter((frame) => frame.action?.kind === "fill");
  if (fillFrames.length === 0) return null;
  return fillFrames.every((frame) => frame.action.value === "[REDACTED_REPLAY_INPUT]");
}

function normalizeConsoleLevel(type) {
  return type === "warning" ? "warning" : ["log", "info", "debug", "error"].includes(type) ? type : "log";
}

function displayUrl(value) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.startsWith("/@fs/") ? "/@fs/[LOCAL_PATH]" : url.pathname;
    return `${url.origin}${pathname}`;
  } catch {
    return "[UNAVAILABLE_URL]";
  }
}

function formatMs(value) {
  return `${Math.round(value)} ms`;
}

function formatSignedMs(value) {
  return `${value >= 0 ? "+" : ""}${formatMs(value)}`;
}

function elapsed(startedAt) {
  return round(performance.now() - startedAt);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.max(0, index)];
}

main().catch((error) => {
  process.stderr.write(`demo:compare failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
