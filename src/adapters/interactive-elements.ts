import type { BrowserLocator, InteractiveElement, InteractiveElementBounds, InteractiveElements } from "../domain/types.js";
import { MAX_ACCESSIBLE_NAME_CHARS, MAX_INTERACTIVE_ELEMENTS, MAX_INTERACTIVE_TEXT_CHARS, MAX_LOCATOR_CHARS } from "../domain/types.js";
import { boundText } from "../core/redaction.js";

/**
 * Values collected in the page context before the transport validates a
 * locator. The page intentionally reports no control value; text controls
 * expose only their label/name metadata.
 */
export interface RawInteractiveElement {
  tag: string;
  id: string | null;
  testId: string | null;
  role: string | null;
  label: string;
  labelTruncated: boolean;
  name: string;
  nameTruncated: boolean;
  text: string;
  textTruncated: boolean;
  visible: boolean;
  enabled: boolean;
  checked: boolean | null;
  bounds: InteractiveElementBounds | null;
}

export interface RawInteractiveElements {
  elements: RawInteractiveElement[];
  truncated: boolean;
}

/**
 * This function is serialized and executed in the selected browser page.
 * Keep it self-contained: Playwright/WebDriver only receive its function
 * body, not this module's lexical scope.
 */
export function discoverInteractiveElements(): RawInteractiveElements {
  const MAX_ELEMENTS = 64;
  const MAX_SCAN = 512;
  const TEXT_LIMIT = 300;
  const LOCATOR_LIMIT = 500;
  const INTERACTIVE_ROLES = new Set([
    "button", "checkbox", "combobox", "link", "listbox", "menuitem", "menuitemcheckbox",
    "menuitemradio", "option", "radio", "searchbox", "slider", "spinbutton", "switch",
    "tab", "textbox", "treeitem",
  ]);

  const clean = (value: string | null | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();
  const bounded = (value: string, limit: number): { value: string; truncated: boolean } => {
    const normalized = clean(value);
    return { value: normalized.slice(0, limit), truncated: normalized.length > limit };
  };
  const boundedAttribute = (value: string | null, limit: number): string | null => {
    const normalized = clean(value);
    return normalized.length > 0 && normalized.length <= limit ? normalized : null;
  };
  const round = (value: number): number => Math.round(value * 100) / 100;
  const isTextControl = (element: Element): boolean => {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
    if (!(element instanceof HTMLInputElement)) return element.getAttribute("contenteditable") === "true";
    return !["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"].includes(element.type.toLowerCase());
  };
  const labelTextFor = (element: Element): string => {
    const labels = Array.from(document.querySelectorAll("label"));
    const associated = element.id ? labels.find((label) => label.htmlFor === element.id) : undefined;
    const parent = element.closest("label");
    return clean(associated?.innerText || associated?.textContent || parent?.innerText || parent?.textContent || "");
  };
  const labelledByTextFor = (element: Element): string => {
    const ids = clean(element.getAttribute("aria-labelledby")).split(" ").filter(Boolean);
    return clean(ids.map((id) => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || "").join(" "));
  };
  const implicitRoleFor = (element: Element): string | null => {
    const explicit = clean(element.getAttribute("role")).split(" ")[0];
    if (explicit) return explicit;
    const tag = element.tagName.toLowerCase();
    if (tag === "button" || tag === "summary") return "button";
    if (tag === "a" && element.hasAttribute("href")) return "link";
    if (tag === "select") return (element as HTMLSelectElement).multiple ? "listbox" : "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const type = (element as HTMLInputElement).type.toLowerCase();
      if (["button", "image", "reset", "submit"].includes(type)) return "button";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "number") return "spinbutton";
      if (type === "search") return "searchbox";
      return "textbox";
    }
    if (element.getAttribute("contenteditable") === "true") return "textbox";
    return null;
  };
  const textFor = (element: Element): { value: string; truncated: boolean } => {
    if (isTextControl(element)) return { value: "", truncated: false };
    const html = element as HTMLElement;
    return bounded(html.innerText || element.textContent || "", TEXT_LIMIT);
  };
  const nameFor = (element: Element, role: string | null, label: string, text: string): { value: string; truncated: boolean } => {
    const aria = clean(element.getAttribute("aria-label"));
    const labelledBy = labelledByTextFor(element);
    const placeholder = clean(element.getAttribute("placeholder"));
    const title = clean(element.getAttribute("title"));
    if (isTextControl(element)) return bounded(aria || labelledBy || label || placeholder || title, TEXT_LIMIT);
    return bounded(aria || labelledBy || label || text || title || (role === "option" ? clean(element.textContent) : ""), TEXT_LIMIT);
  };
  const isHidden = (element: Element): boolean => {
    let current: Element | null = element;
    while (current) {
      if (current.getAttribute("aria-hidden") === "true") return true;
      current = current.parentElement;
    }
    const style = getComputedStyle(element);
    const rects = element.getClientRects();
    return style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || rects.length === 0;
  };
  const isEnabled = (element: Element): boolean => {
    const nativeDisabled = ("disabled" in element) && (element as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled === true;
    return !nativeDisabled && element.getAttribute("aria-disabled") !== "true";
  };
  const checkedFor = (element: Element, role: string | null): boolean | null => {
    if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type.toLowerCase())) return element.checked;
    if (["checkbox", "radio", "switch", "menuitemcheckbox", "menuitemradio"].includes(role ?? "")) {
      const value = element.getAttribute("aria-checked");
      return value === "true" ? true : value === "false" ? false : null;
    }
    return null;
  };
  const isInteractive = (element: Element, role: string | null): boolean => {
    const tag = element.tagName.toLowerCase();
    const native = tag === "button" || tag === "summary" || tag === "select" || tag === "textarea"
      || tag === "input" || (tag === "a" && element.hasAttribute("href"));
    const rawTabIndex = element.getAttribute("tabindex");
    const tabIndex = rawTabIndex === null ? null : Number(rawTabIndex);
    return native || Boolean(role && INTERACTIVE_ROLES.has(role)) || tabIndex !== null && Number.isInteger(tabIndex) && tabIndex >= 0 || element.getAttribute("contenteditable") === "true";
  };

  const all = Array.from(document.querySelectorAll("button, a[href], input, select, textarea, summary, [role], [tabindex], [contenteditable='true']")).slice(0, MAX_SCAN);
  const elements: RawInteractiveElement[] = [];
  for (const element of all) {
    const role = implicitRoleFor(element);
    if (!isInteractive(element, role) || isHidden(element)) continue;
    const labelResult = bounded(labelTextFor(element), TEXT_LIMIT);
    const textResult = textFor(element);
    const nameResult = nameFor(element, role, labelResult.value, textResult.value);
    const rect = element.getBoundingClientRect();
    const bounds = Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.width) && Number.isFinite(rect.height)
      ? { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) }
      : null;
    elements.push({
      tag: element.tagName.toLowerCase().slice(0, 40),
      id: boundedAttribute(element.getAttribute("id"), LOCATOR_LIMIT),
      testId: boundedAttribute(element.getAttribute("data-testid"), LOCATOR_LIMIT),
      role: role ? bounded(role, 100).value : null,
      label: labelResult.value,
      labelTruncated: labelResult.truncated,
      name: nameResult.value,
      nameTruncated: nameResult.truncated,
      text: textResult.value,
      textTruncated: textResult.truncated,
      visible: true,
      enabled: isEnabled(element),
      checked: checkedFor(element, role),
      bounds,
    });
    if (elements.length >= MAX_ELEMENTS) break;
  }
  return { elements, truncated: all.length >= MAX_SCAN || elements.length >= MAX_ELEMENTS && all.length > elements.length };
}

