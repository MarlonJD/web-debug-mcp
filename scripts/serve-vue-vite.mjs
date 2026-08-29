import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const viteBin = join(repositoryRoot, "node_modules/vite/bin/vite.js");
const configPath = join(repositoryRoot, "fixtures/vue-vite/vite.config.ts");
const port = Number(process.env.WEB_DEBUG_VUE_VITE_PORT ?? 4176);

if (!existsSync(viteBin)) throw new Error(`Vite executable not found: ${viteBin}. Run npm install first.`);

const vite = spawn(process.execPath, [viteBin, "--config", configPath, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: repositoryRoot,
  stdio: "inherit",
  env: { ...process.env, WEB_DEBUG_VUE_VITE_PORT: String(port) },
});

vite.once("error", (error) => {
  process.stderr.write(`Vue/Vite fixture error: ${error.message}\n`);
  process.exitCode = 1;
});
vite.once("exit", (code, signal) => {
  if (signal) process.exitCode = 1;
  else if (code !== null) process.exitCode = code;
});

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => vite.kill(signal));
