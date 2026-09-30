import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd(), base = "http://127.0.0.1:3101";
if (process.env.FRIEND_TEST_MODE !== "1" || process.env.DATABASE_URL !== "file:./friend-test.db" || path.resolve(process.env.PRIVATE_UPLOAD_ROOT || "") !== path.join(root, "runtime", "friend-test", "uploads")) throw new Error("Friend-test isolation required.");
const db = new PrismaClient(), browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const output = path.join(root, "runtime", "friend-test", "phase4a-audit-browser"); await mkdir(output, { recursive: true });
const contexts = [], sessionHashes = [], files = [], complaints = [], users = [], errors = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/RkQAAAAASUVORK5CYII=", "base64");
const assert = (value, message) => { if (!value) throw new Error(message); };
async function pageFor(userId) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); contexts.push(context);
  const token = randomBytes(32).toString("hex"), tokenHash = createHash("sha256").update(token).digest("hex"); sessionHashes.push(tokenHash);
  await db.session.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) } });
  await context.addCookies([{ name: "__Host-kfx_session", value: token, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => { const failure = request.failure()?.errorText; if (failure && failure !== "net::ERR_ABORTED") errors.push(`${new URL(request.url()).pathname}: ${failure}`); });
  return page;
}
async function makeFixture(ownerId, adminId, cityId, pinned) {
  const suffix = randomBytes(6).toString("hex"), reference = `KFX-QA-P4A-${suffix.toUpperCase()}`;
  const complaint = await db.complaint.create({ data: { userId: ownerId, cityId, reference, title: "[QA TEST] Fictional streetlight work", description: "[QA TEST] Fictional issue used only to test publication controls.", category: "Streetlights", district: "East", area: "Gulshan-e-Iqbal", status: "RESOLUTION_PROPOSED", ...(pinned ? { latitude: 24.90, longitude: 67.08 } : {}) } }); complaints.push(complaint.id);
  await db.caseEvent.create({ data: { complaintId: complaint.id, actorId: adminId, kind: "VERIFIED", summary: "[QA TEST] Fictional verification", visibility: "OWNER" } });
  await db.caseEvent.create({ data: { complaintId: complaint.id, actorId: adminId, kind: "COMPLAINT_STATUS", summary: "RESOLUTION_PROPOSED: [QA TEST] Fictional proposal", visibility: "OWNER" } });
  for (const stage of ["BEFORE", "AFTER"]) {
    const storageKey = `${randomBytes(20).toString("hex")}.png`, file = path.join(process.env.PRIVATE_UPLOAD_ROOT, storageKey);
    await writeFile(file, png, { flag: "wx" }); files.push(file);
    await db.evidence.create({ data: { complaintId: complaint.id, uploaderId: adminId, stage, visibility: "OWNER", storageKey, originalName: `[QA TEST] ${stage}.png`, mimeType: "image/png", size: png.length } });
  }
  return complaint;
}
async function reviewAndConfirm(adminPage, ownerPage, strangerPage, complaint, pinned) {
  const privateBefore = await db.evidence.findFirstOrThrow({ where: { complaintId: complaint.id, stage: "BEFORE" }, select: { id: true } });
  assert((await strangerPage.request.get(`${base}/api/evidence/${privateBefore.id}`)).status() === 404, "unrelated user accessed private evidence");
  await strangerPage.goto(`${base}/track?ref=${encodeURIComponent(complaint.reference)}`);
  assert(!(await strangerPage.getByRole("heading", { name: "Review proposed resolution" }).count()), "unrelated user saw confirmation controls");
  await adminPage.goto(`${base}/admin/projects/${complaint.id}`);
  assert(await adminPage.getByRole("heading", { name: `Review ${complaint.reference}` }).isVisible(), "admin review unavailable");
  await adminPage.getByLabel("Public title").fill(`[QA TEST] Fictional ${pinned ? "pinned" : "pin-less"} streetlight work`);
  await adminPage.getByLabel("Approximate area").fill("Gulshan-e-Iqbal");
  await adminPage.getByRole("button", { name: "Approve public title and area" }).click();
  await adminPage.getByText("Public story title and area approved.").waitFor();
  const problem = `[QA TEST] A fictional streetlight was reported out in a public area.`;
  const work = `[QA TEST] A fictional team completed and documented a simulated repair.`;
  await adminPage.getByLabel("Public problem summary").fill(problem);
  await adminPage.getByLabel("Work actually performed").fill(work);
  await adminPage.getByRole("button", { name: "Approve public summaries", exact: true }).click();
  await adminPage.getByText("Summaries approved and saved.").waitFor();
  await adminPage.reload();
  assert(await adminPage.getByLabel("Public problem summary").inputValue() === problem, "first-click summary draft was lost");
  assert(await adminPage.getByText("Summaries approved and saved.").isVisible(), "summary approval did not survive reload");
  await adminPage.getByLabel("Public problem summary").fill(`${problem} [QA TEST] Edited.`);
  await adminPage.getByText("These edits require reapproval").waitFor();
  await adminPage.getByRole("button", { name: "Approve public summaries", exact: true }).click();
  await adminPage.getByText("Summaries approved and saved.").waitFor();
  for (let index = 0; index < 2; index++) {
    await adminPage.getByLabel("I checked this photo for private information").first().check();
    await adminPage.getByRole("button", { name: "Approve photo for public" }).first().click();
    await adminPage.getByText("Approved for public display").first().waitFor();
  }
  let story = await db.completedWorkStory.findUniqueOrThrow({ where: { complaintId: complaint.id } });
  assert(story.status === "DRAFT", "story published before citizen confirmation");
  if (pinned) {
    await adminPage.goto(`${base}/admin/cases/${complaint.id}`);
    await adminPage.getByText("Advanced Controls", { exact: true }).click();
    await adminPage.getByRole("button", { name: "Approve verified case for public map" }).click();
    await adminPage.getByText("Approved with an approximate marker.").waitFor({ state: "attached" });
    assert((await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } })).publicVisible, "map approval was not saved");
  }
  await ownerPage.goto(`${base}/track?ref=${encodeURIComponent(complaint.reference)}`);
  await ownerPage.getByRole("heading", { name: "Review proposed resolution" }).waitFor();
  await ownerPage.getByText("Scheduled for", { exact: false }).first().waitFor();
  await ownerPage.getByRole("button", { name: "Confirm resolution" }).click();
  await ownerPage.getByText("Resolution confirmed. Your response has been recorded.").waitFor();
  await ownerPage.getByText("Cancelled — previously scheduled", { exact: false }).first().waitFor();
  story = await db.completedWorkStory.findUniqueOrThrow({ where: { complaintId: complaint.id } });
  assert(story.status === "PUBLISHED", "verified story did not publish on confirmation");
  assert((await ownerPage.request.get(`${base}/projects/completed/${story.id}`)).status() === 200, "public story unavailable");
  assert((await ownerPage.request.get(`${base}/api/projects/completed/${story.id}/media/before`)).status() === 200, "approved BEFORE unavailable");
  assert((await ownerPage.request.get(`${base}/api/projects/completed/${story.id}/media/after`)).status() === 200, "approved AFTER unavailable");
  const map = await (await ownerPage.request.get(`${base}/api/map`)).json();
  const markers = Array.isArray(map) ? map : map.reports ?? map.items ?? [];
  assert(markers.some(row => row.id === complaint.id) === pinned, "pin-less/pinned map visibility mismatch");
  assert((await db.notificationOutbox.findFirstOrThrow({ where: { complaintId: complaint.id, kind: "RESOLUTION_REMINDER" } })).status === "CANCELLED", "confirmation did not cancel pending reminder");
  assert((await db.notificationOutbox.count({ where: { complaintId: complaint.id, channel: { in: ["SMS", "WHATSAPP"] } } })) === 0, "external message queued in QA");
  await ownerPage.screenshot({ path: path.join(output, pinned ? "pinned-confirmed.png" : "pinless-confirmed.png"), fullPage: true });
  await adminPage.screenshot({ path: path.join(output, pinned ? "pinned-story-review.png" : "pinless-story-review.png"), fullPage: true });
  return story;
}
try {
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
  const owner = await db.user.create({ data: { name: "[QA TEST] Phase 4A browser owner", email: `qa-p4a-browser-${randomBytes(6).toString("hex")}@example.test`, passwordHash: "test-only", role: "VOLUNTEER" } }); users.push(owner.id);
  await db.volunteerApplication.create({ data: { userId: owner.id, fullName: owner.name, district: "East", serviceArea: "Gulshan-e-Iqbal", contactPhone: "03000000000", contactEmail: owner.email, skills: "[QA TEST]", availability: "[QA TEST]", status: "APPROVED" } });
  const city = await db.city.findUniqueOrThrow({ where: { slug: "karachi" } });
  const stranger = await db.user.create({ data: { name: "[QA TEST] Browser stranger", email: `qa-p4a-stranger-${randomBytes(6).toString("hex")}@example.test`, passwordHash: "test-only", role: "CITIZEN" } }); users.push(stranger.id);
  const adminPage = await pageFor(admin.id), ownerPage = await pageFor(owner.id), strangerPage = await pageFor(stranger.id);
  await strangerPage.goto(`${base}/forgot-password`);
  await strangerPage.getByText("Self-service password recovery is temporarily unavailable").waitFor();
  const pinless = await makeFixture(owner.id, admin.id, city.id, false);
  await db.notificationOutbox.create({ data: { dedupeKey: `qa-reminder:${pinless.id}`, userId: owner.id, complaintId: pinless.id, channel: "IN_APP", kind: "RESOLUTION_REMINDER", title: "[QA TEST] Reminder", message: "[QA TEST] Review proposal", href: `/track?ref=${pinless.reference}`, dueAt: new Date(Date.now() + 24 * 3_600_000) } });
  await reviewAndConfirm(adminPage, ownerPage, strangerPage, pinless, false);
  const pinned = await makeFixture(owner.id, admin.id, city.id, true);
  await db.notificationOutbox.create({ data: { dedupeKey: `qa-reminder:${pinned.id}`, userId: owner.id, complaintId: pinned.id, channel: "IN_APP", kind: "RESOLUTION_REMINDER", title: "[QA TEST] Reminder", message: "[QA TEST] Review proposal", href: `/track?ref=${pinned.reference}`, dueAt: new Date(Date.now() + 24 * 3_600_000) } });
  await reviewAndConfirm(adminPage, ownerPage, strangerPage, pinned, true);
  assert(errors.length === 0, `Browser errors: ${errors.join(" | ")}`);
  console.log("PASS: pin-less and pinned publication; summary first click/reload/reapproval; volunteer-owner confirmation; map visibility; no browser errors");
} finally {
  for (const context of contexts) await context.close();
  if (sessionHashes.length) await db.session.deleteMany({ where: { tokenHash: { in: sessionHashes } } });
  for (const complaintId of complaints) {
    const story = await db.completedWorkStory.findUnique({ where: { complaintId }, select: { id: true } });
    const evidence = await db.evidence.findMany({ where: { complaintId }, select: { id: true } });
    await db.notificationDeliveryAttempt.deleteMany({ where: { outbox: { complaintId } } });
    await db.notificationOutbox.deleteMany({ where: { complaintId } });
    await db.notification.deleteMany({ where: { OR: [{ complaintId }, { href: `/admin/cases/${complaintId}` }] } });
    await db.auditLog.deleteMany({ where: { targetId: { in: [complaintId, ...(story ? [story.id] : []), ...evidence.map(item => item.id)] } } });
    await db.complaint.deleteMany({ where: { id: complaintId } });
  }
  if (users.length) { await db.volunteerApplication.deleteMany({ where: { userId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } }); }
  for (const file of files) await unlink(file).catch(() => undefined);
  await browser.close(); await db.$disconnect();
}
