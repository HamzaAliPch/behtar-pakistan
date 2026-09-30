import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";

const root = process.cwd(), base = "http://127.0.0.1:3101";
if (process.env.FRIEND_TEST_MODE !== "1" || process.env.DATABASE_URL !== "file:./friend-test.db" || path.resolve(process.env.PRIVATE_UPLOAD_ROOT || "") !== path.join(root, "runtime", "friend-test", "uploads")) throw new Error("Friend-test isolation required.");
const db = new PrismaClient(), browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const output = path.join(root, "runtime", "friend-test", "phase4b-browser"); await mkdir(output, { recursive: true });
const sessions = [], errors = [], complaintIds = [], userIds = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
async function waitForLinkStatus(id, status) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await db.caseLink.findUniqueOrThrow({ where: { id } })).status === status) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Case-link review did not reach ${status}`);
}
async function pageFor(userId, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width === 390 });
  const token = randomBytes(32).toString("hex"), tokenHash = createHash("sha256").update(token).digest("hex");
  sessions.push({ context, tokenHash });
  await db.session.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) } });
  await context.addCookies([{ name: "__Host-kfx_session", value: token, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => { if (request.url().startsWith(base) && request.failure()?.errorText !== "net::ERR_ABORTED") errors.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`); });
  return page;
}

