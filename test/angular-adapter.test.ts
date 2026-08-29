import vm from "node:vm";

import type { Page } from "playwright-core";
import { describe, expect, it, vi } from "vitest";

import { AngularAdapter } from "../src/adapters/angular.js";
import { ANGULAR_DEBUG_BRIDGE_SCRIPT } from "../src/adapters/angular-bridge.js";
import type { AngularSnapshot } from "../src/domain/types.js";

describe("Angular development adapter", () => {
  it("reads only the page bridge snapshot", async () => {
    const expected: AngularSnapshot = {
      detected: true,
      version: "21.2.22",
      mode: "development",
      treeMode: "dom-host",
      snapshotCount: 1,
      componentCount: 0,
      components: [],
      truncated: false,
      warnings: [],
    };
    const page = { evaluate: vi.fn().mockResolvedValue(expected) } as unknown as Page;
    await expect(new AngularAdapter().snapshot(page)).resolves.toEqual(expected);
  });

  it("builds a bounded DOM-host tree and excludes Angular internals and accessors", () => {
    class FakeNode {}
    class FakeElement extends FakeNode {
      parentElement: FakeElement | null = null;
      tagName: string;
      id = "";
      component: object | null = null;
      constructor(tagName: string) { super(); this.tagName = tagName; }
      getAttribute(name: string) { return name === "ng-version" ? "21.2.22" : null; }
    }
    class RootComponent { title = "Fixture"; __ngContext__ = ["private"]; }
    class ChildComponent {
      submitted = false;
      token = "should-redact";
      get risky() { throw new Error("must not execute"); }
    }
    const root = new FakeElement("APP-ROOT");
    const child = new FakeElement("CHECKOUT-PANEL");
    child.parentElement = root;
    root.component = new RootComponent();
    child.component = new ChildComponent();
    const elements = [root, child];
    const windowValue = {
      ng: { getComponent: (element: FakeElement) => element.component },
    } as Record<string, unknown>;
    const documentValue = {
      querySelector: () => root,
      querySelectorAll: () => elements,
    };
    vm.runInNewContext(ANGULAR_DEBUG_BRIDGE_SCRIPT, { window: windowValue, document: documentValue, Node: FakeNode, Set, Map, WeakMap, Object, Array, JSON, String, Number, Boolean, RegExp });
    const bridge = windowValue.__WEB_DEBUG_ANGULAR__ as { snapshot: () => AngularSnapshot };
    const first = bridge.snapshot();
    expect(first.version).toBe("21.2.22");
    expect(first.componentCount).toBe(2);
    expect(first.components[0]?.children[0]?.state).toMatchObject({ submitted: false, token: "[REDACTED]" });
    expect(first.components[0]?.state).not.toHaveProperty("__ngContext__");
    (child.component as ChildComponent).submitted = true;
    const second = bridge.snapshot();
    expect(second.components[0]?.children[0]?.changedStateKeys).toContain("submitted");
  });
});
