import { chromium } from "playwright-core";
import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    const context = fakeContext([pageA, pageB]);
    const browser = fakeBrowser([context]);
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
    const context = fakeContext([pageA, pageB]);
    const browser = fakeBrowser([context]);
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as never);
    const adapter = new ChromiumAdapter();
    try {
      const target = await adapter.start({ url: "http://127.0.0.1:4173/", cdpEndpoint: "http://127.0.0.1:9222", targetId: "target-b" });
      expect(target.targetId).toBe("target-b");
      expect(pageA.gotoCalls).toBe(0);
      expect(pageB.gotoCalls).toBe(1);
      expect(adapter.targetIdentity()).toBe("target-b");
      expect(pageA.routeHandler).toBeNull();
      expect(pageB.fetchEnabled).toBe(true);
      expect(context.routeHandlers).toHaveLength(1);
      expect(context.addInitScriptCalls).toBe(0);
    } finally {
      await adapter.close();
      connect.mockRestore();
    }
  });

  it("blocks cross-origin redirects and action navigation while allowing cross-origin subresources", async () => {
    const redirectingPage = fakePage("redirect-target");
    redirectingPage.redirects.set("http://127.0.0.1:4173/", "https://example.com/escaped");
    const redirectBrowser = fakeBrowser([fakeContext([redirectingPage])]);
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(redirectBrowser as never);
    try {
      await expect(new ChromiumAdapter().start({
        url: "http://127.0.0.1:4173/",
        cdpEndpoint: "http://127.0.0.1:9222",
      })).rejects.toMatchObject({ code: "NAVIGATION_ORIGIN_BLOCKED" });
    } finally {
      connect.mockRestore();
    }

    const page = fakePage("action-target");
    const browser = fakeBrowser([fakeContext([page])]);
    const actionConnect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as never);
    const adapter = new ChromiumAdapter();
    try {
      await adapter.start({ url: "http://127.0.0.1:4173/", cdpEndpoint: "http://127.0.0.1:9222" });
      expect(await page.routeRequest("https://cdn.example.com/app.js", false)).toBe("continued");
      expect(await page.routeRequest("https://embed.example.com/frame", true, false)).toBe("continued");
      page.clickTarget = "https://example.com/escaped";
      await expect(adapter.act({ kind: "click", locator: { kind: "css", value: "#leave" } })).rejects.toMatchObject({ code: "NAVIGATION_ORIGIN_BLOCKED" });
      expect(page.currentUrl).toBe("http://127.0.0.1:4173/");
      page.currentUrl = "https://example.com/async-escape";
      page.eventHandlers.framenavigated?.(page.mainFrame());
      await expect(adapter.snapshot({ artifactDir: "/tmp/async-origin-test", captureScreenshot: false })).rejects.toMatchObject({ code: "NAVIGATION_ORIGIN_BLOCKED" });
      const actionsBefore = page.actionCalls.length;
      await expect(adapter.act({ kind: "fill", locator: { kind: "css", value: "#secret" }, value: "do-not-send" })).rejects.toMatchObject({ code: "NAVIGATION_ORIGIN_BLOCKED" });
      expect(page.actionCalls).toHaveLength(actionsBefore);
    } finally {
      await adapter.close();
      actionConnect.mockRestore();
    }
  });

  it("closes and rejects secondary pages opened by the selected target", async () => {
    const page = fakePage("popup-target");
    const context = fakeContext([page]);
    const browser = fakeBrowser([context]);
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as never);
    const adapter = new ChromiumAdapter();
    try {
      await adapter.start({ url: "http://127.0.0.1:4173/", cdpEndpoint: "http://127.0.0.1:9222" });
      page.popupTarget = "http://127.0.0.1:4173/popup";
      page.popupFirstFrameUnavailable = true;
      const destinationDispatches = context.networkDispatches;
      await expect(adapter.act({ kind: "click", locator: { kind: "css", value: "#popup" } })).rejects.toMatchObject({ code: "NAVIGATION_ORIGIN_BLOCKED" });
      expect(page.lastPopup?.closed).toBe(true);
      expect(context.networkDispatches).toBe(destinationDispatches);
    } finally {
      await adapter.close();
      connect.mockRestore();
    }
  });

  it("executes the bounded deterministic interaction action set", async () => {
    const page = fakePage("interaction-target");
    const browser = fakeBrowser([fakeContext([page])]);
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as never);
    const adapter = new ChromiumAdapter();
    try {
      await adapter.start({ url: "http://127.0.0.1:4173/", cdpEndpoint: "http://127.0.0.1:9222" });
      await adapter.act({ kind: "press", locator: { kind: "css", value: "#input" }, key: "Enter" });
      await adapter.act({ kind: "select", locator: { kind: "css", value: "#select" }, value: "option-1" });
      await adapter.act({ kind: "check", locator: { kind: "css", value: "#check" }, checked: true });
      await adapter.act({ kind: "check", locator: { kind: "css", value: "#check" }, checked: false });
      await adapter.act({ kind: "hover", locator: { kind: "css", value: "#hover" } });
      await adapter.act({ kind: "scroll", locator: { kind: "css", value: "#scroll" } });
      expect(page.actionCalls).toEqual(["press:Enter", "select:option-1", "check", "uncheck", "hover", "scroll"]);
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

  it("tracks and deletes a screenshot that finishes after its optional timeout", async () => {
    const page = fakePage("target-late-screenshot");
    const browser = fakeBrowser([fakeContext([page])]);
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as never);
    const adapter = new ChromiumAdapter();
    const artifactDir = await mkdtemp(join(tmpdir(), "web-debug-mcp-late-screenshot-"));
    const pending = new Set<Promise<void>>();
    let markScreenshotStarted: (() => void) | null = null;
    const screenshotStarted = new Promise<void>((resolve) => { markScreenshotStarted = resolve; });
    page.screenshotImpl = async ({ path }: { path: string }) => {
      markScreenshotStarted?.();
      await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
      await writeFile(path, Buffer.from("late-png"));
    };
    vi.useFakeTimers();
    try {
      await adapter.start({ url: "http://127.0.0.1:4173/", cdpEndpoint: "http://127.0.0.1:9222" });
      const snapshotPromise = adapter.snapshot({ artifactDir, captureScreenshot: true, checksOnly: false }, { pending });
      await screenshotStarted;
      await vi.advanceTimersByTimeAsync(1_000);
      const snapshot = await snapshotPromise;
      expect(snapshot.screenshotPath).toBeNull();
      expect(snapshot.warnings).toContain("Screenshot unavailable: optional enrichment timed out.");
      expect(pending.size).toBe(1);

      await vi.advanceTimersByTimeAsync(500);
      await Promise.all([...pending]);
      expect((await readdir(artifactDir)).filter((name) => name.endsWith(".png"))).toEqual([]);
      await adapter.close();
      await rm(artifactDir, { recursive: true, force: true });
      await expect(access(artifactDir)).rejects.toThrow();
    } finally {
      await vi.runAllTimersAsync();
      vi.useRealTimers();
      await adapter.close();
      connect.mockRestore();
      await rm(artifactDir, { recursive: true, force: true });
    }
  });
});

