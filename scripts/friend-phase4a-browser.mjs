import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd(), base = "http://127.0.0.1:3101";
if (process.env.FRIEND_TEST_MODE !== "1" || process.env.DATABASE_URL !== "file:./friend-test.db" || path.resolve(process.env.PRIVATE_UPLOAD_ROOT || "") !== path.join(root, "runtime", "friend-test", "uploads")) throw new Error("Requires isolated friend-test environment.");
const db = new PrismaClient(), output = path.join(root, "runtime", "friend-test", "phase4a-browser");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const contexts = [], sessionHashes = [], errors = [];
let qaUserId, qaNotificationId, qaPolicyId;
function assert(condition, message) { if (!condition) throw new Error(message); }
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
try {
  const salt = randomBytes(16), password = randomBytes(24).toString("hex");
  const passwordHash = `scrypt$16384$8$1$${salt.toString("hex")}$${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
  const qa = await db.user.create({ data: { name: "[QA TEST] Phase 4A Citizen", email: `phase4a-${randomBytes(6).toString("hex")}@example.test`, passwordHash, role: "CITIZEN" } }); qaUserId = qa.id;
  const notice = await db.notification.create({ data: { userId: qa.id, title: "[QA TEST] In-app update", message: "[QA TEST] Fictional case update for browser QA.", href: "/profile" } }); qaNotificationId = notice.id;
  const citizen = await pageFor(qa.id);
  await citizen.goto(`${base}/profile`);
  await citizen.getByLabel("Phone (optional, private)").fill("03001234567");
  await citizen.getByLabel("Opt in to SMS when available").check();
  await citizen.getByLabel("Opt in to WhatsApp when available").check();
  await citizen.getByRole("button", { name: "Save profile" }).click();
  await citizen.getByText("Profile saved.").waitFor();
  await citizen.reload();
  assert(await citizen.getByLabel("Opt in to SMS when available").isChecked(), "SMS preference did not persist");
  assert(await citizen.getByLabel("Opt in to WhatsApp when available").isChecked(), "WhatsApp preference did not persist");
  await citizen.screenshot({ path: path.join(output, "390-profile.png"), fullPage: true });
  await citizen.goto(`${base}/notifications`);
  await citizen.getByText("[QA TEST] In-app update").waitFor();
  await citizen.getByRole("button", { name: "Mark read" }).click();
  await citizen.getByRole("button", { name: "Mark read" }).waitFor({ state: "detached" });
  assert(Boolean((await db.notification.findUniqueOrThrow({ where: { id: notice.id } })).readAt), "Mark read did not persist");
  await citizen.screenshot({ path: path.join(output, "390-notifications.png"), fullPage: true });
  const caseRow = await db.complaint.findFirstOrThrow({ where: { userId: { not: null }, slaSnapshot: null }, select: { id: true, userId: true, reference: true } });
  await citizen.goto(`${base}/track?ref=${encodeURIComponent(caseRow.reference)}`);
  assert(!(await citizen.getByText("Service timeline").count()), "Unrelated citizen saw private SLA");
  const owner = await pageFor(caseRow.userId);
  await owner.goto(`${base}/track?ref=${encodeURIComponent(caseRow.reference)}`);
  await owner.getByRole("heading", { name: "Service timeline" }).waitFor();
  await owner.getByText("Target not yet defined").first().waitFor();
  await owner.screenshot({ path: path.join(output, "390-owner-tracking.png"), fullPage: true });
  const adminUser = await db.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
  const admin = await pageFor(adminUser.id);
  await admin.goto(`${base}/admin/sla`);
  await admin.getByRole("heading", { name: "Case timeline targets" }).waitFor();
  await admin.getByLabel("Category").selectOption("Other");
  await admin.getByLabel("First review · hours from submission").fill("12");
  await admin.getByLabel("Verification or assignment · hours from submission").fill("24");
  await admin.getByLabel("Proposed resolution · hours from submission").fill("72");
  await admin.getByRole("button", { name: "Approve targets" }).click();
  await admin.getByText("Policy approved for future reports.").waitFor();
  const savedPolicy = await db.slaPolicy.findFirstOrThrow({ where: { category: "Other", firstReviewHours: 12, verificationHours: 24, resolutionHours: 72 }, orderBy: { approvedAt: "desc" } }); qaPolicyId = savedPolicy.id;
  await admin.screenshot({ path: path.join(output, "390-admin-sla.png"), fullPage: true });
  await admin.goto(`${base}/admin`);
  await admin.getByText("Overdue case targets").waitFor();
  assert(await db.notificationOutbox.count({ where: { userId: qa.id } }) === 0, "Profile preference generated an external message");
  assert(errors.length === 0, `Browser errors: ${errors.join(" | ")}`);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ profileSaved: true, inAppRead: true, ownerTargetUndefined: true, unrelatedDenied: true, adminPolicySaved: true, externalQueued: 0, errors }, null, 2));
  console.log("PASS: profile preferences, in-app read state, owner-only SLA, admin policy save, no external queue or browser errors");
} finally {
  for (const context of contexts) await context.close();
  if (sessionHashes.length) await db.session.deleteMany({ where: { tokenHash: { in: sessionHashes } } });
  if (qaNotificationId) await db.notification.deleteMany({ where: { id: qaNotificationId } });
  if (qaPolicyId) { await db.auditLog.deleteMany({ where: { action: "SLA_POLICY_APPROVED", targetId: qaPolicyId } }); await db.slaPolicy.deleteMany({ where: { id: qaPolicyId } }); }
  if (qaUserId) { await db.citizenProfile.deleteMany({ where: { userId: qaUserId } }); await db.user.deleteMany({ where: { id: qaUserId } }); }
  await browser.close(); await db.$disconnect();
}
