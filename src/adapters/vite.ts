import { boundText, redactValue, safeUrl } from "../core/redaction.js";
import type { ViteSnapshot } from "../domain/types.js";

export class ViteAdapter {
  async snapshot(baseUrl: string): Promise<ViteSnapshot | null> {
    const endpoint = new URL("/__web_debug/vite", baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(endpoint, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (response.status === 404) return null;
      const body = await response.text();
      if (!response.ok) throw new Error(`Vite debug endpoint returned HTTP ${response.status}: ${boundText(body, 500)}`);
      const parsed: unknown = JSON.parse(body);
      if (!isRecord(parsed) || parsed.detected !== true) return null;
      return redactValue({ ...parsed, endpoint: safeUrl(endpoint) }) as ViteSnapshot;
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("Vite debug endpoint returned malformed JSON.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
