import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const nextBin = join(repositoryRoot, "node_modules/next/dist/bin/next");
const port = Number(process.env.WEB_DEBUG_NEXT_PORT ?? 4175);

if (!existsSync(nextBin)) throw new Error(`Next executable not found: ${nextBin}. Run npm install first.`);

const next = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: join(repositoryRoot, "fixtures/next"),
  stdio: "inherit",
  env: { ...process.env, WEB_DEBUG_NEXT_PORT: String(port) },
});

next.once("error", (error) => {
  process.stderr.write(`Next fixture error: ${error.message}\n`);
  process.exitCode = 1;
});
next.once("exit", (code, signal) => {
  if (signal) process.exitCode = 1;
  else if (code !== null) process.exitCode = code;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => next.kill(signal));
}