try {
  const suffix = randomBytes(6).toString("hex"), city = await db.city.findUniqueOrThrow({ where: { slug: "karachi" } });
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
  const [owner, reporter] = await Promise.all(["owner", "reporter"].map(async label => {
    const row = await db.user.create({ data: { name: `[QA TEST] Duplicate ${label}`, email: `qa-duplicate-${label}-${suffix}@example.test`, passwordHash: "test-only", role: "CITIZEN" } });
    userIds.push(row.id); return row;
  }));
  const primary = await db.complaint.create({ data: { userId: owner.id, cityId: city.id, reference: `KFX-QA-B4-${suffix.toUpperCase()}`, title: "[QA TEST] Streetlight pole 5", description: "[QA TEST] Private fixture details", category: "Streetlights", district: "East", area: "Gulshan-e-Iqbal", status: "VERIFIED", latitude: 24.92, longitude: 67.09, publicVisible: true, publicTitle: "[QA TEST] Streetlight pole 5", publicArea: "Gulshan-e-Iqbal", publicLatitude: 24.92, publicLongitude: 67.09, publicApprovedAt: new Date() } }); complaintIds.push(primary.id);
  const second = await db.complaint.create({ data: { userId: owner.id, cityId: city.id, reference: `KFX-QA-B5-${suffix.toUpperCase()}`, title: "[QA TEST] Streetlight pole 5 across lane", description: "[QA TEST] Separate private fixture details", category: "Streetlights", district: "East", area: "Gulshan-e-Iqbal", status: "VERIFIED", publicVisible: true, publicTitle: "[QA TEST] Streetlight pole 5 across lane", publicArea: "Gulshan-e-Iqbal", publicLatitude: 24.92, publicLongitude: 67.09, publicApprovedAt: new Date() } }); complaintIds.push(second.id);
  const reporterPage = await pageFor(reporter.id, { width: 390, height: 844 });
  const adminPage = await pageFor(admin.id, { width: 1440, height: 900 });
  await reporterPage.goto(`${base}/report`);
  await reporterPage.getByLabel("Issue category *").selectOption("Streetlights");
  await reporterPage.getByLabel("Short issue title *").fill("[QA TEST] Streetlight pole 5");
  await reporterPage.getByLabel("Describe the problem *").fill("[QA TEST] The same fictional pole 5 is dark on this road.");
  await reporterPage.getByRole("button", { name: "Continue" }).click();
  await reporterPage.getByLabel("Karachi district *").selectOption("East");
  await reporterPage.getByLabel("Search town or neighborhood *").fill("Gulshan-e-Iqbal");
  await reporterPage.getByRole("option", { name: "Gulshan-e-Iqbal" }).click();
  await reporterPage.getByRole("button", { name: "Back" }).click();
  await reporterPage.getByLabel("Issue category *").selectOption("Water & drainage");
  await reporterPage.getByRole("button", { name: "Continue" }).click();
  await reporterPage.getByRole("button", { name: "Check Nearby Issues" }).click();
  await reporterPage.getByText("No similar approved public reports were found").waitFor();
  assert(await reporterPage.getByRole("link", { name: /view or support this report/ }).count() === 0, "cross-category suggestion leaked");
  await reporterPage.getByRole("button", { name: "Back" }).click();
  await reporterPage.getByLabel("Issue category *").selectOption("Streetlights");
  assert(await reporterPage.getByLabel("Short issue title *").inputValue() === "[QA TEST] Streetlight pole 5", "title changed after category check");
  await reporterPage.getByRole("button", { name: "Continue" }).click();
  await reporterPage.getByRole("button", { name: "Check Nearby Issues" }).click();
  await reporterPage.getByText("Possible same issue").first().waitFor();
  assert(await reporterPage.getByRole("link", { name: /view or support this report/ }).count() === 2, "two eligible active public suggestions were not shown");
  await reporterPage.screenshot({ path: path.join(output, "mobile-duplicate-suggestion.png"), fullPage: true });
  const popupPromise = reporterPage.waitForEvent("popup");
  await reporterPage.getByRole("link", { name: /view or support this report/ }).first().click();
  const publicPage = await popupPromise;
  await publicPage.getByRole("button", { name: "I'm affected too / Same issue" }).click();
  await publicPage.getByRole("button", { name: "Remove my support" }).waitFor();
  assert(await db.complaintSupport.count({ where: { complaintId: primary.id, userId: reporter.id, active: true } }) === 1, "support was not persisted");
  await reporterPage.getByRole("button", { name: /This is a different issue/ }).click();
  assert(await reporterPage.getByRole("link", { name: /view or support this report/ }).count() === 0, "different-issue continuation did not clear suggestions");
  await reporterPage.getByRole("button", { name: "Back" }).click();
  assert(await reporterPage.getByLabel("Describe the problem *").inputValue() === "[QA TEST] The same fictional pole 5 is dark on this road.", "description lost after different-issue continuation");
  await reporterPage.getByRole("button", { name: "Continue" }).click();
  await reporterPage.getByRole("button", { name: "Continue" }).click();
  await reporterPage.locator('input[type="file"][multiple]').setInputFiles(path.join(root, "runtime", "friend-test", "qa-photos", "qa-before.png"));
  await reporterPage.getByRole("img", { name: /Selected report photo/ }).waitFor();
  await reporterPage.getByRole("button", { name: "Continue" }).click();
  await reporterPage.getByRole("button", { name: "Submit Report" }).click();
  await reporterPage.getByText("Report received. Save your reference").waitFor();
  const reference = new URL(reporterPage.url()).searchParams.get("ref");
  const submitted = await db.complaint.findUniqueOrThrow({ where: { reference } }); complaintIds.push(submitted.id);
  assert(submitted.userId === reporter.id && submitted.status === "SUBMITTED", "submitted case lost ownership or changed status");
  const link = await db.caseLink.findFirstOrThrow({ where: { sourceComplaintId: submitted.id, targetComplaintId: primary.id } });
  const secondLink = await db.caseLink.findFirstOrThrow({ where: { sourceComplaintId: submitted.id, targetComplaintId: second.id } });
  assert(link.status === "SUGGESTED", "case was linked without review");
  assert(secondLink.status === "SUGGESTED", "second eligible candidate was not created");
  const evidence = await db.evidence.findFirstOrThrow({ where: { complaintId: submitted.id } });
  const sla = await db.complaintSlaSnapshot.findUniqueOrThrow({ where: { complaintId: submitted.id } });
  const anonymous = await browser.newPage();
  assert((await anonymous.goto(`${base}/api/evidence/${evidence.id}`)).status() >= 400, "anonymous user accessed private image");
  await anonymous.goto(`${base}/admin/duplicates`);
  assert(anonymous.url().includes("/login"), "anonymous visitor reached duplicate review");
  await anonymous.close();
  const unrelatedPage = await pageFor(owner.id, { width: 390, height: 844 });
  await unrelatedPage.goto(`${base}/track?ref=${encodeURIComponent(submitted.reference)}`);
  assert(!(await unrelatedPage.getByText(submitted.description).count()), "unrelated citizen read a private complaint description");
  assert(!(await unrelatedPage.getByRole("button", { name: /Confirm resolution/ }).count()), "unrelated citizen received resolution controls");
  await unrelatedPage.goto(`${base}/admin/duplicates`);
  assert(!unrelatedPage.url().includes("/admin/duplicates"), "citizen reached admin duplicate review");
  await adminPage.goto(`${base}/admin/duplicates`);
  const card = adminPage.locator("article").filter({ hasText: primary.reference }).filter({ hasText: submitted.reference });
  const secondCard = adminPage.locator("article").filter({ hasText: second.reference }).filter({ hasText: submitted.reference });
  await card.getByLabel("Reason for decision").fill("[QA TEST] Same fictional pole and location");
  await card.getByRole("button", { name: "Link as related" }).click();
  await adminPage.waitForURL(/\/admin\/duplicates\?saved=1/);
  assert((await db.caseLink.findUniqueOrThrow({ where: { id: link.id } })).status === "LINKED", "admin review was not persisted");
  assert((await db.complaint.findUniqueOrThrow({ where: { id: submitted.id } })).status === "SUBMITTED", "linking propagated primary status");
  assert((await db.auditLog.findFirst({ where: { action: "DUPLICATE_DETECTION_RUN", targetId: submitted.id } })) !== null, "detector run missing");
  await adminPage.reload();
  assert(await adminPage.getByText("Submission detector history").count() === 1, "admin detector history missing");
  assert((await adminPage.locator("section").filter({ hasText: "Submission detector history" }).getByText(submitted.reference).count()) >= 1, "submitted report missing from detector history");
  await secondCard.getByLabel("Reason for decision").fill("[QA TEST] Distinct nearby fixture");
  await secondCard.getByRole("button", { name: "Not the same issue" }).click();
  await waitForLinkStatus(secondLink.id, "REJECTED");
  await adminPage.reload();
  await card.getByLabel("Reason for decision").fill("[QA TEST] Reversing this review");
  await card.getByRole("button", { name: "Unlink / correct" }).click();
  await waitForLinkStatus(link.id, "UNLINKED");
  await adminPage.reload();
  await card.getByLabel("Reason for decision").fill("[QA TEST] Distinct asset after review");
  await card.getByRole("button", { name: "Not the same issue" }).click();
  await waitForLinkStatus(link.id, "REJECTED");
  await adminPage.reload();
  const historyRow = adminPage.locator("section").filter({ hasText: "Submission detector history" }).locator("div.rounded-xl").filter({ hasText: submitted.reference });
  assert(await historyRow.getByText("Reviewed / rejected").count() === 1, "reviewed state did not persist after reload");
  assert(await db.caseEvent.count({ where: { complaintId: submitted.id, kind: { in: ["CASE_LINK_LINKED", "CASE_LINK_UNLINKED", "CASE_LINK_REJECTED"] }, visibility: "INTERNAL" } }) === 4, "case-link history is incomplete");
  assert((await db.complaint.findUniqueOrThrow({ where: { id: submitted.id } })).userId === reporter.id, "review changed complaint ownership");
  assert((await db.complaintSlaSnapshot.findUniqueOrThrow({ where: { complaintId: submitted.id } })).capturedAt.getTime() === sla.capturedAt.getTime(), "review changed the SLA snapshot");
  assert((await db.evidence.findUniqueOrThrow({ where: { id: evidence.id } })).complaintId === submitted.id, "review moved private evidence");
  assert(await db.completedWorkStory.count({ where: { complaintId: submitted.id } }) === 0, "review bypassed publication gates");
  await adminPage.screenshot({ path: path.join(output, "desktop-admin-related-cases.png"), fullPage: true });
  const pinless = await db.completedWorkStory.findFirst({ where: { status: "PUBLISHED", complaint: { publicVisible: false } }, select: { id: true, complaint: { select: { id: true, reference: true } } } });
  const pinned = await db.completedWorkStory.findFirst({ where: { status: "PUBLISHED", complaint: { publicVisible: true, publicLatitude: { not: null }, publicLongitude: { not: null } } }, select: { id: true, complaint: { select: { id: true, reference: true } } } });
  assert(pinless && pinned, "both pinned and pin-less QA stories are required for link verification");
  const anonymousStory = await browser.newPage();
  for (const [story, expectedPath] of [[pinless, "/track?ref="], [pinned, "/map/case/"]]) {
    await anonymousStory.goto(`${base}/projects/completed/${story.id}`);
    const referenceLink = anonymousStory.getByRole("link", { name: story.complaint.reference });
    assert((await referenceLink.getAttribute("href")).startsWith(expectedPath), `wrong public story link for ${story.complaint.reference}`);
    await Promise.all([anonymousStory.waitForURL(url => !url.pathname.startsWith("/projects/completed/")), referenceLink.click()]);
    assert(!(await anonymousStory.getByText("This page could not be found.").count()), "story reference resolved to 404");
  }
  await anonymousStory.close();
  await reporterPage.goto(`${base}/report`);
  await reporterPage.getByLabel("Issue category *").selectOption("Streetlights");
  await reporterPage.getByLabel("Short issue title *").fill("[QA TEST] Fictional streetlight case review");
  await reporterPage.getByLabel("Describe the problem *").fill("[QA TEST] Checking the already resolved historical streetlight case.");
  await reporterPage.getByRole("button", { name: "Continue" }).click();
  await reporterPage.getByLabel("Karachi district *").selectOption("East");
  await reporterPage.getByLabel("Search town or neighborhood *").fill("Gulistan-e-Johar");
  await reporterPage.getByRole("option", { name: "Gulistan-e-Johar" }).click();
  await reporterPage.getByRole("button", { name: "Check Nearby Issues" }).click();
  await reporterPage.getByText("Related nearby issue").first().waitFor();
  assert(await reporterPage.getByText("RESOLVED").count() >= 1, "resolved public case was not shown as historical context");
  assert(await reporterPage.getByText("Possible same issue").count() === 0, "resolved case was misrepresented as an active candidate");
  const published = await db.completedWorkStory.findFirst({ where: { status: "PUBLISHED" }, select: { id: true } });
  let viewportChecks = 0;
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await reporterPage.setViewportSize(viewport);
    await adminPage.setViewportSize(viewport);
    for (const route of ["/", "/report", "/map", `/track?ref=${encodeURIComponent(submitted.reference)}`, "/help", "/funds", "/projects", "/dashboard", "/notifications", "/profile", ...(published ? [`/projects/completed/${published.id}`] : [])]) {
      await reporterPage.goto(`${base}${route}`);
      const overflow = await reporterPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      assert(!overflow, `horizontal overflow at ${viewport.width}px on ${route}`);
      viewportChecks++;
    }
    for (const route of ["/admin", `/admin/cases/${submitted.id}`, "/admin/duplicates", "/admin/sla"]) {
      await adminPage.goto(`${base}${route}`);
      const overflow = await adminPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      assert(!overflow, `horizontal overflow at ${viewport.width}px on ${route}`);
      viewportChecks++;
    }
    const login = await browser.newPage({ viewport });
    await login.goto(`${base}/login`);
    assert(!(await login.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)), `horizontal overflow at ${viewport.width}px on /login`);
    viewportChecks++; await login.close();
    if (viewport.width === 768) await reporterPage.screenshot({ path: path.join(output, "tablet-citizen-profile.png"), fullPage: true });
  }
  assert(errors.length === 0, `browser errors: ${errors.join(" | ")}`);
  console.log(`PASS: two active approved public candidates, positive and negative mobile suggestions, resolved historical context, form preservation, support, distinct photo report, admin link/unlink/reject with reload persistence and audit events, ownership/SLA/evidence/publication isolation, pinned and pin-less story links, anonymous and unrelated-user privacy, and ${viewportChecks} viewport/route overflow checks; no local browser errors`);
} finally {
  for (const item of sessions) await item.context.close();
  if (sessions.length) await db.session.deleteMany({ where: { tokenHash: { in: sessions.map(item => item.tokenHash) } } });
  const evidence = await db.evidence.findMany({ where: { complaintId: { in: complaintIds } }, select: { storageKey: true } });
  const links = await db.caseLink.findMany({ where: { sourceComplaintId: { in: complaintIds } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { targetId: { in: [...complaintIds, ...links.map(item => item.id)] } } });
  await db.complaintSupport.deleteMany({ where: { complaintId: { in: complaintIds } } });
  await db.caseLink.deleteMany({ where: { sourceComplaintId: { in: complaintIds } } });
  await db.notificationDeliveryAttempt.deleteMany({ where: { outbox: { complaintId: { in: complaintIds } } } });
  await db.notificationOutbox.deleteMany({ where: { complaintId: { in: complaintIds } } });
  await db.notification.deleteMany({ where: { complaintId: { in: complaintIds } } });
  await db.caseEvent.deleteMany({ where: { complaintId: { in: complaintIds } } });
  await db.complaintSlaSnapshot.deleteMany({ where: { complaintId: { in: complaintIds } } });
  await db.evidence.deleteMany({ where: { complaintId: { in: complaintIds } } });
  await db.complaint.deleteMany({ where: { id: { in: complaintIds } } });
  if (userIds.length) { await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } }); await db.user.deleteMany({ where: { id: { in: userIds } } }); }
  for (const row of evidence) await unlink(path.join(root, "runtime", "friend-test", "uploads", row.storageKey)).catch(() => undefined);
  await browser.close(); await db.$disconnect();
}
