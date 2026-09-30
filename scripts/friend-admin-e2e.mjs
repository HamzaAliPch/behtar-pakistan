import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "http://127.0.0.1:3101";
const uploadRoot = path.resolve(root, "runtime", "friend-test", "uploads");
if (process.env.FRIEND_TEST_MODE !== "1" || process.env.DATABASE_URL !== "file:./friend-test.db" || path.resolve(process.env.PRIVATE_UPLOAD_ROOT || "") !== uploadRoot) {
  throw new Error("This browser test requires the isolated friend-test database and upload directory.");
}
const db = new PrismaClient();
const output = path.join(root, "runtime", "friend-test", "screenshots");
const checkpointPath = path.join(root, "runtime", "friend-test", "admin-e2e-checkpoint.json");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
let adminSessionHash;
let citizenContext;
let adminContext;
let anonymousContext;
const failures = [];
const record = message => console.log(`QA lifecycle: ${message}`);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, expected, label) {
  for (let i = 0; i < 32; i++) {
    const value = await check();
    if (value === expected) return;
    await pause(250);
  }
  throw new Error(`${label} did not reach ${expected}`);
}
async function save(page, name) { await page.screenshot({ path: path.join(output, `qa-lifecycle-${name}.png`), fullPage: true }); }
try {
  const administrators = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (administrators.length !== 1) throw new Error("Exactly one isolated test administrator is required.");
  const admin = administrators[0];
  const token = randomBytes(32).toString("hex");
  adminSessionHash = createHash("sha256").update(token).digest("hex");
  await db.session.create({ data: { userId: admin.id, tokenHash: adminSessionHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
  adminContext = await browser.newContext();
  await adminContext.addCookies([{ name: "__Host-kfx_session", value: token, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const adminPage = await adminContext.newPage();
  adminPage.on("pageerror", error => failures.push(`admin browser: ${error.message}`));
  await adminPage.goto(`${base}/admin`);
  await adminPage.getByRole("heading", { name: "Admin dashboard" }).waitFor();
  record("test administrator reached the protected dashboard");

  const credentialLines = (await readFile(path.join(root, "runtime", "friend-test", "credentials.txt"), "utf8")).split(/\r?\n/);
  const email = credentialLines.find(line => line.startsWith("Email:"))?.slice(6).trim();
  const password = credentialLines.find(line => line.startsWith("Password:"))?.slice(9).trim();
  if (!email || !password) throw new Error("Isolated test citizen credentials are missing.");
  citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  citizenPage.on("pageerror", error => failures.push(`citizen browser: ${error.message}`));
  await citizenPage.goto(`${base}/login`);
  await citizenPage.getByRole("textbox", { name: "Email address" }).fill(email);
  await citizenPage.getByLabel("Password").fill(password);
  await citizenPage.getByRole("button", { name: "Log in" }).click();
  await citizenPage.waitForURL(`${base}/dashboard`);
  record("isolated citizen logged in through the browser");

  let checkpoint;
  try { checkpoint = JSON.parse(await readFile(checkpointPath, "utf8")); } catch { /* first run */ }
  let complaint = checkpoint?.id ? await db.complaint.findUnique({ where: { id: checkpoint.id } }) : null;
  if (!complaint) {
    await citizenPage.goto(`${base}/report`);
    await citizenPage.getByRole("combobox", { name: "Issue category *" }).selectOption({ label: "Roads & potholes" });
    await citizenPage.getByRole("textbox", { name: "Short issue title *" }).fill("QA TEST: Fictional public road repair");
    await citizenPage.getByRole("textbox", { name: "Describe the problem *" }).fill("Fictional isolated QA scenario. No real civic damage or repair is being claimed.");
    await citizenPage.getByRole("button", { name: "Continue" }).click();
    await citizenPage.getByRole("combobox", { name: "Karachi district *" }).selectOption({ label: "East" });
    await citizenPage.getByRole("textbox", { name: "Search town or neighborhood *" }).fill("Gulshan-e-Iqbal");
    await citizenPage.getByRole("option", { name: "Gulshan-e-Iqbal", exact: true }).click();
    const map = citizenPage.locator(".leaflet-container");
    await map.waitFor();
    const box = await map.boundingBox();
    if (!box) throw new Error("Location map did not render for the QA report.");
    await map.click({ position: { x: Math.round(box.width * .64), y: Math.round(box.height * .34) } });
    await citizenPage.getByText(/Issue pin:/).waitFor();
    await citizenPage.getByRole("button", { name: "Continue" }).click();
    await citizenPage.locator('input[type="file"][multiple]').setInputFiles(path.join(root, "runtime", "friend-test", "qa-photos", "qa-before.png"));
    await citizenPage.getByRole("textbox", { name: "Nearby landmark (optional, private)" }).fill("Fictional QA junction");
    await citizenPage.getByRole("button", { name: "Continue" }).click();
    await citizenPage.getByRole("heading", { name: "Review your report" }).waitFor();
    await save(citizenPage, "citizen-review");
    await citizenPage.getByRole("button", { name: "Submit Report" }).click();
    await citizenPage.waitForURL(/\/track\?ref=KFX-/);
    const reference = new URL(citizenPage.url()).searchParams.get("ref");
    complaint = await db.complaint.findUniqueOrThrow({ where: { reference } });
    if (complaint.latitude == null || complaint.longitude == null) throw new Error("The browser report did not save its selected map pin.");
    await writeFile(checkpointPath, JSON.stringify({ id: complaint.id, reference: complaint.reference }, null, 2));
    record(`citizen submitted ${complaint.reference} with a private map pin and BEFORE photo`);
  }

  const caseUrl = `${base}/admin/cases/${complaint.id}`;
  await adminPage.goto(caseUrl);
  await adminPage.getByText("Case Action Center", { exact: true }).waitFor();
  await save(adminPage, "submitted-admin");
  if (complaint.status === "SUBMITTED") {
    await adminPage.getByRole("link", { name: /Verify complaint/ }).click();
    await adminPage.getByRole("textbox", { name: "What did you verify?" }).fill("Fictional QA report checked for the isolated workflow test.");
    await adminPage.getByRole("button", { name: "Confirm verification" }).click();
    await waitFor(async () => (await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } })).status, "VERIFIED", "complaint");
    record("admin verification recorded through Case Action Center");
  }
  await adminPage.goto(caseUrl);
  if ((await db.task.count({ where: { complaintId: complaint.id } })) === 0) {
    await adminPage.getByRole("link", { name: /Assign volunteer \/ team/ }).click();
    const taskForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Create action task" }) });
    await taskForm.locator('select[name="assigneeId"]').selectOption(admin.id);
    await taskForm.locator('input[name="deadline"]').fill(new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 16));
    await taskForm.locator('textarea[name="instructions"]').fill("Fictional QA task: inspect synthetic before evidence and document the test workflow only.");
    await taskForm.getByRole("button", { name: "Create action task" }).click();
    await waitFor(async () => await db.task.count({ where: { complaintId: complaint.id } }), 1, "task count");
    record("one team task assigned to the test administrator");
  }
  const task = await db.task.findFirstOrThrow({ where: { complaintId: complaint.id } });
  await adminPage.goto(`${base}/admin/tasks`);
  for (const next of ["IN_PROGRESS", "SUBMITTED_FOR_REVIEW", "COMPLETED"]) {
    const current = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    if (current.status === next || current.status === "COMPLETED") continue;
    if (next === "IN_PROGRESS" && current.status !== "ASSIGNED") continue;
    if (next === "SUBMITTED_FOR_REVIEW" && current.status !== "IN_PROGRESS") continue;
    if (next === "COMPLETED" && current.status !== "SUBMITTED_FOR_REVIEW") continue;
    const card = adminPage.locator("article").filter({ hasText: task.code });
    const statusForm = card.locator("form").filter({ has: adminPage.getByRole("button", { name: "Update", exact: true }) });
    await statusForm.locator('select[name="status"]').selectOption(next);
    await statusForm.locator('input[name="note"]').fill(`Fictional QA task moved to ${next}.`);
    await statusForm.getByRole("button", { name: "Update" }).click();
    await waitFor(async () => (await db.task.findUniqueOrThrow({ where: { id: task.id } })).status, next, "task");
    record(`task moved to ${next}`);
    await adminPage.goto(`${base}/admin/tasks`);
  }
  await save(adminPage, "task-completed");

  await adminPage.goto(`${caseUrl}?action=direct`);
  let currentCase = await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  if (currentCase.status === "ASSIGNED") {
    await adminPage.getByRole("textbox", { name: /What action has begun/ }).fill("Fictional QA field review began; no real repair is being claimed.");
    await adminPage.getByRole("button", { name: "Record progress" }).click();
    await waitFor(async () => (await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } })).status, "IN_PROGRESS", "complaint");
    record("admin recorded citizen-visible progress independently of task completion");
  }
  await adminPage.goto(`${caseUrl}?action=direct`);
  if (!(await db.evidence.count({ where: { complaintId: complaint.id, stage: "PROGRESS" } }))) {
    const form = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Upload progress photo" }) });
    await form.locator('input[type="file"]').setInputFiles(path.join(root, "runtime", "friend-test", "qa-photos", "qa-context.png"));
    await form.locator('input[name="note"]').fill("Synthetic QA progress fixture; no actual field visit.");
    await form.getByRole("button", { name: "Upload progress photo" }).click();
    await waitFor(async () => db.evidence.count({ where: { complaintId: complaint.id, stage: "PROGRESS" } }), 1, "progress evidence count");
    record("private progress evidence uploaded through the browser");
  }
  await adminPage.goto(caseUrl);
  if (!(await db.evidence.count({ where: { complaintId: complaint.id, stage: "AFTER" } }))) {
    const form = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Upload completion photo" }) });
    await form.locator('input[type="file"]').setInputFiles(path.join(root, "runtime", "friend-test", "qa-photos", "qa-context.png"));
    await form.locator('input[name="note"]').fill("Synthetic QA after fixture; no actual repair occurred.");
    await form.getByRole("button", { name: "Upload completion photo" }).click();
    await waitFor(async () => db.evidence.count({ where: { complaintId: complaint.id, stage: "AFTER" } }), 1, "after evidence count");
    record("owner-visible completion evidence uploaded through the browser");
  }
  currentCase = await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  if (!["IN_PROGRESS", "RESOLUTION_PROPOSED", "RESOLVED"].includes(currentCase.status)) throw new Error("Evidence upload incorrectly changed complaint status.");
  const evidence = await db.evidence.findMany({ where: { complaintId: complaint.id } });
  const before = evidence.find(item => item.stage === "BEFORE");
  const after = evidence.find(item => item.stage === "AFTER");
  if (!before || !after) throw new Error("Both before and after evidence are required.");
  const publicBefore = await fetch(`${base}/api/evidence/${before.id}`);
  if (publicBefore.status === 200) throw new Error("Anonymous visitor accessed private complaint evidence.");
  record("anonymous private evidence access denied");

  const storyAdminUrl = `${base}/admin/projects/${complaint.id}`;
  await adminPage.goto(storyAdminUrl);
  if (!currentCase.publicVisible) {
    const form = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Approve public title and area" }) });
    await form.locator('input[name="publicTitle"]').fill("QA TEST: Fictional road repair scenario");
    await form.locator('input[name="publicArea"]').fill("Gulshan-e-Iqbal QA area");
    await form.getByRole("button", { name: "Approve public title and area" }).click();
    await waitFor(async () => (await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } })).publicVisible, true, "public title approval");
    record("admin approved QA-labeled public title and approximate area");
  }
  await adminPage.goto(storyAdminUrl);
  let story = await db.completedWorkStory.findUnique({ where: { complaintId: complaint.id } });
  if (!story?.contentApprovedAt) {
    const form = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Approve public summaries" }) });
    await form.locator('textarea[name="problemSummary"]').fill("Fictional QA scenario for testing the complaint lifecycle. No real road damage is claimed.");
    await form.locator('textarea[name="workSummary"]').fill("Synthetic QA evidence documents a test workflow. No real repair was performed.");
    await form.getByRole("button", { name: "Approve public summaries" }).click();
    await waitFor(async () => Boolean((await db.completedWorkStory.findUnique({ where: { complaintId: complaint.id } }))?.contentApprovedAt), true, "public summary approval");
    record("admin approved clearly fictional public summaries");
  }
  for (const item of [before, after]) {
    const latest = await db.evidence.findUniqueOrThrow({ where: { id: item.id } });
    if (latest.publicApprovedAt) continue;
    await adminPage.goto(storyAdminUrl);
    const form = adminPage.locator("form").filter({ has: adminPage.locator(`input[name="evidenceId"][value="${item.id}"]`) });
    await form.locator('input[name="contentChecked"]').check();
    await form.getByRole("button", { name: "Approve photo for public" }).click();
    await waitFor(async () => Boolean((await db.evidence.findUniqueOrThrow({ where: { id: item.id } })).publicApprovedAt), true, `${item.stage} public approval`);
    record(`${item.stage} photo explicitly approved for public display`);
  }
  story = await db.completedWorkStory.findUniqueOrThrow({ where: { complaintId: complaint.id } });
  currentCase = await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  if (currentCase.status !== "RESOLVED") {
    if (story.status !== "DRAFT") throw new Error("Story published before citizen confirmation.");
    if ((await fetch(`${base}/projects/completed/${story.id}`)).status !== 404) throw new Error("Draft story became public before resolution.");
    record("approved content remained unpublished before citizen confirmation");
    await adminPage.goto(caseUrl);
    if (currentCase.status === "IN_PROGRESS") {
      await adminPage.getByRole("textbox", { name: "Explain what was completed" }).fill("Fictional QA workflow completed with synthetic evidence; citizen review requested.");
      await adminPage.getByRole("button", { name: "Propose resolution and request citizen review" }).click();
      await waitFor(async () => (await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } })).status, "RESOLUTION_PROPOSED", "complaint");
      record("admin proposed resolution without closing the case");
    }
    if ((await db.completedWorkStory.findUniqueOrThrow({ where: { complaintId: complaint.id } })).status !== "DRAFT") throw new Error("Story published before citizen decision.");
    await citizenPage.goto(`${base}/track?ref=${encodeURIComponent(complaint.reference)}`);
    await citizenPage.getByRole("heading", { name: "Review proposed resolution" }).waitFor();
    await save(citizenPage, "citizen-resolution-review");
    await citizenPage.getByRole("button", { name: "Confirm resolution" }).click();
    await waitFor(async () => (await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } })).status, "RESOLVED", "citizen confirmation");
    record("citizen confirmed; eligible completed-work story published automatically");
  }
  story = await db.completedWorkStory.findUniqueOrThrow({ where: { complaintId: complaint.id } });
  if (story.status !== "PUBLISHED") throw new Error(`Expected automatic publication, got ${story.status}: ${story.holdReason}`);

  anonymousContext = await browser.newContext();
  const publicPage = await anonymousContext.newPage();
  const anonymousAdmin = await fetch(`${base}/admin`, { redirect: "manual" });
  if (anonymousAdmin.status !== 307) throw new Error("Anonymous visitor reached the admin dashboard.");
  await publicPage.goto(`${base}/projects/completed/${story.id}`);
  await publicPage.getByText("QA TEST: Fictional road repair scenario").first().waitFor();
  const slider = publicPage.getByRole("slider", { name: "Compare before and after" });
  await slider.press("Home");
  if (await slider.inputValue() !== "0") throw new Error("Before/after slider did not respond to keyboard input.");
  await slider.press("ArrowRight");
  if (Number(await slider.inputValue()) <= 0) throw new Error("Before/after slider could not advance by keyboard.");
  await publicPage.getByText("View photos side by side").click();
  await publicPage.getByRole("img", { name: "Before: QA TEST: Fictional road repair scenario" }).waitFor();
  await publicPage.waitForFunction(() => [...document.querySelectorAll('img[src*="/api/projects/completed/"]')].slice(0, 2).every(image => image.complete && image.naturalWidth > 0));
  await save(publicPage, "published-story");
  await publicPage.goto(`${base}/projects`);
  await publicPage.getByText("QA TEST: Fictional road repair scenario").first().waitFor();
  record("anonymous visitor saw the approved QA story in Our Projects");
  if ((await fetch(`${base}/projects/completed/${story.id}`)).status !== 200) throw new Error("Published story detail was unavailable.");
  for (const stage of ["before", "after"]) {
    if ((await fetch(`${base}/api/projects/completed/${story.id}/media/${stage}`)).status !== 200) throw new Error(`Public approved ${stage} media was unavailable.`);
  }
  if ((await fetch(`${base}/api/evidence/${after.id}`)).status === 200) throw new Error("Direct private evidence URL became public.");
  const publishedCase = await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  const mapData = await (await fetch(`${base}/api/map?city=karachi`)).json();
  const marker = mapData.items?.find(item => item.id === complaint.id);
  if (!marker || marker.latitude === publishedCase.latitude || marker.longitude === publishedCase.longitude) throw new Error("QA public marker missing or using precise coordinates.");
  record("public story, approved photos and approximate map marker verified; direct private media remains protected");
  await citizenPage.goto(`${base}/dashboard`);
  await citizenPage.getByText(complaint.reference).first().waitFor();
  const publishedAudits = await db.auditLog.count({ where: { targetType: "CompletedWorkStory", targetId: story.id, action: "STORY_PUBLISHED" } });
  if (publishedAudits !== 1) throw new Error(`Expected one publication audit event, found ${publishedAudits}.`);
  record("citizen dashboard ownership and idempotent publication audit verified");

  const labelCase = await db.complaint.findUnique({ where: { reference: "KFX-E907B556DBDCDC2D" } });
  if (labelCase?.title.startsWith("QA TEST:") && ["SUBMITTED", "VERIFIED"].includes(labelCase.status)) {
    await adminPage.goto(`${base}/admin/cases/${labelCase.id}`);
    if (labelCase.status === "SUBMITTED") {
      await adminPage.getByRole("link", { name: /Verify complaint/ }).click();
      await adminPage.getByRole("textbox", { name: "What did you verify?" }).fill("Fictional QA report checked for interface label regression.");
      await adminPage.getByRole("button", { name: "Confirm verification" }).click();
      await waitFor(async () => (await db.complaint.findUniqueOrThrow({ where: { id: labelCase.id } })).status, "VERIFIED", "label test complaint");
    }
    await adminPage.goto(`${base}/admin/cases/${labelCase.id}?action=team`);
    await save(adminPage, "assignment-label");
    const fieldLabels = await adminPage.locator("label").allTextContents();
    if (!fieldLabels.some(value => value.trim().startsWith("Assign to"))) throw new Error("Guided assignment did not display the Assign to label.");
    record("guided assignment displays the corrected Assign to label");
  }
  if (failures.length) throw new Error(`Browser script errors: ${failures.join(" | ")}`);
} finally {
  if (adminSessionHash) await db.session.deleteMany({ where: { tokenHash: adminSessionHash } });
  await citizenContext?.close();
  await adminContext?.close();
  await anonymousContext?.close();
  await browser.close();
  await db.$disconnect();
}
if (failures.length) throw new Error(`Browser script errors: ${failures.join(" | ")}`);