export function interactiveElementsScript(): string {
  return `return (${discoverInteractiveElements.toString()})();`;
}

export function parseRawInteractiveElements(value: unknown): RawInteractiveElements | null {
  if (!isRecord(value) || !Array.isArray(value.elements)) return null;
  const elements = value.elements.slice(0, MAX_INTERACTIVE_ELEMENTS).flatMap((item) => parseRawInteractiveElement(item));
  return {
    elements,
    truncated: value.truncated === true || value.elements.length > MAX_INTERACTIVE_ELEMENTS,
  };
}

export function chromiumInteractiveLocator(raw: RawInteractiveElement): BrowserLocator | null {
  if (raw.testId) return { kind: "testId", value: boundText(raw.testId, MAX_LOCATOR_CHARS) };
  if (raw.label && !raw.labelTruncated) return { kind: "label", text: boundText(raw.label, MAX_LOCATOR_CHARS) };
  if (raw.role && isKnownInteractiveRole(raw.role) && raw.name && !raw.nameTruncated && !raw.labelTruncated && !raw.textTruncated) {
    return { kind: "role", role: boundText(raw.role, 100), name: boundText(raw.name, MAX_ACCESSIBLE_NAME_CHARS) };
  }
  if (raw.id) return { kind: "css", value: `#${cssEscape(raw.id)}` };
  if (raw.text && !raw.textTruncated && raw.text.length <= MAX_LOCATOR_CHARS) return { kind: "text", text: raw.text };
  return null;
}

