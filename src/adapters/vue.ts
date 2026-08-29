import type { Page } from "playwright-core";

import type { VueSnapshot } from "../domain/types.js";

/** Reads only the bounded snapshot exported by the pre-document Vue bridge. */
export class VueAdapter {
  async snapshot(page: Page): Promise<VueSnapshot | null> {
    return page.evaluate(() => {
      const bridge = (window as Window & {
        __WEB_DEBUG_VUE__?: { snapshot?: () => VueSnapshot | null };
      }).__WEB_DEBUG_VUE__;
      return bridge?.snapshot?.() ?? null;
    });
  }
}
