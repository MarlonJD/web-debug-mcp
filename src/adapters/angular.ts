import type { Page } from "playwright-core";

import type { AngularSnapshot } from "../domain/types.js";

/** Reads only the bounded snapshot exported by the pre-document Angular bridge. */
export class AngularAdapter {
  async snapshot(page: Page): Promise<AngularSnapshot | null> {
    return page.evaluate(() => {
      const bridge = (window as Window & {
        __WEB_DEBUG_ANGULAR__?: { snapshot?: () => AngularSnapshot | null };
      }).__WEB_DEBUG_ANGULAR__;
      return bridge?.snapshot?.() ?? null;
    });
  }
}
