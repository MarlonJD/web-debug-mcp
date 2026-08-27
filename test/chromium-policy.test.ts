import { chromium } from "playwright-core";
import { describe, expect, it, vi } from "vitest";

import { ChromiumAdapter } from "../src/adapters/chromium.js";

describe("Chromium remote target policy", () => {
  it("blocks a remote CDP endpoint without explicit opt-in", async () => {
    await expect(new ChromiumAdapter().start({
      url: "http://127.0.0.1:4173/",
      cdpEndpoint: "http://192.0.2.1:9222",
    })).rejects.toMatchObject({ code: "REMOTE_CDP_BLOCKED" });
  });

  it("blocks unsupported CDP endpoint protocols", async () => {
    await expect(new ChromiumAdapter().start({
      url: "http://127.0.0.1:4173/",
      cdpEndpoint: "file:///tmp/cdp",
    })).rejects.toMatchObject({ code: "CDP_ENDPOINT_PROTOCOL_BLOCKED" });
  });

  it("refuses an ambiguous attached browser without targetId", async () => {
    const pageA = fakePage("target-a");
    const pageB = fakePage("target-b");
    const browser = fakeBrowser([fakeContext([pageA, pageB])]);
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as never);
    try {
      await expect(new ChromiumAdapter().start({ url: "http://127.0.0.1:4173/", cdpEndpoint: "http://127.0.0.1:9222" })).rejects.toMatchObject({ code: "ATTACHED_TARGET_REQUIRED" });
    } finally {
      connect.mockRestore();
    }
  });

  it("reports no-page attachment rather than selecting another target", async () => {
    const browser = fakeBrowser([fakeContext([])]);
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as never);
    try {
      await expect(new ChromiumAdapter().start({ url: "http://127.0.0.1:4173/", cdpEndpoint: "http://127.0.0.1:9222" })).rejects.toMatchObject({ code: "ATTACHED_PAGE_UNAVAILABLE" });
    } finally {
      connect.mockRestore();
    }
  });

  it("pins and reports the explicitly selected attached target", async () => {
    const pageA = fakePage("target-a");
    const pageB = fakePage("target-b");
    const browser = fakeBrowser([fakeContext([pageA, pageB])]);
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as never);
    const adapter = new ChromiumAdapter();
    try {
      const target = await adapter.start({ url: "http://127.0.0.1:4173/", cdpEndpoint: "http://127.0.0.1:9222", targetId: "target-b" });
      expect(target.targetId).toBe("target-b");
      expect(pageA.gotoCalls).toBe(0);
      expect(pageB.gotoCalls).toBe(1);
      expect(adapter.targetIdentity()).toBe("target-b");
    } finally {
      await adapter.close();
      connect.mockRestore();
    }
  });

  it("keeps checks-only snapshots framework-light and does not retain network bundles", async () => {
    const page = fakePage("target-only");
    const browser = fakeBrowser([fakeContext([page])]);
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as never);
    const adapter = new ChromiumAdapter();
    try {
      await adapter.start({ url: "http://127.0.0.1:4173/", cdpEndpoint: "http://127.0.0.1:9222" });
      page.eventHandlers.request?.({ headers: () => ({}), method: () => "GET", url: () => "http://127.0.0.1:4173/data", resourceType: () => "fetch" });
      page.evaluateCalls = 0;
      page.evaluateResults = [{ bodyText: "Checks", elements: [] }, { bodyText: "Full", elements: [] }, null];
      const checksOnly = await adapter.snapshot({ artifactDir: "/tmp/chromium-checks-only", captureScreenshot: false, checksOnly: true });
      expect(checksOnly.react).toBeNull();
      expect(checksOnly.network).toEqual([]);
      expect(page.evaluateCalls).toBe(1);

      page.eventHandlers.request?.({ headers: () => ({}), method: () => "GET", url: () => "http://127.0.0.1:4173/after", resourceType: () => "fetch" });
      const full = await adapter.snapshot({ artifactDir: "/tmp/chromium-full", captureScreenshot: false, checksOnly: false });
      expect(full.react).toBeNull();
      expect(full.network).toHaveLength(1);
      expect(page.evaluateCalls).toBe(3);
    } finally {
      await adapter.close();
      connect.mockRestore();
    }
  });

  it("bounds optional React enrichment without failing the browser snapshot", async () => {
    const page = fakePage("target-react-timeout");
    const browser = fakeBrowser([fakeContext([page])]);
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as never);
    const adapter = new ChromiumAdapter();
    vi.useFakeTimers();
    try {
      await adapter.start({ url: "http://127.0.0.1:4173/", cdpEndpoint: "http://127.0.0.1:9222" });
      page.evaluateCalls = 0;
      page.evaluateResults = [{ bodyText: "Browser-only", elements: [] }];
      page.evaluateHang = true;
      const snapshotPromise = adapter.snapshot({ artifactDir: "/tmp/chromium-react-timeout", captureScreenshot: true, checksOnly: false });
      await vi.advanceTimersByTimeAsync(1_000);
      const snapshot = await snapshotPromise;
      expect(snapshot.dom.bodyText).toBe("Browser-only");
      expect(snapshot.react).toBeNull();
      expect(snapshot.screenshotPath).toBeNull();
      expect(snapshot.warnings).toContain("React snapshot unavailable: optional enrichment timed out.");
      expect(snapshot.warnings.some((warning) => warning.startsWith("Screenshot unavailable:"))).toBe(true);
    } finally {
      vi.useRealTimers();
      await adapter.close();
      connect.mockRestore();
    }
  });
});

function fakeBrowser(contexts: any[]) {
  return { contexts: () => contexts, version: () => "fake-chromium" };
}

function fakeContext(pages: any[]) {
  const context = {
    pages: () => pages,
    addInitScript: async () => undefined,
    newCDPSession: async (page: any) => fakeCdp(page),
  };
  for (const page of pages) page.contextValue = context;
  return context;
}

function fakePage(targetId: string) {
  const page: any = {
    targetId,
    contextValue: null,
    currentUrl: "http://127.0.0.1:4173/",
    gotoCalls: 0,
    eventHandlers: {},
    on(event: string, handler: unknown) { this.eventHandlers[event] = handler; },
    context() { return this.contextValue; },
    url() { return this.currentUrl; },
    title: async () => "Fixture",
    viewportSize: () => ({ width: 1_440, height: 900 }),
    goto: async function (url: string) { this.currentUrl = url; this.gotoCalls += 1; },
    evaluateResults: [] as unknown[],
    evaluateHang: false,
    evaluate: async function () {
      this.evaluateCalls = (this.evaluateCalls ?? 0) + 1;
      if (this.evaluateHang && this.evaluateCalls === 2) return new Promise(() => undefined);
      return this.evaluateResults.shift() ?? (this.evaluateCalls === 1 ? { bodyText: "Fixture", elements: [] } : null);
    },
  };
  return page;
}

function fakeCdp(page: any) {
  return {
    on: () => undefined,
    send: async (method: string) => method === "Target.getTargetInfo" ? { targetInfo: { targetId: page.targetId } } : {},
    detach: async () => undefined,
  };
}
