import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { WebDebugError } from "./errors.js";
import type { Framework, ProjectCapabilities, ProjectDescriptor } from "../domain/types.js";

const CONFIG_MARKERS = [
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "vite.config.mts",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "next.config.mts",
];

export function detectProject(projectRoot: string): ProjectDescriptor {
  const root = resolve(projectRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new WebDebugError("PROJECT_ROOT_INVALID", `Project root is not a directory: ${root}`);
  }

  const canonicalRoot = realpathSync(root);
  const markers = CONFIG_MARKERS.filter((marker) => existsSync(join(canonicalRoot, marker)));
  const packageJson = readPackageJson(canonicalRoot);
  const dependencies = new Set([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {}),
    ...Object.keys(packageJson?.peerDependencies ?? {}),
  ]);

  const hasIndex = existsSync(join(canonicalRoot, "index.html"));
  const isNext = dependencies.has("next") || markers.some((marker) => marker.startsWith("next."));
  const isVite = dependencies.has("vite") || markers.some((marker) => marker.startsWith("vite."));
  const isReact = dependencies.has("react") || dependencies.has("react-dom") || dependencies.has("react-native");

  const frameworks: Framework[] = [];
  if (isNext) frameworks.push("next");
  if (isVite) frameworks.push("vite");
  if (isReact) frameworks.push("react");
  if (frameworks.length === 0 && hasIndex) frameworks.push("vanilla");

  const capabilities: ProjectCapabilities = {
    browser: hasIndex || frameworks.length > 0,
    javascriptDebugger: hasIndex || frameworks.length > 0,
    console: hasIndex || frameworks.length > 0,
    network: hasIndex || frameworks.length > 0,
    dom: hasIndex || frameworks.length > 0,
    screenshots: hasIndex || frameworks.length > 0,
    react: isReact,
    vite: isVite,
    next: isNext,
    serverRuntime: isNext,
  };

  const warnings: string[] = [];
  if (!packageJson) {
    warnings.push("No package.json found; framework-specific adapters cannot be inferred.");
  }
  if (!capabilities.browser) {
    warnings.push("No index.html or supported web framework marker found.");
  }
  if (isNext) {
    warnings.push("Next.js runtime tools require a running compatible dev server.");
  }
  if (isReact && !isVite && !isNext) {
    warnings.push("React was detected without a Vite or Next.js marker; only generic browser capabilities are guaranteed.");
  }

  return {
    projectRoot: canonicalRoot,
    packageManager: detectPackageManager(canonicalRoot),
    frameworks,
    markers,
    capabilities,
    warnings,
  };
}

function readPackageJson(root: string): Record<string, any> | null {
  const path = join(root, "package.json");
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" ? (value as Record<string, any>) : null;
  } catch {
    return null;
  }
}

function detectPackageManager(root: string): ProjectDescriptor["packageManager"] {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  return null;
}
