import type { ExecutionDiagnostics } from "../domain/types.js";
import { redactValue } from "./redaction.js";

/** Redact bounded typed leaves separately so the generic depth cap cannot replace range objects with strings. */
export function redactExecutionDiagnostics(value: ExecutionDiagnostics): ExecutionDiagnostics {
  const { coverage, ...window } = value;
  return {
    ...redactValue(window) as Omit<ExecutionDiagnostics, "coverage">,
    coverage: {
      ...coverage,
      scripts: coverage.scripts.map(({ functions, ...script }) => ({
        ...redactValue(script) as Omit<typeof script, "functions">,
        functions: functions.map((fn) => redactValue(fn) as typeof fn),
      })),
    },
  };
}
