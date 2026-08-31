import type { BrowserAction, ReplayFrame, ReplaySeekResult, ReplayTimeline } from "../domain/types.js";
import { MAX_REPLAY_FRAMES } from "../domain/types.js";
import { actionSecrets, cloneJson, replaceSecrets } from "./private-values.js";

export class SessionReplay {
  private readonly frames: ReplayFrame[] = [];
  private nextIndex = 0;
  private truncated = false;

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

  actionsThrough(target: ReplayFrame): BrowserAction[] {
    return this.frames
      .filter((frame) => frame.index <= target.index && frame.action)
      .map((frame) => frame.action as BrowserAction);
  }

  hasTrustworthyStartBoundary(): boolean {
    return !this.truncated && this.frames[0]?.index === 0;
  }

  boundsDescription(): string {
    return `${this.frames[0]?.index ?? 0}-${this.frames.at(-1)?.index ?? -1}`;
  }

  timeline(): ReplayTimeline {
    return { enabled: true, maxFrames: MAX_REPLAY_FRAMES, truncated: this.truncated, frames: this.frames };
  }

  result(sessionId: string, frame: ReplayFrame, restored: boolean, redactionActions: BrowserAction[]): ReplaySeekResult {
    const secrets = actionSecrets(redactionActions);
    const safeFrame = secrets.length === 0 ? frame : replaceSecrets(frame, secrets) as ReplayFrame;
    return cloneJson({
      sessionId,
      frame: safeFrame,
      restored,
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
  }
}
