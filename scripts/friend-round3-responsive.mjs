import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd(), base = "http://127.0.0.1:3101";
if (process.env.FRIEND_TEST_MODE !== "1" || process.env.DATABASE_URL !== "file:./friend-test.db" || path.resolve(process.env.PRIVATE_UPLOAD_ROOT || "") !== path.join(root, "runtime", "friend-test", "uploads")) throw new Error("Requires isolated friend-test environment.");
const db = new PrismaClient();
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const output = path.join(root, "runtime", "friend-test", "round3-viewport");
await mkdir(output, { recursive: true });
const sessionHashes = [], contexts = [], results = [], errors = [];
const sizes = [[390, 844], [768, 1024], [1440, 900]];
const anonymousRoutes = [["home", "/"], ["login", "/login"], ["register", "/register"], ["map", "/map"], ["projects", "/projects"], ["comparison", "STORY"], ["help", "/help"], ["funds", "/funds"]];
const citizenRoutes = [["report", "/report"], ["tracking", "TRACK"], ["citizen-dashboard", "/dashboard"], ["volunteer-dashboard", "/volunteer"]];
const adminRoutes = [["admin-dashboard", "/admin"], ["case-action-center", "CASE"], ["story-approval", "STORY_ADMIN"]];
function assert(condition, message) { if (!condition) throw new Error(message); }
async function makePage(viewport, userId) {
  const context = await browser.newContext({ viewport: { width: viewport[0], height: viewport[1] }, hasTouch: viewport[0] < 1000 });
  contexts.push(context);
  if (userId) {
    const token = randomBytes(32).toString("hex"), tokenHash = createHash("sha256").update(token).digest("hex");
    await db.session.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) } });
    sessionHashes.push(tokenHash);
    await context.addCookies([{ name: "__Host-kfx_session", value: token, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  }
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => { const issue = request.failure()?.errorText; if (issue && issue !== "net::ERR_ABORTED" && !request.url().includes("tile.openstreetmap.org")) errors.push(`${new URL(request.url()).pathname}: ${issue}`); });
  return page;
}
async function inspect(page, label, href, viewport) {
  const response = await page.goto(`${base}${href}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  assert(response?.status() === 200, `${label} returned ${response?.status()}`);
  if (label === "map") await page.locator(".leaflet-container").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(120);
  const measure = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, title: document.title, main: Boolean(document.querySelector("main")), horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth }));
  const row = { size: `${viewport[0]}x${viewport[1]}`, page: label, status: response.status(), ...measure };
  results.push(row);
  await page.screenshot({ path: path.join(output, `${viewport[0]}-${label}.png`), fullPage: true });
  if (measure.horizontalOverflow > 2) errors.push(`${row.size} ${label}: horizontal overflow ${measure.horizontalOverflow}px`);
  if (!measure.main) errors.push(`${row.size} ${label}: missing main landmark`);
  return row;
}
try {
  const complaint = await db.complaint.findUniqueOrThrow({ where: { reference: "KFX-03006CA6688DFDC6" }, select: { id: true, userId: true, reference: true, completedWorkStory: { select: { id: true, contentApprovedAt: true } } } });
  assert(complaint.userId && complaint.completedWorkStory?.id, "Round 3 QA case or story missing");
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
  for (const viewport of sizes) {
    const publicPage = await makePage(viewport, null);
    for (const [label, route] of anonymousRoutes) await inspect(publicPage, label, route === "STORY" ? `/projects/completed/${complaint.completedWorkStory.id}` : route, viewport);
    await publicPage.goto(`${base}/projects/completed/${complaint.completedWorkStory.id}`);
    const comparison = publicPage.getByRole("slider", { name: "Compare before and after" });
    const beforePosition = Number(await comparison.inputValue());
    await comparison.focus();
    await publicPage.keyboard.press("ArrowRight");
    assert(Number(await comparison.inputValue()) > beforePosition, `${viewport[0]}px comparison slider is not keyboard operable`);
    await publicPage.getByText("View photos side by side").click();
    await publicPage.getByRole("img", { name: /^Before:/ }).waitFor();
    if (viewport[0] === 390) {
      await publicPage.goto(`${base}/`);
      await publicPage.getByLabel("Open navigation").click();
      await publicPage.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Report an issue" }).waitFor();
      await publicPage.goto(`${base}/map`);
      await publicPage.getByLabel("Find a Karachi area or address").fill("Gulshan-e-Iqbal");
      await publicPage.getByRole("button", { name: "Find", exact: true }).click();
      await publicPage.getByRole("button", { name: /Gulshan-e-Iqbal, District East/ }).waitFor({ timeout: 15_000 });
      await publicPage.getByRole("button", { name: /Gulshan-e-Iqbal, District East/ }).click();
      assert(await publicPage.getByLabel("District").inputValue() === "East", "Catalog result did not filter map to District East");
    }
    const citizenPage = await makePage(viewport, complaint.userId);
    for (const [label, route] of citizenRoutes) await inspect(citizenPage, label, route === "TRACK" ? `/track?ref=${complaint.reference}` : route, viewport);
    if (viewport[0] === 390) {
      await citizenPage.goto(`${base}/report`);
      await citizenPage.getByRole("button", { name: "Continue" }).waitFor();
      await citizenPage.getByRole("heading", { name: "Report an issue" }).waitFor();
      await citizenPage.getByRole("combobox", { name: "Issue category *" }).selectOption({ label: "Streetlights" });
      await citizenPage.getByRole("textbox", { name: "Short issue title *" }).fill("[QA TEST] Responsive reporting form check");
      await citizenPage.getByRole("textbox", { name: "Describe the problem *" }).fill("[QA TEST] Fictional issue entered to inspect the mobile reporting steps without submitting it.");
      await citizenPage.getByRole("button", { name: "Continue" }).click();
      await citizenPage.getByRole("combobox", { name: "Karachi district *" }).selectOption({ label: "East" });
      await citizenPage.getByRole("textbox", { name: "Search town or neighborhood *" }).fill("Gulshan-e-Iqbal");
      await citizenPage.getByRole("option", { name: "Gulshan-e-Iqbal", exact: true }).click();
      await citizenPage.locator(".leaflet-container").waitFor({ timeout: 15_000 });
      await citizenPage.screenshot({ path: path.join(output, "390-report-step2.png"), fullPage: true });
      assert(await citizenPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "Mobile report Step 2 overflows");
      await citizenPage.getByRole("button", { name: "Continue" }).click();
      await citizenPage.screenshot({ path: path.join(output, "390-report-step3.png"), fullPage: true });
      assert(await citizenPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "Mobile report Step 3 overflows");
      await citizenPage.getByRole("button", { name: "Continue" }).click();
      await citizenPage.getByRole("heading", { name: "Review your report" }).waitFor();
      await citizenPage.screenshot({ path: path.join(output, "390-report-step4.png"), fullPage: true });
      assert(await citizenPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "Mobile report Step 4 overflows");
    }
    const adminPage = await makePage(viewport, admin.id);
    for (const [label, route] of adminRoutes) await inspect(adminPage, label, route === "CASE" ? `/admin/cases/${complaint.id}` : route === "STORY_ADMIN" ? `/admin/projects/${complaint.id}` : route, viewport);
    await adminPage.goto(`${base}/admin/projects/${complaint.id}`);
    await adminPage.getByRole("status").getByText(/Summaries approved/).waitFor();
    if (viewport[0] === 390) {
      const problem = adminPage.getByRole("textbox", { name: "Public problem summary" });
      await problem.fill(`${await problem.inputValue()} [unsaved QA edit]`);
      await adminPage.getByRole("status").getByText(/These edits are not approved/).waitFor();
      await adminPage.reload();
      await adminPage.getByRole("status").getByText(/Summaries approved/).waitFor();
    }
    console.log(`Viewport ${viewport.join("x")}: ${anonymousRoutes.length + citizenRoutes.length + adminRoutes.length} pages measured`);
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
  assert(errors.length === 0, `Responsive or browser errors: ${errors.join(" | ")}`);
  console.log(`PASS: ${results.length} viewport/page checks; no horizontal overflow or browser errors`);
} finally {
  if (sessionHashes.length) await db.session.deleteMany({ where: { tokenHash: { in: sessionHashes } } });
  for (const context of contexts) await context.close();
  await browser.close();
  await db.$disconnect();
}
