import type { ExecutionDiagnostics, SourceInventory, SourceReference } from "../domain/types.js";
import { boundText, redactValue } from "./redaction.js";
import { scrubText } from "./private-values.js";

/** Redact bounded typed leaves separately so the generic depth cap cannot replace range objects with strings. */
export function redactExecutionDiagnostics(value: ExecutionDiagnostics, secrets: string[] = []): ExecutionDiagnostics {
  const { coverage, ...window } = value;
  return scrubDiagnosticValue({
    ...redactValue(window) as Omit<ExecutionDiagnostics, "coverage">,
    coverage: {
      ...coverage,
      scripts: coverage.scripts.map(({ functions, ...script }) => ({
        ...redactValue(script) as Omit<typeof script, "functions">,
        functions: functions.map((fn) => redactValue(fn) as typeof fn),
      })),
    },
  }, secrets);
}

/** Only adapter-created diagnostics: host enums/opaque IDs are not page echoes. */
export function scrubDiagnosticValue<T extends ExecutionDiagnostics | SourceInventory | SourceReference>(value: T, secrets: string[]): T {
  const structural = new Set(["actionId", "startedAt", "scriptId", "requestId", "scope", "mapping", "state", "association", "cleanup"]);
  const limits: Record<string, number> = { url: 2560, sources: 2560, name: 150, reason: 500, warnings: 500, method: 20, initiatorType: 50 };
  function visit(item: unknown, key: string): unknown {
    if (typeof item === "string") {
      if (structural.has(key)) return item;
      const scrubbed = scrubText(item, secrets);
      if (key === "hash" || key === "scriptHash") return scrubbed === item ? item : null;
      return boundText(scrubbed, limits[key] ?? 500);
    }
    if (Array.isArray(item)) return item.map(child => visit(child, key));
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item).map(([field, child]) => [field, visit(child, field)]));
  }
  return visit(value, "") as T;
}
