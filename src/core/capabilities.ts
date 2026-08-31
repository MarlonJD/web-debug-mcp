import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { WebDebugError } from "./errors.js";
import type {
  DetectionConfidence,
  DetectionSignal,
  Framework,
  FrameworkDetection,
  ProjectCapabilities,
  ProjectDescriptor,
  WorkspaceCandidate,
  WorkspaceDiscovery,
} from "../domain/types.js";

const CONFIG_MARKERS = [
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "vite.config.mts",
  "angular.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "next.config.mts",
] as const;
const FRAMEWORK_ORDER: Framework[] = ["next", "angular", "vite", "react", "vue", "vanilla"];
const MAX_WORKSPACE_PATTERNS = 32;
const MAX_WORKSPACE_CHILDREN_PER_PATTERN = 64;
const MAX_WORKSPACE_CANDIDATES = 32;

type PackageJson = Record<string, unknown> & {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
  scripts?: Record<string, unknown>;
  workspaces?: unknown;
};

export function detectProject(projectRoot: string): ProjectDescriptor {
  const root = resolve(projectRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new WebDebugError("PROJECT_ROOT_INVALID", `Project root is not a directory: ${root}`);
  }
  return detectCanonicalRoot(realpathSync(root), true);
}

function detectCanonicalRoot(canonicalRoot: string, discoverWorkspaces: boolean): ProjectDescriptor {
  const packageJson = readPackageJson(canonicalRoot);
  const configMarkers = CONFIG_MARKERS.filter((marker) => existsSync(join(canonicalRoot, marker)));
  const hasIndex = existsSync(join(canonicalRoot, "index.html"));
  const hasNextEntry = ["app", "pages", "src/app", "src/pages"].some((marker) => existsSync(join(canonicalRoot, marker)));
  const hasConfig = (prefix: string) => configMarkers.some((marker) => marker.startsWith(prefix));
  const hasRuntimeDependency = (name: string) => Boolean(packageJson?.dependencies && Object.hasOwn(packageJson.dependencies, name));
  const scriptIncludes = (token: string) => Object.values(packageJson?.scripts ?? {}).some((value) => typeof value === "string" && commandIncludes(value, token));
  const confirmedNextEntry = hasNextEntry && (hasConfig("next.config.") || hasRuntimeDependency("next"));
  const markers = [...configMarkers, ...(hasIndex ? ["index.html"] : []), ...(confirmedNextEntry ? ["next-entry"] : [])];
  const signals = frameworkSignals(packageJson, configMarkers, hasIndex, confirmedNextEntry);

  const selected = new Set<Framework>();
  const nextSelected = hasConfig("next.config.") || (hasRuntimeDependency("next") && (hasNextEntry || scriptIncludes("next")));
  const angularSelected = configMarkers.includes("angular.json");
  const viteSelected = hasConfig("vite.config.") || (scriptIncludes("vite") && hasIndex);
  if (nextSelected) selected.add("next");
  if (angularSelected) selected.add("angular");
  if (viteSelected) selected.add("vite");
  if ((hasRuntimeDependency("react") || hasRuntimeDependency("react-dom")) && (nextSelected || viteSelected || hasIndex)) selected.add("react");
  if (hasRuntimeDependency("vue") && (viteSelected || hasIndex)) selected.add("vue");
  if (selected.size === 0 && hasIndex) selected.add("vanilla");

  const ambiguous = hasIncompatibleSelection(selected);
  const frameworks = ambiguous ? [] : FRAMEWORK_ORDER.filter((framework) => selected.has(framework));
  const frameworkDetections = FRAMEWORK_ORDER.flatMap((framework): FrameworkDetection[] => {
    const provenance = signals.get(framework) ?? [];
    if (provenance.length === 0) return [];
    return [{
      framework,
      confidence: selected.has(framework) ? "high" : signalConfidence(provenance),
      selected: !ambiguous && selected.has(framework),
      provenance: provenance.slice(0, 8),
    }];
  });
  const confidence = overallConfidence(frameworks, frameworkDetections);
  const workspace = discoverWorkspaces ? discoverWorkspaceCandidates(canonicalRoot, packageJson) : emptyWorkspace(false);
  const browserTarget = frameworks.length > 0;
  const projectCapabilities: ProjectCapabilities = {
    browserTarget,
    react: frameworks.includes("react"),
    angular: frameworks.includes("angular"),
    vue: frameworks.includes("vue"),
    vite: frameworks.includes("vite"),
    next: frameworks.includes("next"),
    serverRuntime: frameworks.includes("next"),
  };
  const hasApplicationEvidence = hasIndex || confirmedNextEntry || configMarkers.length > 0;
  const kind: ProjectDescriptor["kind"] = browserTarget || hasApplicationEvidence
    ? "application"
    : workspace.declared
      ? "workspace"
      : packageJson
        ? "library"
        : "unknown";

  const warnings: string[] = [];
  if (!packageJson) warnings.push("No package.json found; framework-specific adapters cannot be inferred.");
  if (ambiguous) warnings.push("Incompatible application framework signals were detected; no framework-specific runtime was selected.");
  if (frameworkDetections.some((detection) => !detection.selected && detection.confidence !== "high")) warnings.push("Uncorroborated dependency signals were retained as candidates and did not select framework adapters.");
  if (!browserTarget) warnings.push("No confirmed application entry or supported framework configuration was found at this exact project root.");
  if (workspace.candidates.length > 0) warnings.push("Workspace application candidates are informational; pass one exact candidate projectRoot to select it.");
  if (projectCapabilities.next) warnings.push("Next.js runtime tools require a running compatible dev server.");
  if (projectCapabilities.react && !projectCapabilities.vite && !projectCapabilities.next) warnings.push("React was detected without a Vite or Next.js host; only generic browser capabilities are guaranteed.");
  if (projectCapabilities.angular) warnings.push("Angular runtime enrichment requires a Chromium development build; Angular CLI's internal Vite server does not expose Web Debug Vite provenance.");
  if (projectCapabilities.vue) warnings.push("Vue runtime enrichment requires a compatible Vue 3 Chromium development build.");

  return {
    schemaVersion: 2,
    projectRoot: canonicalRoot,
    packageManager: detectPackageManager(canonicalRoot),
    kind,
    frameworks,
    markers,
    confidence,
    ambiguous,
    frameworkDetections,
    workspace,
    projectCapabilities,
    warnings: warnings.slice(0, 20),
  };
}

