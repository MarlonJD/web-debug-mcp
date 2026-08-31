import { performance } from "node:perf_hooks";

import type { OperationContext } from "../domain/types.js";
import { WebDebugError } from "./errors.js";

const OPTIONAL_ENRICHMENT_BUDGET_MS = 2_000;

export function remaining(context: OperationContext): number {
  return context.deadline === undefined ? Number.POSITIVE_INFINITY : context.deadline - (context.clock?.() ?? performance.now());
}

export function boundedContext(context: OperationContext, deadline: number): OperationContext {
  return {
    signal: context.signal,
    deadline: context.deadline === undefined ? deadline : Math.min(context.deadline, deadline),
    clock: context.clock,
    abort: context.abort,
    pending: context.pending,
    progress: context.progress,
  };
}

export function optionalContext(parent: OperationContext): { context: OperationContext; pending: Set<Promise<void>>; dispose: () => void } {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (parent.signal?.aborted) controller.abort();
  else parent.signal?.addEventListener("abort", onParentAbort, { once: true });
  const now = parent.clock?.() ?? performance.now();
  const pending = new Set<Promise<void>>();
  return {
    context: {
      signal: controller.signal,
      deadline: parent.deadline === undefined ? now + OPTIONAL_ENRICHMENT_BUDGET_MS : Math.min(parent.deadline, now + OPTIONAL_ENRICHMENT_BUDGET_MS),
      clock: parent.clock,
      abort: () => controller.abort(),
      pending,
    },
    pending,
    dispose: () => {
      parent.signal?.removeEventListener("abort", onParentAbort);
    },
  };
}

export function throwIfCancelled(context: OperationContext): void {
  if (context.signal?.aborted) throw new WebDebugError("REQUEST_CANCELLED", "The request was cancelled.");
  if (context.deadline !== undefined && context.deadline <= (context.clock?.() ?? performance.now())) throw new WebDebugError("VERIFICATION_DEADLINE_EXCEEDED", "The bounded operation deadline was exhausted.");
}

export async function waitForCleanup(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  await Promise.race([promise.catch(() => undefined), new Promise<void>((resolve) => { timer = setTimeout(() => { timedOut = true; resolve(); }, timeoutMs); })]);
  if (timer) clearTimeout(timer);
  return !timedOut;
}

export async function waitForPending(pending: Set<Promise<void>>, timeoutMs: number): Promise<boolean> {
  if (pending.size === 0) return true;
  return waitForCleanup(Promise.all([...pending]).then(() => undefined), timeoutMs);
}
