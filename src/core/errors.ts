import { boundText, redactText } from "./redaction.js";

export class WebDebugError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "WebDebugError";
  }
}

export function errorMessage(error: unknown): string {
  return boundText(redactText(error instanceof Error ? error.message : String(error)), 500);
}
