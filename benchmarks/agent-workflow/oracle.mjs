// Withheld independent black-box grader; never copied into model workspaces.
import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";
const [kind, url, out] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, executablePath: process.env.BENCH_CHROME });
const trials = [];
async function waitUntil(read, expected, timeout = 5_000) {
  const end = Date.now() + timeout;
  while (true) { const value = await read(); if (value === expected) return value; if (Date.now() > end) return value; await new Promise(resolve => setTimeout(resolve, 25)); }
}
try {
  for (let repetition = 1; repetition <= 3; repetition++) {
    const context = await browser.newContext({ viewport: { width: 1_440, height: 900 } });
    const page = await context.newPage(); const errors = [];
    page.setDefaultTimeout(5_000);
    page.on("pageerror", error => errors.push(error.message));
    const checks = {}, network = [];
    page.on("response", response => { if (response.request().method() === "POST") network.push({ url: response.url(), status: response.status() }); });
    try {
      if (kind === "forms") await page.goto(`${url}/api/bench-reset`);
      await page.goto(url);
      if (kind === "todo") {
        const input = page.locator(".new-todo");
        for (const title of ["Reference Alpha", "Reference Beta", "Reference Gamma"]) { await input.fill(title); await input.press("Enter"); }
        await page.locator(".todo-list li:nth-child(1) .toggle").check();
        await page.locator(".todo-list li:nth-child(3) .toggle").check();
        await page.locator(".clear-completed").click();
        checks.clearKeepsOneActive = await page.locator(".todo-list li:not(.completed)").count() === 1;
        checks.clearRemovesCompleted = await page.locator(".todo-list li.completed").count() === 0;
        checks.keepsCorrectItem = (await page.locator(".todo-list").innerText()).includes("Reference Beta");
        await page.locator("a[href='#/active']").click();
        checks.activeFilter = await page.locator(".todo-list li").count() === 1;
        await page.locator(".new-todo").fill("Reference Delta"); await input.press("Enter");
        checks.addStillWorks = await page.locator(".todo-list li").count() === 2;
        await page.locator(".toggle-all-label").click();
        await page.locator("a[href='#/completed']").click();
        checks.completedFilter = await page.locator(".todo-list li").count() === 2;
        await page.locator(".clear-completed").click();
        checks.clearAll = await page.locator(".todo-list li").count() === 0;
      } else if (kind === "grid") {
        await page.locator("input[name=query]").fill("e");
        checks.filterCount = await waitUntil(() => page.locator("tbody tr").count(), 3) === 3;
        await page.locator("th").first().click();
        checks.filteredDescending = await waitUntil(() => page.locator("tbody tr:first-child td:first-child").innerText(), "Jet Li") === "Jet Li";
        await page.locator("th").first().click();
        checks.filteredAscending = await waitUntil(() => page.locator("tbody tr:first-child td:first-child").innerText(), "Bruce Lee") === "Bruce Lee";
        await page.locator("input[name=query]").fill("");
        checks.clearFilterCount = await waitUntil(() => page.locator("tbody tr").count(), 4) === 4;
        await page.locator("th").nth(1).click();
        checks.powerDescending = await waitUntil(() => page.locator("tbody tr:first-child td:first-child").innerText(), "Chuck Norris") === "Chuck Norris";
        await page.locator("th").nth(1).click();
        checks.powerAscending = await waitUntil(() => page.locator("tbody tr:first-child td:first-child").innerText(), "Jackie Chan") === "Jackie Chan";
        await page.locator("input[name=query]").fill("jAcKiE");
        checks.caseInsensitive = await waitUntil(() => page.locator("tbody tr").count(), 1) === 1;
      } else {
        await page.locator("#todo").fill("Reference task");
        await page.getByRole("button", { name: "Add", exact: true }).click();
        checks.add = await waitUntil(() => page.locator("main > ul > li").count(), 2) === 2;
        await page.locator("main > ul > li:nth-child(2) button").click();
        checks.deleteImmediate = await waitUntil(() => page.locator("main > ul > li").count(), 1) === 1;
        await page.reload();
        checks.deletePersists = await page.locator("main > ul > li").count() === 1;
        checks.existingPreserved = (await page.locator("main > ul").innerText()).includes("Existing task");
        await page.locator("#todo").fill("Another reference");
        await page.getByRole("button", { name: "Add", exact: true }).click();
        checks.addAfterDelete = await waitUntil(() => page.locator("main > ul > li").count(), 2) === 2;
        checks.realPostRequests = network.length >= 3 && network.every(entry => entry.status === 200);
      }
      checks.noPageErrors = errors.length === 0;
      trials.push({ repetition, checks, passed: Object.values(checks).every(Boolean) });
    } catch (error) { trials.push({ repetition, checks, passed: false, error: error.message }); }
    finally { await context.close(); }
  }
} finally { await browser.close(); }
const result = { independentGrader: "ordinary-playwright-black-box-v1", actualAttempts: trials.length, passed: trials.length === 3 && trials.every(trial => trial.passed), trials };
await writeFile(out, JSON.stringify(result, null, 2));
process.stdout.write(JSON.stringify(result) + "\n");