export function safariInteractiveLocator(raw: RawInteractiveElement): BrowserLocator | null {
  if (raw.testId) return { kind: "css", value: `[data-testid="${cssString(raw.testId)}"]` };
  if (raw.id) return { kind: "css", value: `#${cssEscape(raw.id)}` };
  return null;
}

export function normalizeInteractiveElement(
  raw: RawInteractiveElement,
  locator: BrowserLocator,
  probe: { count?: number; visible?: boolean; enabled?: boolean; checked?: boolean } = {},
): InteractiveElement {
  const matchCount = typeof probe.count === "number" && Number.isInteger(probe.count) && probe.count >= 0 ? probe.count : 0;
  return {
    tag: boundText(raw.tag, 40),
    role: raw.role ? boundText(raw.role, 100) : null,
    name: boundText(raw.name, MAX_ACCESSIBLE_NAME_CHARS),
    text: boundText(raw.text, MAX_INTERACTIVE_TEXT_CHARS),
    locator,
    matchCount,
    uniqueAtCapture: matchCount === 1,
    visible: probe.visible ?? raw.visible,
    enabled: probe.enabled ?? raw.enabled,
    checked: raw.checked === null ? null : probe.checked ?? raw.checked,
    bounds: raw.bounds,
  };
}

export function isKnownInteractiveRole(role: string): boolean {
  return new Set([
    "button", "checkbox", "combobox", "link", "listbox", "menuitem", "menuitemcheckbox",
    "menuitemradio", "option", "radio", "searchbox", "slider", "spinbutton", "switch",
    "tab", "textbox", "treeitem",
  ]).has(role);
}

function parseRawInteractiveElement(value: unknown): RawInteractiveElement[] {
  if (!isRecord(value)) return [];
  const tag = typeof value.tag === "string" ? value.tag : null;
  const name = typeof value.name === "string" ? value.name : null;
  const text = typeof value.text === "string" ? value.text : null;
  if (!tag || name === null || text === null) return [];
  const bounds = parseBounds(value.bounds);
  return [{
    tag,
    id: optionalString(value.id),
    testId: optionalString(value.testId),
    role: optionalString(value.role),
    label: typeof value.label === "string" ? value.label : "",
    labelTruncated: value.labelTruncated === true,
    name,
    nameTruncated: value.nameTruncated === true,
    text,
    textTruncated: value.textTruncated === true,
    visible: value.visible === true,
    enabled: value.enabled === true,
    checked: value.checked === true ? true : value.checked === false ? false : null,
    bounds,
  }];
}

function parseBounds(value: unknown): InteractiveElementBounds | null {
  if (!isRecord(value)) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const width = finiteNumber(value.width);
  const height = finiteNumber(value.height);
  if (x === null || y === null || width === null || height === null || width < 0 || height < 0) return null;
  return { x, y, width, height };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function cssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, "\\A ");
}
