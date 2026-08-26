import type { Page } from "playwright-core";

import type { ReactSnapshot } from "../domain/types.js";

/**
 * Reads the opt-in bridge exposed by a development React app.
 *
 * The bridge is deliberately explicit: the adapter never walks arbitrary page
 * globals or assumes that a production React DevTools hook is present.
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
