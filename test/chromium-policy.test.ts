import { describe, expect, it } from "vitest";

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
});