function fakeBrowser(contexts: any[]) {
  return { contexts: () => contexts, version: () => "fake-chromium" };
}

function fakeContext(pages: any[]) {
  const context = {
    addInitScriptCalls: 0,
    routeHandlers: [] as Array<(route: any, request: any) => Promise<void>>,
    networkDispatches: 0,
    pages: () => pages,
    addInitScript: async function () { this.addInitScriptCalls += 1; },
    route: async function (_pattern: string, handler: (route: any, request: any) => Promise<void>) { this.routeHandlers.push(handler); },
    unroute: async function (_pattern: string, handler: (route: any, request: any) => Promise<void>) { this.routeHandlers = this.routeHandlers.filter((candidate) => candidate !== handler); },
    dispatchRoute: async function (requestPage: any, url: string, navigation: boolean, topLevel: boolean, frameUnavailable = false) {
      let outcome = "continued";
      const frame = topLevel ? requestPage.mainFrame() : { page: () => requestPage };
      const request = {
        isNavigationRequest: () => navigation,
        frame: () => { if (frameUnavailable) throw new Error("frame unavailable"); return frame; },
        resourceType: () => navigation ? "document" : "fetch",
        url: () => url,
      };
      const dispatch = async (index: number): Promise<void> => {
        const handler = this.routeHandlers[index];
        if (!handler) { this.networkDispatches += 1; outcome = "continued"; return; }
        const route = {
          continue: async () => { outcome = "continued"; },
          fallback: async () => dispatch(index - 1),
          abort: async () => { outcome = "aborted"; },
        };
        await handler(route, request);
      };
      await dispatch(this.routeHandlers.length - 1);
      return outcome;
    },
    newCDPSession: async (page: any) => { const cdp = fakeCdp(page); page.activeCdp = cdp; return cdp; },
  };
  for (const page of pages) page.contextValue = context;
  return context;
}

