import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createServer } from "../src/index.js";

describe("MCP server contract", () => {
  it("exposes the documented small tool surface", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    const client = new Client({ name: "web-debug-mcp-test-client", version: "0.1.0" });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "web_breakpoint_set",
      "web_browser_action",
      "web_debug_control",
      "web_debug_evaluate",
      "web_fix_verify",
      "web_issue_capture",
      "web_next_inspect",
      "web_project_detect",
      "web_replay_seek",
      "web_repro_record",
      "web_session_close",
      "web_session_start",
      "web_session_status",
    ]);
    const replayTool = listed.tools.find((tool) => tool.name === "web_replay_seek");
    expect(replayTool?.description).toContain("mutate live state");
    expect(replayTool?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
    const sessionTool = listed.tools.find((tool) => tool.name === "web_session_start");
    expect(sessionTool?.description).toContain("Chromium or Safari");
    expect(sessionTool?.inputSchema.properties).toHaveProperty("viewport");

    const result = await client.callTool({
      name: "web_project_detect",
      arguments: { projectRoot: resolve("fixtures/vanilla") },
    });
    expect(result.isError).not.toBe(true);
    const text = result.content?.find((item) => item.type === "text");
    expect(text && "text" in text ? text.text : "").toContain('"vanilla"');

    await client.close();
    await server.close();
  });
});
