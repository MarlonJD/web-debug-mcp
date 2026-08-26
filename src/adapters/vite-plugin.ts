import { isAbsolute, relative, resolve } from "node:path";

import type { ModuleNode, Plugin, ViteDevServer } from "vite";

import { boundText } from "../core/redaction.js";
import type { ViteSourceMapSummary, ViteTransformDiff, ViteTransformSummary } from "../domain/types.js";

const MAX_TRACKED_SOURCES = 200;
const MAX_SOURCE_CHARS = 32_000;
const MAX_PATCH_CHARS = 12_000;

interface LastHotUpdate {
  file: string;
  timestamp: number;
  moduleCount: number;
  transformDiff: ViteTransformDiff | null;
  transformProvenance: {
    before: ViteTransformSummary | null;
    after: ViteTransformSummary | null;
  } | null;
}

export interface ViteSourceSnapshot {
  code: string;
  truncated: boolean;
  deps: string[];
  dynamicDeps: string[];
  sourceMap: unknown;
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
        try {
          const transformed = await context.server.transformRequest(changedModule.url);
          if (transformed) current = snapshotSource(transformed.code, transformed.map, transformed.deps, transformed.dynamicDeps);
        } catch {
          current = null;
        }
      }
      if (!current) current = snapshotSource(await context.read());

      lastUpdate = {
        file: context.file,
        timestamp: context.timestamp,
        moduleCount: context.modules.length,
        transformDiff: previous && current ? createTransformDiff(previous, current) : null,
        transformProvenance: {
          before: previous ? summarizeTransform(previous) : null,
          after: current ? summarizeTransform(current) : null,
        },
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

function snapshotSource(code: string, sourceMap: unknown = null, deps: string[] = [], dynamicDeps: string[] = []): ViteSourceSnapshot {
  return {
    code: code.slice(0, MAX_SOURCE_CHARS),
    truncated: code.length > MAX_SOURCE_CHARS,
    deps: deps.slice(0, 50),
    dynamicDeps: dynamicDeps.slice(0, 50),
    sourceMap,
  };
}

function summarizeTransform(source: ViteSourceSnapshot): ViteTransformSummary {
  return {
    codeLength: source.code.length,
    truncated: source.truncated,
    deps: source.deps,
    dynamicDeps: source.dynamicDeps,
    sourceMap: summarizeSourceMap(source.sourceMap),
  };
}

function summarizeSourceMap(sourceMap: unknown): ViteSourceMapSummary {
  if (!isRecord(sourceMap)) {
    return { present: false, sourceCount: 0, sources: [], namesCount: 0, mappingLength: 0, file: null };
  }
  const sources = Array.isArray(sourceMap.sources)
    ? sourceMap.sources.filter((source): source is string => typeof source === "string").slice(0, 50)
    : [];
  const namesCount = Array.isArray(sourceMap.names) ? sourceMap.names.length : 0;
  return {
    present: true,
    sourceCount: sources.length,
    sources,
    namesCount,
    mappingLength: typeof sourceMap.mappings === "string" ? sourceMap.mappings.length : 0,
    file: typeof sourceMap.file === "string" ? sourceMap.file.slice(0, 500) : null,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
    transform: module.transformResult
      ? summarizeTransform(snapshotSource(module.transformResult.code, module.transformResult.map, module.transformResult.deps, module.transformResult.dynamicDeps))
      : null,
  };
}
