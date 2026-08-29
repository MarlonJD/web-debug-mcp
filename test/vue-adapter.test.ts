import vm from "node:vm";

import type { Page } from "playwright-core";
import { describe, expect, it, vi } from "vitest";

import { VueAdapter } from "../src/adapters/vue.js";
import { VUE_DEBUG_BRIDGE_SCRIPT } from "../src/adapters/vue-bridge.js";
import type { VueSnapshot } from "../src/domain/types.js";

describe("Vue 3 development adapter", () => {
  it("reads only the page bridge snapshot", async () => {
    const expected: VueSnapshot = { detected: true, version: "3.5.42", appCount: 1, componentCount: 0, components: [], truncated: false, warnings: [] };
    const page = { evaluate: vi.fn().mockResolvedValue(expected) } as unknown as Page;
    await expect(new VueAdapter().snapshot(page)).resolves.toEqual(expected);
  });

  it("chains an existing hook and records exact Vue 3 component payloads", () => {
    const events = new Map<string, Set<(...args: unknown[]) => void>>();
    const on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const handlers = events.get(event) ?? new Set();
      handlers.add(handler);
      events.set(event, handlers);
    });
    const off = vi.fn((event: string, handler: (...args: unknown[]) => void) => events.get(event)?.delete(handler));
    const emit = vi.fn((event: string, ...args: unknown[]) => {
      for (const handler of events.get(event) ?? []) handler(...args);
    });
    const hook = { enabled: false, appRecords: [], on, off, once: vi.fn(), emit, sentinel: "preserved" };
    const windowValue = { __VUE_DEVTOOLS_GLOBAL_HOOK__: hook } as Record<string, unknown>;
    class FakeNode {}
    vm.runInNewContext(VUE_DEBUG_BRIDGE_SCRIPT, { window: windowValue, Node: FakeNode, Set, Map, WeakMap, Object, Array, JSON, String, Number, Boolean, RegExp });
    expect(windowValue.__VUE_DEVTOOLS_GLOBAL_HOOK__).toBe(hook);
    expect(hook.sentinel).toBe("preserved");
    const app = {};
    const root = { type: { name: "App", __file: "/src/App.vue" }, props: {}, data: {}, setupState: {}, exposed: null };
    const child = { type: { name: "CheckoutForm", __file: "/src/CheckoutForm.vue" }, props: { currency: "TRY" }, data: { submitted: false, token: "secret" }, setupState: {}, exposed: null };
    emit("component:added", app, 1, undefined, root);
    emit("component:added", app, 2, 1, child);
    emit("app:init", app, "3.5.42", {});
    const bridge = windowValue.__WEB_DEBUG_VUE__ as { snapshot: () => VueSnapshot; dispose: () => void };
    const first = bridge.snapshot();
    expect(first.version).toBe("3.5.42");
    expect(first.components[0]?.children[0]?.props.currency).toBe("TRY");
    expect(first.components[0]?.children[0]?.state["data.token"]).toBe("[REDACTED]");
    child.data.submitted = true;
    emit("component:updated", app, 2, 1, child);
    const second = bridge.snapshot();
    expect(second.components[0]?.children[0]?.updateCount).toBe(1);
    expect(second.components[0]?.children[0]?.changedStateKeys).toContain("data.submitted");
    bridge.dispose();
    expect(off).toHaveBeenCalled();
  });

  it("does not replace or wrap an unchainable existing hook", () => {
    const hook = { enabled: true, emit: vi.fn() };
    const windowValue = { __VUE_DEVTOOLS_GLOBAL_HOOK__: hook } as Record<string, unknown>;
    vm.runInNewContext(VUE_DEBUG_BRIDGE_SCRIPT, { window: windowValue, Set, Map, WeakMap, Object, Array, JSON, String, Number, Boolean, RegExp });
    expect(windowValue.__VUE_DEVTOOLS_GLOBAL_HOOK__).toBe(hook);
    const bridge = windowValue.__WEB_DEBUG_VUE__ as { snapshot: () => VueSnapshot };
    expect(bridge.snapshot()).toMatchObject({ detected: true, appCount: 0, componentCount: 0 });
    expect(bridge.snapshot().warnings.join(" ")).toContain("cannot be safely chained");
  });
});
