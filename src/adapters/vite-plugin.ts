import { isAbsolute, relative, resolve } from "node:path";

import type { ModuleNode, Plugin, ViteDevServer } from "vite";

import { boundText } from "../core/redaction.js";
import type { ViteTransformDiff } from "../domain/types.js";

const MAX_TRACKED_SOURCES = 200;
const MAX_SOURCE_CHARS = 32_000;
const MAX_PATCH_CHARS = 12_000;

interface LastHotUpdate {
  file: string;
  timestamp: number;
  moduleCount: number;
  transformDiff: ViteTransformDiff | null;
}

export interface ViteSourceSnapshot {
  code: string;
  truncated: boolean;
}

export function webDebugVitePlugin(): Plugin {
  let server: ViteDevServer | null = null;
  let lastUpdate: LastHotUpdate | null = null;
  const sourceCache = new Map<string, ViteSourceSnapshot>();

  return {
    name: "web-debug-mcp",
    apply: "serve",
    enforce: "post",
    configureServer(viteServer) {
      server = viteServer;
      viteServer.middlewares.use("/__web_debug/vite", (_request, response) => {
        response.statusCode = 200;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.end(JSON.stringify(createSnapshot(server, lastUpdate)));
      });
    },
    transform(code, id) {
      const file = normalizeId(id);
      if (file && isProjectFile(file, server)) {
        sourceCache.delete(file);
        sourceCache.set(file, snapshotSource(code));
        while (sourceCache.size > MAX_TRACKED_SOURCES) {
          const oldest = sourceCache.keys().next().value;
          if (oldest) sourceCache.delete(oldest);
          else break;
        }
      }
      return null;
    },
    async handleHotUpdate(context) {
      const file = normalizeId(context.file);
      const previous = file ? sourceCache.get(file) ?? null : null;
      let current: ViteSourceSnapshot | null = null;
      const changedModule = context.modules.find((module) => normalizeId(module.file ?? module.id ?? "") === file);
      if (changedModule?.url) {
        const transformed = await context.server.transformRequest(changedModule.url);
        if (transformed) current = snapshotSource(transformed.code);
      }
      if (!current) current = snapshotSource(await context.read());

      lastUpdate = {
        file: context.file,
        timestamp: context.timestamp,
        moduleCount: context.modules.length,
        transformDiff: previous && current ? createTransformDiff(previous, current) : null,
      };
    },
  };
}

function createSnapshot(server: ViteDevServer | null, lastUpdate: LastHotUpdate | null) {
  const modules = server ? [...server.moduleGraph.idToModuleMap.values()].slice(0, 200).map(summarizeModule) : [];
  return {
    detected: true,
    root: server?.config.root ?? "",
    moduleCount: modules.length,
    modules,
    hmr: { active: Boolean(server), lastUpdate },
    warnings: server ? [] : ["Vite server was not initialized."],
  };
}

export function createTransformDiff(previous: ViteSourceSnapshot, current: ViteSourceSnapshot): ViteTransformDiff {
  const before = previous.code.split(/\r?\n/);
  const after = current.code.split(/\r?\n/);
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;

  let beforeEnd = before.length - 1;
  let afterEnd = after.length - 1;
  while (beforeEnd >= start && afterEnd >= start && before[beforeEnd] === after[afterEnd]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const removedLines = Math.max(0, beforeEnd - start + 1);
  const addedLines = Math.max(0, afterEnd - start + 1);
  const patchLines = [
    `@@ -${start + 1},${removedLines} +${start + 1},${addedLines} @@`,
    ...before.slice(start, beforeEnd + 1).map((line) => `-${line}`),
    ...after.slice(start, afterEnd + 1).map((line) => `+${line}`),
  ];
  const rawPatch = patchLines.join("\n");
  return {
    patch: boundText(rawPatch, MAX_PATCH_CHARS),
    addedLines,
    removedLines,
    truncated: previous.truncated || current.truncated || rawPatch.length > MAX_PATCH_CHARS,
  };
}

function snapshotSource(code: string): ViteSourceSnapshot {
  return {
    code: code.slice(0, MAX_SOURCE_CHARS),
    truncated: code.length > MAX_SOURCE_CHARS,
  };
}

function normalizeId(id: string): string {
  return id.split("?")[0]?.replaceAll("\\", "/") ?? "";
}

function isProjectFile(file: string, viteServer: ViteDevServer | null): boolean {
  if (!viteServer || !file) return false;
  const root = resolve(viteServer.config.root);
  const relativePath = relative(root, file);
  return Boolean(relativePath) && !isAbsolute(relativePath) && !relativePath.startsWith("..");
}

function summarizeModule(module: ModuleNode) {
  return {
    id: module.id,
    url: module.url,
    file: module.file,
    type: module.type,
    importers: [...module.importers].map((item) => item.url).slice(0, 50),
    importedModules: [...module.importedModules].map((item) => item.url).slice(0, 50),
    acceptedHmrDeps: [...module.acceptedHmrDeps].map((item) => item.url).slice(0, 50),
    isSelfAccepting: module.isSelfAccepting ?? null,
    lastHMRTimestamp: module.lastHMRTimestamp,
  };
}
