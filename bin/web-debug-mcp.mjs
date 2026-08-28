#!/usr/bin/env node

import { startStdioServer } from "../dist/index.js";
import { cleanupRegistry } from "../dist/core/process-registry.js";

const args = process.argv.slice(2);
if (args[0] === "cleanup") {
  if (args.some((arg) => !["cleanup", "--all-idle"].includes(arg))) {
    process.stderr.write("web-debug-mcp cleanup accepts only --all-idle.\n");
    process.exitCode = 2;
  } else {
    try {
      const report = await cleanupRegistry({ allIdle: args.includes("--all-idle") });
      process.stdout.write(`${JSON.stringify(report)}\n`);
      process.exitCode = report.failed > 0 ? 1 : 0;
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
} else if (args.length === 0) {
  await startStdioServer();
} else {
  process.stderr.write("web-debug-mcp accepts no arguments, or cleanup [--all-idle].\n");
  process.exitCode = 2;
}
