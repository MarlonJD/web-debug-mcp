import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SafariMcpClient } from "../src/adapters/safari-client.js";

let directory: string;
let driver: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "web-debug-native-driver-test-"));
  driver = join(directory, "driver.mjs");
  await writeFile(driver, `#!${process.execPath}
import { createInterface } from 'node:readline';
const tools = ${JSON.stringify(["list_tabs", "create_tab", "close_tab", "switch_tab", "navigate_to_url", "page_info", "get_page_content", "evaluate_javascript", "page_interactions", "browser_console_messages", "list_network_requests", "screenshot", "set_viewport_size"])};
const send = (id,result) => process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\\n');
createInterface({input:process.stdin}).on('line',line=>{
 const request = JSON.parse(line);
 if(request.method==='initialize') return send(request.id,{protocolVersion:'2025-11-25',serverInfo:{name:'Safari test',version:'1'},capabilities:{tools:{}}});
 if(request.method==='tools/list') return send(request.id,{tools:tools.map(name=>({name,inputSchema:{type:'object'}}))});
 if(request.method!=='tools/call') return;
 const mode=request.params.arguments.mode;
 if(mode==='stall') return;
 if(mode==='oversize') return send(request.id,{content:[{type:'text',text:'x'.repeat(300000)}]});
 if(mode==='busy') return send(request.id,{isError:true,content:[{type:'text',text:'Safari is already paired with another WebDriver session.'}]});
 send(request.id,{content:[{type:'text',text:JSON.stringify([{text:'real protocol envelope',level:'info'}])}]});
});
`);
  await chmod(driver, 0o700);
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

describe("bounded native Safari client", () => {
  it("negotiates the real stdio protocol and parses native JSON without exposing another public catalog", async () => {
    const client = new SafariMcpClient(driver);
    try {
      await client.connect();
      expect(await client.call("browser_console_messages")).toEqual([{ text: "real protocol envelope", level: "info" }]);
      expect(client.isConnected()).toBe(true);
    } finally { await client.close(); }
    expect(client.isConnected()).toBe(false);
  });

  it("reports conflicting ownership without adopting the other client", async () => {
    const client = new SafariMcpClient(driver);
    try {
      await client.connect();
      await expect(client.call("create_tab", { mode: "busy" })).rejects.toMatchObject({ code: "SAFARI_SESSION_IN_USE" });
    } finally { await client.close(); }
  });

  it("closes a timed-out transport so late actions cannot contaminate the next attempt", async () => {
    const client = new SafariMcpClient(driver);
    try {
      await client.connect();
      await expect(client.call("create_tab", { mode: "stall" }, { deadline: performance.now() + 30 })).rejects.toMatchObject({ code: "SAFARI_MCP_TIMEOUT" });
      expect(client.isConnected()).toBe(false);
    } finally { await client.close(); }
  });

  it("keeps cancellation distinct from timeout", async () => {
    const client = new SafariMcpClient(driver);
    try {
      await client.connect();
      const controller = new AbortController();
      const result = client.call("create_tab", { mode: "stall" }, { signal: controller.signal }).catch(error => error);
      controller.abort();
      expect(await result).toMatchObject({ code: "REQUEST_CANCELLED" });
      expect(client.isConnected()).toBe(false);
    } finally { await client.close(); }
  });

  it("disconnects on an oversized native frame instead of returning partial evidence", async () => {
    const client = new SafariMcpClient(driver);
    try {
      await client.connect();
      await expect(client.call("browser_console_messages", { mode: "oversize" })).rejects.toThrow();
      expect(client.isConnected()).toBe(false);
    } finally { await client.close(); }
  });
});
