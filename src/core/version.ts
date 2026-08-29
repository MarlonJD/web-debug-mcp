import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface PackageMetadata {
  name?: unknown;
  version?: unknown;
}

const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
const metadata = JSON.parse(readFileSync(packagePath, "utf8")) as PackageMetadata;

if (metadata.name !== "web-debug-mcp" || typeof metadata.version !== "string" || metadata.version.length === 0) {
  throw new Error("web-debug-mcp package metadata is missing a valid name or version.");
}

export const PACKAGE_NAME = metadata.name;
export const PACKAGE_VERSION = metadata.version;
