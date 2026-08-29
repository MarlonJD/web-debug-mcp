import type { ChildProcess } from "node:child_process";

export function waitForHttpReady(targetUrl: string, child: ChildProcess, options?: { label?: string; timeoutMs?: number; pollMs?: number }): Promise<void>;
export function waitForOutputReady(child: ChildProcess, pattern: string | RegExp, options?: { label?: string; timeoutMs?: number }): Promise<void>;
export function stopOwnedProcess(child: ChildProcess, options?: { label?: string; gracefulMs?: number; forceMs?: number; processGroup?: boolean }): Promise<{ forced: boolean; code: number | null; signal: NodeJS.Signals | null }>;