function fakePage(targetId: string) {
  let page: any;
  const mainFrame = { url: () => page.currentUrl, page: () => page };
  page = {
    targetId,
    contextValue: null,
    currentUrl: "http://127.0.0.1:4173/",
    gotoCalls: 0,
    eventHandlers: {},
    on(event: string, handler: unknown) { this.eventHandlers[event] = handler; },
    off(event: string, handler: unknown) { if (this.eventHandlers[event] === handler) delete this.eventHandlers[event]; },
    context() { return this.contextValue; },
    mainFrame: () => mainFrame,
    url() { return this.currentUrl; },
    title: async () => "Fixture",
    viewportSize: () => ({ width: 1_440, height: 900 }),
    redirects: new Map<string, string>(),
    clickTarget: null as string | null,
    popupTarget: null as string | null,
    popupFirstFrameUnavailable: false,
    lastPopup: null as { closed: boolean; close: () => Promise<void> } | null,
    closed: false,
    openerValue: null as any,
    opener: async function () { return this.openerValue; },
    close: async function () { this.closed = true; },
    actionCalls: [] as string[],
    fetchEnabled: false,
    autoAttachPages: false,
    activeCdp: null as any,
    routeHandler: null as ((route: any, request: any) => Promise<void>) | null,
    route: async function (_pattern: string, handler: (route: any, request: any) => Promise<void>) { this.routeHandler = handler; },
    unroute: async function (_pattern: string, handler: (route: any, request: any) => Promise<void>) { if (this.routeHandler === handler) this.routeHandler = null; },
    routeRequest: async function (url: string, navigation = true, topLevel = true, frameUnavailable = false) {
      let outcome = await this.contextValue.dispatchRoute(this, url, navigation, topLevel, frameUnavailable);
      if (outcome === "continued" && navigation && topLevel && this.fetchEnabled) {
        const requestId = `fetch-${this.gotoCalls}-${url}`;
        this.activeCdp.emit("Fetch.requestPaused", { requestId, request: { url }, frameId: "main-frame", resourceType: "Document" });
        await Promise.resolve();
        await Promise.resolve();
        outcome = this.activeCdp.decisions.get(requestId) ?? outcome;
      }
      return outcome;
    },
    navigate: async function (url: string) {
      if (await this.routeRequest(url, true) === "aborted") throw new Error("navigation aborted");
      const redirected = this.redirects.get(url);
      if (redirected) {
        if (await this.routeRequest(redirected, true) === "aborted") throw new Error("redirect aborted");
        this.currentUrl = redirected;
      } else {
        this.currentUrl = url;
      }
      this.eventHandlers.framenavigated?.(mainFrame);
    },
    goto: async function (url: string) { await this.navigate(url); this.gotoCalls += 1; },
    reload: async function () { await this.navigate(this.currentUrl); },
    locator: function () {
      return {
        click: async () => {
          if (this.popupTarget) {
            const popup = fakePage(`popup-${this.targetId}`);
            popup.contextValue = this.contextValue;
            popup.openerValue = this;
            this.lastPopup = popup;
            if (this.autoAttachPages) {
              this.activeCdp.emit("Target.attachedToTarget", { targetInfo: { targetId: popup.targetId, type: "page", openerId: this.targetId } });
              await Promise.resolve();
              await Promise.resolve();
              if (this.activeCdp.closedTargets.has(popup.targetId)) popup.closed = true;
            }
            if (!popup.closed) await popup.routeRequest(this.popupTarget, true, true, this.popupFirstFrameUnavailable);
            this.eventHandlers.popup?.(popup);
          }
          if (this.clickTarget) await this.navigate(this.clickTarget);
        },
        fill: async () => undefined,
        press: async (key: string) => { this.actionCalls.push(`press:${key}`); },
        selectOption: async (option: string | { value: string }) => { const value = typeof option === "string" ? option : option.value; this.actionCalls.push(`select:${value}`); return [value]; },
        check: async () => { this.actionCalls.push("check"); },
        uncheck: async () => { this.actionCalls.push("uncheck"); },
        hover: async () => { this.actionCalls.push("hover"); },
        scrollIntoViewIfNeeded: async () => { this.actionCalls.push("scroll"); },
      };
    },
    evaluateResults: [] as unknown[],
    evaluateHang: false,
    screenshotImpl: null as null | ((options: { path: string; timeout?: number }) => Promise<void>),
    screenshot: async function (options: { path: string; timeout?: number }) {
      if (this.screenshotImpl) return this.screenshotImpl(options);
      throw new Error("screenshot unavailable");
    },
    evaluate: async function () {
      this.evaluateCalls = (this.evaluateCalls ?? 0) + 1;
      if (this.evaluateHang && this.evaluateCalls === 2) return new Promise(() => undefined);
      return this.evaluateResults.shift() ?? (this.evaluateCalls === 1 ? { bodyText: "Fixture", elements: [] } : null);
    },
  };
  return page;
}

function fakeCdp(page: any) {
  const handlers: Record<string, (event: any) => void> = {};
  const decisions = new Map<string, string>();
  const closedTargets = new Set<string>();
  return {
    decisions,
    closedTargets,
    on: (event: string, handler: (payload: any) => void) => { handlers[event] = handler; },
    off: (event: string, handler: (payload: any) => void) => { if (handlers[event] === handler) delete handlers[event]; },
    emit: (event: string, payload: any) => { handlers[event]?.(payload); },
    send: async (method: string, params?: any) => {
      if (method === "Target.getTargetInfo") return { targetInfo: { targetId: page.targetId } };
      if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "main-frame" } } };
      if (method === "Page.addScriptToEvaluateOnNewDocument") return { identifier: "bridge-script" };
      if (method === "Fetch.enable") { page.fetchEnabled = true; return {}; }
      if (method === "Fetch.disable") { page.fetchEnabled = false; return {}; }
      if (method === "Fetch.continueRequest") { decisions.set(params.requestId, "continued"); return {}; }
      if (method === "Fetch.failRequest") { decisions.set(params.requestId, "aborted"); return {}; }
      if (method === "Target.setAutoAttach") { page.autoAttachPages = params.autoAttach === true; return {}; }
      if (method === "Target.closeTarget") { closedTargets.add(params.targetId); return { success: true }; }
      return {};
    },
    detach: async () => undefined,
  };
}
