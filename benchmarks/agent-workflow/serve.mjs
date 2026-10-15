import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, relative } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT);
if (!port || !["todo", "grid", "forms"].includes(process.env.BENCH_CASE)) throw new Error("Select a benchmark app and an exact loopback port.");
if (process.env.BENCH_CASE === "grid") {
  const { createServer: viteServer } = await import("vite");
  const plugins = [];
  if (process.env.BENCH_VITE_PLUGIN) {
    const { webDebugVitePlugin } = await import(process.env.BENCH_VITE_PLUGIN);
    plugins.push(webDebugVitePlugin());
  }
  const server = await viteServer({ configFile: resolve("vite.config.mjs"), plugins, server: { host: "127.0.0.1", port, strictPort: true } });
  await server.listen();
  process.on("SIGTERM", () => server.close().then(() => process.exit()));
  process.on("SIGINT", () => server.close().then(() => process.exit()));
} else if (process.env.BENCH_CASE === "forms") {
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, env: process.env, stdio: "inherit" });
  child.on("exit", code => { process.exitCode = code ?? 1; });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
} else {
  const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
  const server = createServer(async (request, response) => {
    try {
      const path = resolve(root, `.${decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname === "/" ? "/index.html" : new URL(request.url, `http://127.0.0.1:${port}`).pathname)}`);
      if (relative(root, path).startsWith("..")) throw new Error("Outside target.");
      const bytes = await readFile(path);
      response.setHeader("content-type", mime[extname(path)] ?? "application/octet-stream");
      response.setHeader("cache-control", "no-store");
      response.end(bytes);
    } catch { response.writeHead(404); response.end("missing"); }
  });
  await new Promise(resolveReady => server.listen(port, "127.0.0.1", resolveReady));
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit()));
}
