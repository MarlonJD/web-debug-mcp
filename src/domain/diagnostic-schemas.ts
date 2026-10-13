import { z } from "zod";

export const sourceLocationSchema = z.object({ url: z.string().max(2560), line: z.number().int().positive(), column: z.number().int().positive() }).strict().meta({ id: "SourceLocationOutput" });
export const sourceReferenceSchema = z.object({
  scriptId: z.string().max(100), scriptHash: z.string().max(128).nullable(),
  generated: sourceLocationSchema, original: sourceLocationSchema.nullable(),
  mapping: z.enum(["mapped", "unavailable"]), reason: z.string().max(500).optional(),
}).strict().meta({ id: "SourceReferenceOutput" });
export const sourceInventorySchema = z.object({
  schemaVersion: z.literal(1), scope: z.literal("main-frame-default-world"),
  scripts: z.array(z.object({
    scriptId: z.string().max(100), url: z.string().max(2560), hash: z.string().max(128).nullable(),
    sources: z.array(z.string().max(2560)).max(30), mapping: z.enum(["available", "unavailable"]), reason: z.string().max(500).optional(),
  }).strict()).max(20), truncated: z.boolean(),
}).strict().meta({ id: "SourceInventoryOutput" });
export const executionDiagnosticsSchema = z.object({
  schemaVersion: z.literal(1), actionId: z.string().uuid(), startedAt: z.string().max(100), durationMs: z.number().nonnegative(),
  association: z.literal("temporal-window"),
  react: z.object({ commitsBefore: z.number().int().nonnegative(), commitsAfter: z.number().int().nonnegative() }).strict().optional(),
  coverage: z.object({
    state: z.enum(["collected", "not-requested", "unavailable"]), backendStart: z.number().nullable(), backendEnd: z.number().nullable(),
    scripts: z.array(z.object({
      scriptId: z.string().max(100), url: z.string().max(2560), hash: z.string().max(128).nullable(),
      functions: z.array(z.object({
        name: z.string().max(150), blockCoverage: z.boolean(),
        ranges: z.array(z.object({ startOffset: z.number().int().nonnegative(), endOffset: z.number().int().nonnegative(), count: z.number().int().nonnegative(), source: sourceReferenceSchema.nullable() }).strict()).max(8),
      }).strict()).max(12),
    }).strict()).max(12),
  }).strict(),
  requests: z.array(z.object({
    requestId: z.string().max(100), method: z.string().max(20), url: z.string().max(2560), status: z.number().nullable(),
    startMs: z.number().nonnegative(), endMs: z.number().nonnegative().nullable(),
    initiator: sourceReferenceSchema.nullable(), initiatorType: z.string().max(50), association: z.enum(["cdp-initiator", "unavailable"]),
  }).strict()).max(30),
  truncated: z.boolean(), cleanup: z.literal("complete"), warnings: z.array(z.string().max(500)).max(10),
}).strict().meta({ id: "ExecutionDiagnosticsOutput" });
const strings = z.array(z.string().max(300)).max(20).meta({ id: "DiagnosticStringsOutput" });
const stringDifference = z.object({ added: strings, removed: strings }).strict().meta({ id: "DiagnosticStringDifferenceOutput" });
export const behaviorDifferenceSchema = z.object({
  schemaVersion: z.literal(1), diagnosticOnly: z.literal(true), state: z.enum(["compared", "unavailable"]),
  console: stringDifference,
  requests: z.array(z.object({ key: z.string().max(300), before: z.number().int(), after: z.number().int(), failedBefore: z.number().int(), failedAfter: z.number().int(), pendingBefore: z.number().int(), pendingAfter: z.number().int() }).strict()).max(20),
  react: z.object({ commitsBefore: z.number().int(), commitsAfter: z.number().int(), addedKeys: strings, removedKeys: strings }).strict().nullable(),
  execution: stringDifference.nullable(), truncated: z.boolean(), warnings: z.array(z.string().max(500)).max(10),
  requestCompletionOrder: z.object({ before: strings, after: strings }).strict().nullable(),
}).strict().meta({ id: "BehaviorDifferenceOutput" });
