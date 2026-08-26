import type { ModuleNode, Plugin, ViteDevServer } from "vite";

interface LastHotUpdate {
  file: string;
  timestamp: number;
  moduleCount: number;
}

export function webDebugVitePlugin(): Plugin {
  let server: ViteDevServer | null = null;
  let lastUpdate: LastHotUpdate | null = null;

  return {
    name: "web-debug-mcp",
    apply: "serve",
    configureServer(viteServer) {
      server = viteServer;
      viteServer.middlewares.use("/__web_debug/vite", (_request, response) => {
        response.statusCode = 200;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.end(JSON.stringify(createSnapshot(server, lastUpdate)));
      });
    },
    handleHotUpdate(context) {
      lastUpdate = {
        file: context.file,
        timestamp: context.timestamp,
        moduleCount: context.modules.length,
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
