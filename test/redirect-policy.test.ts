import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { NextAdapter } from "../src/adapters/next.js";
import { ViteAdapter } from "../src/adapters/vite.js";
import { runDoctor } from "../src/core/doctor.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("local endpoint redirect policy", () => {
  it("does not follow framework or doctor redirects to another origin", async () => {
    let destinationHits = 0;
    const destination = createServer((_request, response) => { destinationHits += 1; response.writeHead(200).end("{}"); });
    servers.push(destination);
    const destinationPort = await listen(destination);
    const source = createServer((_request, response) => {
      response.writeHead(302, { location: `http://127.0.0.1:${destinationPort}/escaped` }).end();
    });
    servers.push(source);
    const sourcePort = await listen(source);
    const baseUrl = `http://127.0.0.1:${sourcePort}/`;

    await expect(new ViteAdapter().snapshot(baseUrl)).rejects.toThrow(/HTTP 302/);
    await expect(new NextAdapter().listTools(baseUrl)).rejects.toThrow(/HTTP 302/);
    const doctor = await runDoctor({ projectRoot: "fixtures/vanilla", browser: "chromium", cdpEndpoint: baseUrl });
    expect(doctor.checks).toContainEqual(expect.objectContaining({ id: "browser", status: "fail" }));
    expect(destinationHits).toBe(0);
  });
});

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") reject(new Error("Expected TCP server address."));
      else resolve(address.port);
    });
  });
}