function frameworkSignals(
  packageJson: PackageJson | null,
  configMarkers: readonly string[],
  hasIndex: boolean,
  hasNextEntry: boolean,
): Map<Framework, DetectionSignal[]> {
  const result = new Map<Framework, DetectionSignal[]>();
  const add = (framework: Framework, signal: DetectionSignal) => result.set(framework, [...(result.get(framework) ?? []), signal]);
  for (const marker of configMarkers) {
    if (marker.startsWith("next.config.")) add("next", { source: "config", value: marker });
    if (marker.startsWith("vite.config.")) add("vite", { source: "config", value: marker });
    if (marker === "angular.json") add("angular", { source: "config", value: marker });
  }
  if (hasIndex) add("vanilla", { source: "entry", value: "index.html" });
  if (hasNextEntry) add("next", { source: "entry", value: "app|pages" });

  const packageFrameworks: Record<string, Framework[]> = {
    next: ["next"],
    react: ["react"],
    "react-dom": ["react"],
    "react-native": ["react"],
    "@angular/core": ["angular"],
    vue: ["vue"],
    vite: ["vite"],
  };
  for (const [section, source] of [
    [packageJson?.dependencies, "dependency"],
    [packageJson?.devDependencies, "devDependency"],
    [packageJson?.peerDependencies, "peerDependency"],
  ] as const) {
    for (const name of Object.keys(section ?? {})) {
      for (const framework of packageFrameworks[name] ?? []) add(framework, { source, value: name.slice(0, 200) });
    }
  }
  for (const [name, command] of Object.entries(packageJson?.scripts ?? {})) {
    if (typeof command !== "string") continue;
    if (commandIncludes(command, "next")) add("next", { source: "script", value: name.slice(0, 100) });
    if (commandIncludes(command, "vite")) add("vite", { source: "script", value: name.slice(0, 100) });
    if (commandIncludes(command, "ng")) add("angular", { source: "script", value: name.slice(0, 100) });
  }
  return result;
}

function commandIncludes(command: string, executable: string): boolean {
  return command.split(/&&|;|\|\|?|\n/).some((segment) => {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    let index = 0;
    while (tokens[index] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]!)) index += 1;
    if (tokens[index] === "cross-env") {
      index += 1;
      while (tokens[index] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]!)) index += 1;
    }
    if (tokens[index] === "npx" || tokens[index] === "bunx") index += 1;
    else if (["npm", "pnpm", "yarn"].includes(tokens[index] ?? "") && tokens[index + 1] === "exec") index += 2;
    const commandToken = tokens[index];
    return commandToken === executable || commandToken?.endsWith(`/${executable}`) === true;
  });
}

