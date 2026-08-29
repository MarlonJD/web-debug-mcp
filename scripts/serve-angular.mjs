import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = join(repositoryRoot, "fixtures/angular");
const angularBin = join(repositoryRoot, "node_modules/@angular/cli/bin/ng.js");
const port = Number(process.env.WEB_DEBUG_ANGULAR_PORT ?? 4177);

if (!existsSync(angularBin)) throw new Error(`Angular CLI executable not found: ${angularBin}. Run npm install first.`);

const angular = spawn(process.execPath, [angularBin, "serve", "web-debug-angular-fixture", "--configuration", "development", "--host", "127.0.0.1", "--port", String(port), "--no-open"], {
  cwd: fixtureRoot,
  stdio: "inherit",
  env: { ...process.env, NG_CLI_ANALYTICS: "false", WEB_DEBUG_ANGULAR_PORT: String(port) },
});

angular.once("error", (error) => {
  process.stderr.write(`Angular fixture error: ${error.message}\n`);
  process.exitCode = 1;
});
angular.once("exit", (code, signal) => {
  if (signal) process.exitCode = 1;
  else if (code !== null) process.exitCode = code;
});

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => angular.kill(signal));
