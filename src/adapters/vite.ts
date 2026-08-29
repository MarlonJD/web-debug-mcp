import { boundText, redactValue, safeUrl } from "../core/redaction.js";
import { MAX_FRAMEWORK_RESPONSE_BYTES, readResponseTextBounded } from "../core/http.js";
import type { OperationContext, ViteSnapshot } from "../domain/types.js";
import { performance } from "node:perf_hooks";

export class ViteAdapter {
  async snapshot(baseUrl: string, context: OperationContext = {}): Promise<ViteSnapshot | null> {
    const endpoint = new URL("/__web_debug/vite", baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.deadline === undefined ? 2_000 : Math.max(1, Math.min(2_000, context.deadline - performance.now())));
    const onAbort = () => controller.abort();
    context.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await fetch(endpoint, {
        headers: { accept: "application/json" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status === 404) return null;
      const body = await readResponseTextBounded(response, MAX_FRAMEWORK_RESPONSE_BYTES, "Vite debug endpoint response", controller.signal);
      if (!response.ok) throw new Error(`Vite debug endpoint returned HTTP ${response.status}: ${boundText(body, 500)}`);
      const parsed: unknown = JSON.parse(body);
      if (!isRecord(parsed) || parsed.detected !== true) return null;
      return redactValue({ ...parsed, endpoint: safeUrl(endpoint) }) as ViteSnapshot;
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("Vite debug endpoint returned malformed JSON.");
      throw error;
    } finally {
      clearTimeout(timeout);
      context.signal?.removeEventListener("abort", onAbort);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
