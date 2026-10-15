import type { LocatorLayout } from "../domain/types.js";

/** Serialized into the selected page; standard DOM observations, no caller expressions. */
export function readLocatorLayout(elements: Element[]): LocatorLayout {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const empty = { count: elements.length, rect: null, viewport, inViewport: false, unobstructed: false };
  if (elements.length !== 1) return empty;
  const element = elements[0]!;
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const rect = { x: box.x, y: box.y, width: box.width, height: box.height };
  const visible = box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
  const inViewport = visible && box.left >= 0 && box.top >= 0 && box.right <= viewport.width && box.bottom <= viewport.height;
  const x = box.left + box.width / 2, y = box.top + box.height / 2;
  let hit = x >= 0 && y >= 0 && x < viewport.width && y < viewport.height ? document.elementFromPoint(x, y) : null;
  for (let depth = 0; hit?.shadowRoot && depth < 8; depth++) {
    const inner = hit.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === hit) break;
    hit = inner;
  }
  return { count: 1, rect, viewport, inViewport, unobstructed: Boolean(visible && hit && (element === hit || element.contains(hit))) };
}
