import type { ReplayableBrowserAction, ReplayFrame, ReplaySeekResult, ReplayTimeline } from "../domain/types.js";
import { MAX_REPLAY_FRAMES } from "../domain/types.js";
import { actionSecrets, cloneJson, replaceSecrets } from "./private-values.js";

export class SessionReplay {
  private readonly frames: ReplayFrame[] = [];
  private nextIndex = 0;
  private truncated = false;
  private restorable = true;
  private restoreBlockedReason: string | null = null;

  append(frame: Omit<ReplayFrame, "index">): ReplayFrame {
    const stored = { ...frame, index: this.nextIndex++ };
    this.frames.push(stored);
    if (this.frames.length > MAX_REPLAY_FRAMES) {
      this.frames.shift();
      this.truncated = true;
    }
    return stored;
  }

  find(index: number): ReplayFrame | undefined {
    return this.frames.find((frame) => frame.index === index);
  }

  actionsThrough(target: ReplayFrame): ReplayableBrowserAction[] {
    return this.frames
      .filter((frame) => frame.index <= target.index && frame.action)
      .map((frame) => frame.action as ReplayableBrowserAction);
  }

  hasTrustworthyStartBoundary(): boolean {
    return !this.truncated && this.frames[0]?.index === 0;
  }

  boundsDescription(): string {
    return `${this.frames[0]?.index ?? 0}-${this.frames.at(-1)?.index ?? -1}`;
  }

  timeline(): ReplayTimeline {
    return { enabled: true, maxFrames: MAX_REPLAY_FRAMES, truncated: this.truncated, restorable: this.restorable, restoreBlockedReason: this.restoreBlockedReason, frames: this.frames };
  }

  markNonRestorable(reason: string): void {
    this.restorable = false;
    this.restoreBlockedReason = reason;
  }

  isRestorable(): boolean { return this.restorable; }

  blockedReason(): string | null { return this.restoreBlockedReason; }

  result(sessionId: string, frame: ReplayFrame, restored: boolean, redactionActions: ReplayableBrowserAction[]): ReplaySeekResult {
    const secrets = actionSecrets(redactionActions);
    const safeFrame = secrets.length === 0 ? frame : replaceSecrets(frame, secrets) as ReplayFrame;
    return cloneJson({
      schemaVersion: 1,
      sessionId,
      frame: safeFrame,
      restored,
      restorable: this.restorable,
      restoreBlockedReason: this.restoreBlockedReason,
      availableFrames: this.frames.length,
      oldestFrameIndex: this.frames[0]?.index ?? frame.index,
      newestFrameIndex: this.frames.at(-1)?.index ?? frame.index,
    });
  }

  resetForAttempt(): void {
    this.frames.length = 0;
    this.truncated = false;
  }

  purge(): void {
    this.frames.length = 0;
    this.nextIndex = 0;
    this.truncated = false;
    this.restorable = true;
    this.restoreBlockedReason = null;
  }
}
