import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import { createHash, randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const uploadRoot = path.resolve(root, "runtime", "friend-test", "uploads");
if (process.env.FRIEND_TEST_MODE !== "1" || process.env.DATABASE_URL !== "file:./friend-test.db" || path.resolve(process.env.PRIVATE_UPLOAD_ROOT || "") !== uploadRoot) throw new Error("Round 2 browser test requires friend-test isolation.");
const base = "http://127.0.0.1:3101";
const reference = "KFX-B1D159163DDCC90B";
const deadlineReference = "KFX-E907B556DBDCDC2D";
const db = new PrismaClient();
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const screenshots = path.join(root, "runtime", "friend-test", "screenshots");
await mkdir(screenshots, { recursive: true });
const sessions = [], contexts = [], diagnostics = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check, label) {
  for (let attempt = 0; attempt < 40; attempt++) { if (await check()) return; await pause(250); }
  throw new Error(`${label} did not complete`);
}
async function asUser(userId) {
  const token = randomBytes(32).toString("hex"), tokenHash = createHash("sha256").update(token).digest("hex");
  await db.session.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
  sessions.push(tokenHash);
  const context = await browser.newContext();
  await context.addCookies([{ name: "__Host-kfx_session", value: token, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", error => diagnostics.push(`browser exception: ${error.message}`));
  page.on("console", message => { if (message.type() === "error" && !message.text().includes("status of 404")) diagnostics.push(`console: ${message.text().slice(0, 200)}`); });
  page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") diagnostics.push(`network: ${new URL(request.url()).pathname} ${request.failure()?.errorText ?? "failed"}`); });
  return page;
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function localFuture(hours) {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
try {
  const complaint = await db.complaint.findUniqueOrThrow({ where: { reference }, include: { evidence: true } });
  assert(complaint.status === "RESOLUTION_PROPOSED", "Round 2 case must be awaiting citizen confirmation");
  const owner = await db.user.findUniqueOrThrow({ where: { id: complaint.userId }, select: { id: true, role: true } });
  assert(owner.role === "VOLUNTEER", "Round 2 submitter must be the approved volunteer");
  const approval = await db.volunteerApplication.findUnique({ where: { userId: owner.id }, select: { status: true } });
  assert(approval?.status === "APPROVED", "Volunteer approval is missing");
  const administrator = await db.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
  const unrelated = await db.user.findFirstOrThrow({ where: { role: "CITIZEN", id: { not: owner.id } }, select: { id: true } });
  const before = complaint.evidence.find(item => item.stage === "BEFORE");
  const after = complaint.evidence.find(item => item.stage === "AFTER");
  const internal = complaint.evidence.find(item => item.visibility === "INTERNAL");
  assert(before && after && internal, "Round 2 case needs before, after and private progress evidence");
  assert(await db.completedWorkStory.count({ where: { complaintId: complaint.id } }) === 0, "Round 2 case published early");
  const publicTracking = await (await fetch(`${base}/track?ref=${reference}`)).text();
  assert(!publicTracking.includes(complaint.title) && !publicTracking.includes("Confirm resolution"), "Anonymous tracking leaked owner details");
  assert((await fetch(`${base}/api/evidence/${before.id}`)).status === 404, "Private BEFORE evidence was public");
  console.log("PASS: no early story; anonymous tracking and private media remain restricted");

  const ownerPage = await asUser(owner.id);
  await ownerPage.goto(`${base}/dashboard`);
  await ownerPage.getByText(reference).first().waitFor();
  await ownerPage.getByRole("link", { name: "Your volunteer tasks" }).waitFor();
  await ownerPage.goto(`${base}/volunteer`);
  await ownerPage.getByRole("link", { name: "View your citizen reports" }).waitFor();
  await ownerPage.goto(`${base}/report`);
  await ownerPage.getByRole("heading", { name: "Report an issue" }).waitFor();
  await ownerPage.goto(`${base}/track?ref=${reference}`);
  await ownerPage.getByRole("heading", { name: "Review proposed resolution" }).waitFor();
  await ownerPage.getByText(complaint.title).waitFor();
  await ownerPage.screenshot({ path: path.join(screenshots, "round2-volunteer-owner-review.png"), fullPage: true });
  assert(await ownerPage.evaluate(async id => (await fetch(`/api/evidence/${id}`)).status, after.id) === 200, "Owner lost AFTER evidence access");
  assert(await ownerPage.evaluate(async id => (await fetch(`/api/evidence/${id}`)).status, internal.id) === 404, "Private progress media leaked to owner");
  console.log("PASS: approved volunteer retains citizen dashboard, reporting, private tracking and owner-visible evidence");

  const unrelatedPage = await asUser(unrelated.id);
  await unrelatedPage.goto(`${base}/track?ref=${reference}`);
  assert(await unrelatedPage.getByRole("button", { name: "Confirm resolution" }).count() === 0, "Unrelated citizen can confirm another case");
  assert(!(await unrelatedPage.locator("body").innerText()).includes(complaint.title), "Unrelated citizen sees private complaint title");
  assert(await unrelatedPage.evaluate(async id => (await fetch(`/api/evidence/${id}`)).status, after.id) === 404, "Unrelated citizen can read evidence");
  console.log("PASS: unrelated citizen cannot see or confirm the private case");

  const adminPage = await asUser(administrator.id);
  const deadlineCase = await db.complaint.findUniqueOrThrow({ where: { reference: deadlineReference }, select: { id: true, status: true } });
  assert(deadlineCase.status === "VERIFIED", "Deadline QA case is no longer available");
  await adminPage.goto(`${base}/admin/cases/${deadlineCase.id}?action=team`);
  const taskForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Create action task" }) });
  const taskCountBefore = await db.task.count({ where: { complaintId: deadlineCase.id } });
  await taskForm.locator('select[name="assigneeId"]').selectOption(administrator.id);
  await taskForm.locator('textarea[name="instructions"]').fill("[QA TEST] Check typed deadline behavior only; no real field work.");
  const deadline = taskForm.getByRole("textbox", { name: "Deadline" });
  await deadline.fill("2026-09-31 18:00");
  await taskForm.getByRole("button", { name: "Create action task" }).click();
  await taskForm.getByRole("alert").getByText(/future deadline/).waitFor();
  assert(await db.task.count({ where: { complaintId: deadlineCase.id } }) === taskCountBefore, "Invalid deadline created a task");
  await adminPage.screenshot({ path: path.join(screenshots, "round2-deadline-validation.png"), fullPage: true });
  await deadline.fill(localFuture(48));
  await taskForm.getByRole("button", { name: "Create action task" }).click();
  await eventually(async () => await db.task.count({ where: { complaintId: deadlineCase.id } }) === taskCountBefore + 1, "valid typed deadline task");
  console.log("PASS: invalid typed deadline shows accessible error; valid typed deadline creates one task");

  const storyUrl = `${base}/admin/projects/${complaint.id}`;
  await adminPage.goto(storyUrl);
  const titleForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Approve public title and area" }) });
  await titleForm.locator('input[name="publicTitle"]').fill("[QA TEST] Fictional streetlight case review");
  await titleForm.locator('input[name="publicArea"]').fill("Gulistan-e-Johar QA area");
  await titleForm.getByRole("button", { name: "Approve public title and area" }).click();
  await eventually(async () => (await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } })).publicVisible, "public title approval");
  await adminPage.goto(storyUrl);
  const summaryForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Approve public summaries" }) });
  await summaryForm.locator('textarea[name="problemSummary"]').fill("[QA TEST] Fictional streetlight issue recorded solely to test the reporting and review workflow.");
  await summaryForm.locator('textarea[name="workSummary"]').fill("[QA TEST] Synthetic photos and a simulated team review were recorded. No real repair was performed.");
  await summaryForm.getByRole("button", { name: "Approve public summaries" }).click();
  await eventually(async () => Boolean((await db.completedWorkStory.findUnique({ where: { complaintId: complaint.id } }))?.contentApprovedAt), "summary approval");
  for (const item of [before, after]) {
    await adminPage.goto(storyUrl);
    const form = adminPage.locator("form").filter({ has: adminPage.locator(`input[name="evidenceId"][value="${item.id}"]`) });
    await form.locator('input[name="contentChecked"]').check();
    await form.getByRole("button", { name: "Approve photo for public" }).click();
    await eventually(async () => Boolean((await db.evidence.findUniqueOrThrow({ where: { id: item.id } })).publicApprovedAt), `${item.stage} approval`);
  }
  let story = await db.completedWorkStory.findUniqueOrThrow({ where: { complaintId: complaint.id } });
  assert(story.status === "DRAFT", "Story published before citizen confirmation");
  assert((await fetch(`${base}/projects/completed/${story.id}`)).status === 404, "Draft story is publicly visible");
  assert((await fetch(`${base}/api/projects/completed/${story.id}/media/before`)).status === 404, "Draft approved photo is publicly accessible");
  console.log("PASS: all public content approved but story remains unpublished before citizen confirmation");

  await ownerPage.goto(`${base}/track?ref=${reference}`);
  await ownerPage.getByRole("button", { name: "Confirm resolution" }).click();
  await eventually(async () => (await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } })).status === "RESOLVED", "citizen confirmation");
  story = await db.completedWorkStory.findUniqueOrThrow({ where: { complaintId: complaint.id } });
  assert(story.status === "PUBLISHED", `Story did not publish after owner confirmation: ${story.holdReason}`);
  assert(await db.completedWorkStory.count({ where: { complaintId: complaint.id } }) === 1, "Duplicate story created");
  assert(await db.auditLog.count({ where: { targetType: "CompletedWorkStory", targetId: story.id, action: "STORY_PUBLISHED" } }) === 1, "Publication audit was duplicated");
  const detail = await (await fetch(`${base}/projects/completed/${story.id}`)).text();
  assert(detail.includes("[QA TEST] Fictional streetlight case review"), "Published QA story missing");
  assert(!detail.includes(complaint.description), "Private original complaint description leaked");
  assert((await fetch(`${base}/api/projects/completed/${story.id}/media/before`)).status === 200, "Approved BEFORE photo missing");
  assert((await fetch(`${base}/api/projects/completed/${story.id}/media/after`)).status === 200, "Approved AFTER photo missing");
  assert((await fetch(`${base}/api/evidence/${internal.id}`)).status === 404, "Private progress media leaked after publication");
  await ownerPage.goto(`${base}/dashboard`);
  await ownerPage.getByText(reference).first().waitFor();
  await adminPage.goto(storyUrl);
  await adminPage.getByRole("link", { name: "View published story" }).waitFor();
  await adminPage.screenshot({ path: path.join(screenshots, "round2-published-story-admin.png"), fullPage: true });
  console.log("PASS: owner confirmed; exactly one QA Before & After story published; private evidence remains private");
  if (diagnostics.length) throw new Error(`Browser diagnostics: ${diagnostics.join(" | ")}`);
} finally {
  if (sessions.length) await db.session.deleteMany({ where: { tokenHash: { in: sessions } } });
  for (const context of contexts) await context.close();
  await browser.close();
  await db.$disconnect();
}
