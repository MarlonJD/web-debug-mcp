import { WebDebugError } from "./errors.js";

export function originOf(rawUrl: string): string {
  if (rawUrl.length > 2_048) throw new WebDebugError("URL_LIMIT_EXCEEDED", "Browser URLs are limited to 2,048 characters.");
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
    return parsed.origin;
  } catch {
    throw new WebDebugError("TARGET_URL_INVALID", "The browser target must use a valid HTTP or HTTPS URL.");
  }
}

export function assertTopLevelOrigin(rawUrl: string, expectedOrigin: string): void {
  if (rawUrl.length > 2_048) throw navigationOriginError("Top-level URLs are limited to 2,048 characters.");
  let actualOrigin: string;
  try {
    actualOrigin = new URL(rawUrl).origin;
  } catch {
    throw navigationOriginError();
  }
  if (actualOrigin !== expectedOrigin) throw navigationOriginError();
}

export function navigationOriginError(message = "Top-level navigation must stay on the selected session origin."): WebDebugError {
  return new WebDebugError("NAVIGATION_ORIGIN_BLOCKED", message);
}