function signalConfidence(signals: DetectionSignal[]): Exclude<DetectionConfidence, "none"> {
  if (signals.some((signal) => signal.source === "config" || signal.source === "entry")) return "high";
  if (signals.some((signal) => signal.source === "dependency" || signal.source === "script")) return "medium";
  return "low";
}

function overallConfidence(frameworks: Framework[], detections: FrameworkDetection[]): DetectionConfidence {
  if (frameworks.length > 0) return "high";
  if (detections.some((detection) => detection.confidence === "high")) return "high";
  if (detections.some((detection) => detection.confidence === "medium")) return "medium";
  if (detections.length > 0) return "low";
  return "none";
}

function hasIncompatibleSelection(selected: Set<Framework>): boolean {
  if (selected.has("angular") && selected.size > 1) return true;
  if (selected.has("next") && [...selected].some((framework) => ["angular", "vue", "vite"].includes(framework))) return true;
  return selected.has("react") && selected.has("vue");
}

function discoverWorkspaceCandidates(root: string, packageJson: PackageJson | null): WorkspaceDiscovery {
  const patterns = workspacePatterns(packageJson?.workspaces);
  if (!patterns) return emptyWorkspace(false);
  const candidates: WorkspaceCandidate[] = [];
  const unsupportedPatterns: string[] = [];
  const seen = new Set<string>();
  let truncated = patterns.length > MAX_WORKSPACE_PATTERNS;
  for (const rawPattern of patterns.slice(0, MAX_WORKSPACE_PATTERNS)) {
    const pattern = rawPattern.trim();
    if (!isSupportedWorkspacePattern(pattern)) {
      unsupportedPatterns.push(pattern.slice(0, 300));
      continue;
    }
    const paths = expandWorkspacePattern(root, pattern);
    if (paths.truncated) truncated = true;
    for (const candidateRoot of paths.roots) {
      if (candidates.length >= MAX_WORKSPACE_CANDIDATES) { truncated = true; break; }
      if (seen.has(candidateRoot)) continue;
      seen.add(candidateRoot);
      const descriptor = detectCanonicalRoot(candidateRoot, false);
      if (descriptor.kind === "unknown") continue;
      candidates.push({
        projectRoot: candidateRoot,
        frameworks: descriptor.frameworks,
        confidence: descriptor.confidence,
        ambiguous: descriptor.ambiguous,
        markers: descriptor.markers.slice(0, 12),
      });
    }
  }
  return { declared: true, candidates, truncated, unsupportedPatterns: unsupportedPatterns.slice(0, 32) };
}

function workspacePatterns(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object" && Array.isArray((value as { packages?: unknown }).packages)) {
    return (value as { packages: unknown[] }).packages.filter((item): item is string => typeof item === "string");
  }
  return value === undefined ? null : [];
}

function isSupportedWorkspacePattern(pattern: string): boolean {
  if (!pattern || isAbsolute(pattern) || pattern.startsWith("!") || pattern.includes("..") || /[{}?[\]]/.test(pattern)) return false;
  const stars = [...pattern].filter((character) => character === "*").length;
  return stars === 0 || (stars === 1 && pattern.endsWith("/*"));
}

function expandWorkspacePattern(root: string, pattern: string): { roots: string[]; truncated: boolean } {
  if (!pattern.endsWith("/*")) {
    const candidate = containedDirectory(root, join(root, pattern));
    return { roots: candidate ? [candidate] : [], truncated: false };
  }
  const parent = containedDirectory(root, join(root, pattern.slice(0, -2)));
  if (!parent) return { roots: [], truncated: false };
  let entries: string[] = [];
  try { entries = readdirSync(parent).sort(); } catch { return { roots: [], truncated: false }; }
  const truncated = entries.length > MAX_WORKSPACE_CHILDREN_PER_PATTERN;
  return {
    roots: entries.slice(0, MAX_WORKSPACE_CHILDREN_PER_PATTERN).flatMap((entry) => {
      const candidate = containedDirectory(root, join(parent, entry));
      return candidate ? [candidate] : [];
    }),
    truncated,
  };
}

function containedDirectory(root: string, candidate: string): string | null {
  try {
    if (!existsSync(candidate) || !statSync(candidate).isDirectory()) return null;
    const canonical = realpathSync(candidate);
    const rel = relative(root, canonical);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
    return canonical;
  } catch {
    return null;
  }
}

function emptyWorkspace(declared: boolean): WorkspaceDiscovery {
  return { declared, candidates: [], truncated: false, unsupportedPatterns: [] };
}

function readPackageJson(root: string): PackageJson | null {
  const path = join(root, "package.json");
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" ? value as PackageJson : null;
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
