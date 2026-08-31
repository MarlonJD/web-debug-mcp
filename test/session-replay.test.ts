import { describe, expect, it } from "vitest";

import { SessionReplay } from "../src/core/session-replay.js";

function frame(index: number) {
  return {
    attemptId: null,
    capturedAt: `2026-08-30T00:00:${String(index).padStart(2, "0")}.000Z`,
    trigger: "action" as const,
    action: { kind: "click" as const, locator: { kind: "css" as const, value: `#item-${index}` } },
    url: "http://127.0.0.1:4173/",
    title: "Fixture",
    dom: { bodyText: `frame-${index}`, elements: [] },
    console: [],
    network: [],
    debugger: { paused: false, reason: null, callFrames: [], breakpoints: [] },
    react: null,
    angular: null,
    vue: null,
  };
}

describe("session replay controller", () => {
  it("owns monotonic indices, the eight-frame cap, reset, and public bounds", () => {
    const replay = new SessionReplay();
    for (let index = 0; index < 10; index += 1) replay.append(frame(index));
    expect(replay.timeline()).toMatchObject({ maxFrames: 8, truncated: true });
    expect(replay.timeline().frames.map((item) => item.index)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(replay.hasTrustworthyStartBoundary()).toBe(false);
    expect(replay.boundsDescription()).toBe("2-9");

    const selected = replay.find(5)!;
    expect(replay.actionsThrough(selected)).toHaveLength(4);
    expect(replay.result("00000000-0000-4000-8000-000000000001", selected, false, [])).toMatchObject({ availableFrames: 8, oldestFrameIndex: 2, newestFrameIndex: 9 });

    replay.resetForAttempt();
    expect(replay.timeline()).toMatchObject({ frames: [], truncated: false });
    expect(replay.append(frame(10)).index).toBe(10);
    replay.purge();
    expect(replay.append(frame(0)).index).toBe(0);
  });
});
