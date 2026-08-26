import type { Page } from "playwright-core";

import type { ReactSnapshot } from "../domain/types.js";

/**
 * Reads the bridge injected into a development page before React loads.
 *
 * The bridge is deliberately bounded: the adapter never walks arbitrary page
 * globals or exposes the raw React DevTools hook.
 */
export class ReactAdapter {
  async snapshot(page: Page): Promise<ReactSnapshot | null> {
    return page.evaluate(() => {
      const bridge = (window as Window & {
        __WEB_DEBUG_REACT__?: { snapshot?: () => ReactSnapshot | null };
      }).__WEB_DEBUG_REACT__;
      return bridge?.snapshot?.() ?? null;
    });
  }
}
