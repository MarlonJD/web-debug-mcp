import { WebDebugError } from "./errors.js";

export const MAX_FRAMEWORK_RESPONSE_BYTES = 256 * 1024;
export const MAX_WEBDRIVER_RESPONSE_BYTES = 256 * 1024;
export const MAX_SCREENSHOT_RESPONSE_BYTES = 8 * 1024 * 1024;

export async function readResponseTextBounded(
  response: Response,
  maxBytes: number,
  label: string,
  signal?: AbortSignal,
): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw responseLimitError(label, maxBytes);
    }
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await readWithSignal(reader, signal, label);
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw responseLimitError(label, maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes).toString("utf8");
}

async function readWithSignal(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined,
  label: string,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!signal) return reader.read();
  if (signal.aborted) {
    await reader.cancel().catch(() => undefined);
    throw new WebDebugError("UPSTREAM_RESPONSE_ABORTED", `${label} was aborted before completion.`);
  }
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(new WebDebugError("UPSTREAM_RESPONSE_ABORTED", `${label} was aborted before completion.`));
      void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([reader.read(), aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function responseLimitError(label: string, maxBytes: number): WebDebugError {
  return new WebDebugError(
    "UPSTREAM_RESPONSE_LIMIT_EXCEEDED",
    `${label} exceeded the ${maxBytes}-byte response limit.`,
  );
}
