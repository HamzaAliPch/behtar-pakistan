import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3101";
if (base !== "http://127.0.0.1:3101") throw new Error("Browser audit must target the isolated friend-test server.");
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const output = path.join(process.cwd(), "runtime", "friend-test", "screenshots");
await mkdir(output, { recursive: true });
const credentialLines = (await readFile(path.join(process.cwd(), "runtime", "friend-test", "credentials.txt"), "utf8")).split(/\r?\n/);
const testEmail = credentialLines.find(line => line.startsWith("Email:"))?.slice(6).trim();
const testPassword = credentialLines.find(line => line.startsWith("Password:"))?.slice(9).trim();
if (!testEmail || !testPassword) throw new Error("The isolated test citizen account is missing.");
const results = [];
try {
  for (const width of [390, 768]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/login`);
    await page.getByRole("textbox", { name: "Email address" }).fill(testEmail);
    await page.getByLabel("Password").fill(testPassword);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(`${base}/dashboard`);
    for (const route of ["/", "/report", "/map", "/donate"]) {
      const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
      await page.locator("main").waitFor();
      if (route === "/report") await page.getByRole("heading", { name: "Report an issue" }).waitFor();
      if (route === "/map") {
        await page.locator(".leaflet-container").waitFor({ timeout: 15000 });
        await page.waitForFunction(() => document.querySelector(".leaflet-tile-loaded") || document.body.textContent?.includes("Map background is unavailable"), undefined, { timeout: 8000 }).catch(() => undefined);
      }
      const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      const name = `${width}-${route === "/" ? "home" : route.slice(1)}`;
      await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
      const tileState = route === "/map" ? await page.evaluate(() => document.querySelector(".leaflet-tile-loaded") ? "loaded" : document.body.textContent?.includes("Map background is unavailable") ? "unavailable-with-retry" : "still-waiting") : undefined;
      results.push({ width, route, status: response.status(), ...layout, horizontalOverflow: layout.content > layout.viewport + 1, tileState });
      if (route === "/report") {
        await page.getByRole("combobox", { name: "Issue category *" }).selectOption({ label: "Roads & potholes" });
        await page.getByRole("textbox", { name: "Short issue title *" }).fill("QA responsive form check");
        await page.getByRole("textbox", { name: "Describe the problem *" }).fill("Fictional QA report for responsive wizard interaction.");
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("heading", { name: "Where is the issue?" }).waitFor();
        await page.getByRole("button", { name: "Back" }).click();
        if (await page.getByRole("textbox", { name: "Short issue title *" }).inputValue() !== "QA responsive form check") throw new Error(`Report wizard lost input at ${width}px`);
      }
      if (route === "/map") {
        await page.getByRole("combobox", { name: "City" }).selectOption("karachi");
        if (await page.getByRole("combobox", { name: "City" }).inputValue() !== "karachi") throw new Error(`Map city filter did not update at ${width}px`);
        if (tileState === "unavailable-with-retry") await page.getByRole("button", { name: "Retry map tiles" }).click();
      }
    }
    if (errors.length) throw new Error(`Browser errors at ${width}px: ${errors.join(" | ")}`);
    await context.close();
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  for (const result of results) console.log(`${result.width}px ${result.route}: HTTP ${result.status}, overflow ${result.horizontalOverflow ? "YES" : "NO"}${result.tileState ? `, map tiles ${result.tileState}` : ""}`);
  if (results.some(result => result.status !== 200 || result.horizontalOverflow)) process.exitCode = 1;
} finally { await browser.close(); }
