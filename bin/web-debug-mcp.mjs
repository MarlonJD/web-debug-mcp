#!/usr/bin/env node

import { startStdioServer } from "../dist/index.js";
import { cleanupRegistry } from "../dist/core/process-registry.js";
import { doctorArgumentFailure, parseDoctorArgs, runDoctor } from "../dist/core/doctor.js";

const args = process.argv.slice(2);
const help = `Usage:
  web-debug-mcp                         Start the MCP stdio server
  web-debug-mcp doctor [options]        Check source-next local readiness
  web-debug-mcp cleanup [--all-idle]    Clean identity-verified idle MCP processes
  web-debug-mcp --help                  Show this help

Doctor options:
  --project-root <path> --url <loopback-url> --browser <chromium|safari>
  --executable-path <path> | --cdp-endpoint <url> | --webdriver-endpoint <url>
`;

if (args[0] === "--help" || args[0] === "help" || args[0] === "doctor" && args[1] === "--help") {
  process.stdout.write(help);
} else if (args[0] === "doctor") {
  try {
    const report = await runDoctor(parseDoctorArgs(args.slice(1)));
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(doctorArgumentFailure(error))}\n`);
    process.exitCode = 2;
  }
} else if (args[0] === "cleanup") {
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
  process.stderr.write("web-debug-mcp accepts no arguments, doctor options, cleanup [--all-idle], or --help.\n");
  process.exitCode = 2;
}
