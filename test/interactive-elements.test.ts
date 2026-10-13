import { describe, expect, it } from "vitest";

import {
  chromiumInteractiveLocator,
  normalizeInteractiveElement,
  parseRawInteractiveElements,
  safariInteractiveLocator,
  type RawInteractiveElement,
} from "../src/adapters/interactive-elements.js";

function raw(overrides: Partial<RawInteractiveElement> = {}): RawInteractiveElement {
  return {
    tag: "button",
    id: "submit",
    testId: null,
    role: "button",
    label: "",
    labelTruncated: false,
    name: "Submit payment",
    nameTruncated: false,
    text: "Submit payment",
    textTruncated: false,
    visible: true,
    enabled: true,
    checked: null,
    bounds: { x: 10, y: 20, width: 120, height: 40 },
    ...overrides,
  };
}

describe("interactive element capture helpers", () => {
  it("prefers semantic Chromium locators and stable CSS Safari locators", () => {
    const button = raw();
    const input = raw({
      tag: "input",
      id: "amount",
      role: "textbox",
      label: "Amount",
      name: "Amount",
      text: "",
      checked: null,
    });
    const testId = raw({ id: null, testId: "payment-submit" });

    expect(chromiumInteractiveLocator(button)).toEqual({ kind: "role", role: "button", name: "Submit payment" });
    expect(chromiumInteractiveLocator(input)).toEqual({ kind: "label", text: "Amount" });
    expect(chromiumInteractiveLocator(testId)).toEqual({ kind: "testId", value: "payment-submit" });
    expect(safariInteractiveLocator(button)).toEqual({ kind: "css", value: "#submit" });
    expect(safariInteractiveLocator(testId)).toEqual({ kind: "css", value: "[data-testid=\"payment-submit\"]" });
  });

  it("does not turn truncated names or unstable semantic-only Safari candidates into unsafe locators", () => {
    expect(chromiumInteractiveLocator(raw({ nameTruncated: true, id: null, text: "" }))).toBeNull();
    expect(safariInteractiveLocator(raw({ id: null, testId: null }))).toBeNull();
  });

  it("bounds parsed candidates and derives uniqueness from the live count", () => {
    const parsed = parseRawInteractiveElements({
      truncated: false,
      elements: [raw({ name: "Field", text: "" }), ...Array.from({ length: 64 }, () => raw()), { invalid: true }],
    });
    expect(parsed?.elements).toHaveLength(64);
    expect(parsed?.truncated).toBe(true);

    const element = normalizeInteractiveElement(raw({ checked: false }), { kind: "role", role: "checkbox", name: "Choice" }, {
      count: 2,
      visible: true,
      enabled: false,
      checked: true,
    });
    expect(element).toMatchObject({ matchCount: 2, uniqueAtCapture: false, enabled: false, checked: true });
    expect(JSON.stringify(element)).not.toContain("private-input-value");
  });
});
