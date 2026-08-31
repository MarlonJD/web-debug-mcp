import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { MAX_RESULT_BYTES } from "../domain/types.js";
import { WebDebugError, errorMessage } from "./errors.js";
import { ArtifactStore, type ScreenshotCandidate } from "./artifact-store.js";
import { boundText, redactText, redactValue } from "./redaction.js";

const MAX_TEXT_PREVIEW_BYTES = 8 * 1024;

const artifactDescriptorSchema = z.object({
  kind: z.literal("screenshot"),
  uri: z.string().url(),
  mimeType: z.literal("image/png"),
  bytes: z.number().int().nonnegative(),
  delivery: z.enum(["inline", "resource"]),
}).strict();

const toolErrorSchema = z.object({
  code: z.string().min(1).max(100),
  message: z.string().max(500),
  details: z.json().optional(),
}).strict();

export function toolOutputSchemaFor<T extends z.ZodType>(dataSchema: T) {
  return z.object({
  ok: z.boolean(),
  data: dataSchema.optional(),
  error: toolErrorSchema.optional(),
  artifacts: z.array(artifactDescriptorSchema).max(2),
  warnings: z.array(z.string().max(500)).max(10),
  }).strict().superRefine((value, context) => {
    if (value.ok && value.data === undefined) context.addIssue({ code: "custom", message: "Successful tool results require data.", path: ["data"] });
    if (value.ok && value.error !== undefined) context.addIssue({ code: "custom", message: "Successful tool results cannot include an error.", path: ["error"] });
    if (!value.ok && value.error === undefined) context.addIssue({ code: "custom", message: "Failed tool results require an error.", path: ["error"] });
    if (!value.ok && value.data !== undefined) context.addIssue({ code: "custom", message: "Failed tool results cannot include data.", path: ["data"] });
  });
}

export async function successToolResult(
  value: unknown,
  artifactStore: ArtifactStore,
  screenshots: readonly ScreenshotCandidate[] = [],
  dataSchema: z.ZodType = z.json(),
): Promise<CallToolResult> {
  const canonical = toJsonValue(value);
  const dataBytes = Buffer.byteLength(JSON.stringify(canonical));
  if (dataBytes > MAX_RESULT_BYTES) throw resultLimitError();
  const validation = dataSchema.safeParse(canonical);
  if (!validation.success) {
    throw new WebDebugError("RESULT_SCHEMA_VIOLATION", "The tool result did not match its advertised data schema.", {
      issues: validation.error.issues.slice(0, 10).map((issue) => ({ code: issue.code, path: issue.path.slice(0, 12).map(String) })),
    });
  }
  const artifacts = await artifactStore.prepare(screenshots, Math.max(0, MAX_RESULT_BYTES - dataBytes - MAX_TEXT_PREVIEW_BYTES));
  try {
    const structuredContent = {
      ok: true,
      data: canonical,
      artifacts: artifacts.descriptors,
      warnings: artifacts.warnings,
    };
    const pretty = JSON.stringify(canonical, null, 2);
    const preview = Buffer.byteLength(pretty) <= MAX_TEXT_PREVIEW_BYTES
      ? pretty
      : `Structured result available (${dataBytes} bytes).`;
    let result: CallToolResult = {
      structuredContent,
      content: [{ type: "text", text: preview }, ...artifacts.content],
    };
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESULT_BYTES) {
      result = {
        structuredContent: {
          ...structuredContent,
          artifacts: structuredContent.artifacts.map((artifact) => ({ ...artifact, delivery: "resource" as const })),
        },
        content: [
          { type: "text", text: `Structured result available (${dataBytes} bytes).` },
          ...artifacts.content.filter((item) => item.type === "resource_link"),
        ],
      };
    }
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESULT_BYTES) throw resultLimitError();
    artifacts.commit();
    return result;
  } catch (error) {
    artifacts.rollback();
    throw error;
  }
}

export function errorToolResult(error: unknown): CallToolResult {
  const code = boundText(redactText(error instanceof WebDebugError ? error.code : "INTERNAL_ERROR"), 100);
  const message = boundText(redactText(errorMessage(error)), 500);
  const rawDetails = error instanceof WebDebugError ? redactValue(error.details) : undefined;
  let details: z.infer<ReturnType<typeof z.json>> | undefined;
  let detailWarnings: string[] = [];
  if (rawDetails !== undefined) {
    try { details = toJsonValue(rawDetails); }
    catch { detailWarnings = ["Error details were not JSON-serializable and were omitted."]; }
  }
  let envelope = {
    ok: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
    artifacts: [] as never[],
    warnings: detailWarnings,
  };
  if (Buffer.byteLength(JSON.stringify(envelope)) > MAX_RESULT_BYTES) {
    details = undefined;
    envelope = { ok: false, error: { code, message }, artifacts: [], warnings: ["Error details exceeded the MCP result limit and were omitted."] };
  }
  let result: CallToolResult = {
    isError: true,
    structuredContent: envelope,
    content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
  };
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESULT_BYTES) {
    result = {
      isError: true,
      structuredContent: envelope,
      content: [{ type: "text", text: `${code}: ${message}` }],
    };
  }
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESULT_BYTES) {
    envelope = { ok: false, error: { code, message }, artifacts: [], warnings: ["Error details exceeded the MCP result limit and were omitted."] };
    result = { isError: true, structuredContent: envelope, content: [{ type: "text", text: `${code}: ${message}` }] };
  }
  return result;
}

function toJsonValue(value: unknown): z.infer<ReturnType<typeof z.json>> {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return null;
    return JSON.parse(serialized) as z.infer<ReturnType<typeof z.json>>;
  } catch {
    throw new WebDebugError("RESULT_SERIALIZATION_FAILED", "The tool result could not be serialized as bounded JSON.");
  }
}

function resultLimitError(): WebDebugError {
  return new WebDebugError("RESULT_LIMIT_EXCEEDED", `The MCP result exceeded the ${MAX_RESULT_BYTES}-byte limit.`);
}
