import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const root = process.cwd(), base = "http://127.0.0.1:3101";
if (process.env.FRIEND_TEST_MODE !== "1" || process.env.DATABASE_URL !== "file:./friend-test.db" || path.resolve(process.env.PRIVATE_UPLOAD_ROOT || "") !== path.join(root, "runtime", "friend-test", "uploads")) throw new Error("Requires friend-test isolation.");
const db = new PrismaClient();
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const sessions = [], contexts = [], errors = [];
async function pageFor(id) {
  const token = randomBytes(32).toString("hex"), tokenHash = createHash("sha256").update(token).digest("hex");
  await db.session.create({ data: { userId: id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) } });
  sessions.push(tokenHash);
  const context = await browser.newContext(); contexts.push(context);
  await context.addCookies([{ name: "__Host-kfx_session", value: token, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`); });
  return page;
}
function assert(value, message) { if (!value) throw new Error(message); }
try {
  const complaint = await db.complaint.findUniqueOrThrow({ where: { reference: "KFX-B1D159163DDCC90B" }, include: { completedWorkStory: true, evidence: true } });
  const story = complaint.completedWorkStory;
  assert(complaint.status === "RESOLVED" && story?.status === "PUBLISHED", "QA case or story regressed");
  assert(await db.completedWorkStory.count({ where: { complaintId: complaint.id } }) === 1, "Duplicate QA story");
  assert(await db.auditLog.count({ where: { targetType: "CompletedWorkStory", targetId: story.id, action: "STORY_PUBLISHED" } }) === 1, "Duplicate publication audit");
  const owner = await pageFor(complaint.userId);
  await owner.goto(`${base}/dashboard`);
  await owner.getByText(complaint.reference).first().waitFor();
  await owner.getByRole("link", { name: "Your volunteer tasks" }).waitFor();
  await owner.goto(`${base}/track?ref=${complaint.reference}`);
  await owner.getByText(complaint.title).waitFor();
  await owner.getByRole("button", { name: "Reopen case" }).waitFor();
  assert((await owner.locator("body").innerText()).includes("Citizen confirmed resolution"), "Owner cannot see confirmation history");
  console.log("PASS: volunteer-owner dashboard and resolved private tracking still work");

  const unrelated = await db.user.findFirstOrThrow({ where: { role: "CITIZEN", id: { not: complaint.userId } }, select: { id: true } });
  const stranger = await pageFor(unrelated.id);
  await stranger.goto(`${base}/track?ref=${complaint.reference}`);
  assert(!(await stranger.locator("body").innerText()).includes(complaint.title), "Unrelated user sees private title");
  assert(await stranger.getByRole("button", { name: "Reopen case" }).count() === 0, "Unrelated user can reopen");
  console.log("PASS: unrelated citizen remains restricted");

  const publicPage = await browser.newPage();
  publicPage.on("pageerror", error => errors.push(error.message));
  await publicPage.goto(`${base}/projects/completed/${story.id}`);
  await publicPage.getByText("[QA TEST] Fictional streetlight case review").first().waitFor();
  const internal = complaint.evidence.find(item => item.visibility === "INTERNAL");
  assert(internal && (await fetch(`${base}/api/evidence/${internal.id}`)).status === 404, "Internal photo is public");
  assert((await fetch(`${base}/api/projects/completed/${story.id}/media/before`)).status === 200, "Approved before photo missing");
  assert((await fetch(`${base}/api/projects/completed/${story.id}/media/after`)).status === 200, "Approved after photo missing");
  console.log("PASS: one published QA story; approved media public, internal media private");

  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
  const adminPage = await pageFor(admin.id);
  const deadlineCase = await db.complaint.findUniqueOrThrow({ where: { reference: "KFX-E907B556DBDCDC2D" }, select: { id: true } });
  const count = await db.task.count({ where: { complaintId: deadlineCase.id } });
  await adminPage.goto(`${base}/admin/cases/${deadlineCase.id}?action=team`);
  const taskForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Create action task" }) });
  await taskForm.locator('select[name="assigneeId"]').selectOption(admin.id);
  await taskForm.locator('textarea[name="instructions"]').fill("[QA TEST] Validation check only; no real task.");
  const field = taskForm.getByRole("textbox", { name: "Deadline" });
  await field.fill("2026-09-31 18:00");
  await taskForm.getByRole("button", { name: "Create action task" }).click();
  await taskForm.getByRole("alert").getByText(/Pakistan time/).waitFor();
  assert(await db.task.count({ where: { complaintId: deadlineCase.id } }) === count, "Invalid task deadline changed data");
  console.log("PASS: production deadline form shows accessible error without creating a task");
  assert(errors.length === 0, `Unexpected browser errors: ${errors.join(" | ")}`);
  console.log("PASS: no browser exceptions or failed network requests");
} finally {
  if (sessions.length) await db.session.deleteMany({ where: { tokenHash: { in: sessions } } });
  for (const context of contexts) await context.close();
  await browser.close();
  await db.$disconnect();
}
