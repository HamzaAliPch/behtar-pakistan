import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const root = process.cwd(), base = "http://127.0.0.1:3101";
if (process.env.FRIEND_TEST_MODE !== "1" || process.env.DATABASE_URL !== "file:./friend-test.db" || path.resolve(process.env.PRIVATE_UPLOAD_ROOT || "") !== path.join(root, "runtime", "friend-test", "uploads")) throw new Error("Friend-test isolation required");
const db = new PrismaClient();
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const sessions = [], complaints = [], users = [], errors = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function pageFor(userId) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const token = randomBytes(32).toString("hex"), tokenHash = createHash("sha256").update(token).digest("hex");
  sessions.push({ context, tokenHash });
  await db.session.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + 600_000) } });
  await context.addCookies([{ name: "__Host-kfx_session", value: token, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => { if (request.url().startsWith(base) && request.failure()?.errorText !== "net::ERR_ABORTED") errors.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`); });
  return page;
}

try {
  const suffix = randomBytes(5).toString("hex"), city = await db.city.findUniqueOrThrow({ where: { slug: "karachi" } });
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
  const citizen = await db.user.create({ data: { name: "[QA TEST] Map guidance citizen", email: `qa-map-guidance-${suffix}@example.test`, passwordHash: "test-only", role: "CITIZEN" } }); users.push(citizen.id);
  const pinless = await db.complaint.create({ data: { userId: citizen.id, cityId: city.id, reference: `KFX-QA-PL-${suffix.toUpperCase()}`, title: "[QA TEST] Pin-less road surface", description: "[QA TEST] Fictional uneven road surface", category: "Roads & potholes", district: "East", area: "Gulshan-e-Iqbal", status: "VERIFIED" } }); complaints.push(pinless.id);
  const pinned = await db.complaint.create({ data: { userId: citizen.id, cityId: city.id, reference: `KFX-QA-PN-${suffix.toUpperCase()}`, title: "[QA TEST] Pinned road surface", description: "[QA TEST] Fictional uneven public road surface", category: "Roads & potholes", district: "East", area: "Gulshan-e-Iqbal", status: "VERIFIED", latitude: 24.92012, longitude: 67.09012 } }); complaints.push(pinned.id);
  const adminPage = await pageFor(admin.id);
  await adminPage.goto(`${base}/admin/cases/${pinless.id}`);
  await adminPage.getByText("Advanced Controls", { exact: true }).click();
  await adminPage.getByText("A recorded issue pin is required for public map approval.", { exact: false }).waitFor();
  assert(await adminPage.getByRole("button", { name: "Approve verified case for public map" }).count() === 0, "pin-less map approval was still offered");
  assert((await db.complaint.findUniqueOrThrow({ where: { id: pinless.id } })).publicVisible === false, "pin-less case became public");
  await adminPage.goto(`${base}/admin/cases/${pinned.id}`);
  await adminPage.getByText("Advanced Controls", { exact: true }).click();
  await adminPage.getByRole("button", { name: "Approve verified case for public map" }).click();
  for (let attempt = 0; attempt < 50; attempt++) {
    if ((await db.complaint.findUniqueOrThrow({ where: { id: pinned.id } })).publicVisible) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert((await db.complaint.findUniqueOrThrow({ where: { id: pinned.id } })).publicVisible, "pinned approval did not persist");
  await adminPage.reload();
  await adminPage.getByText("Advanced Controls", { exact: true }).click();
  await adminPage.getByText("Approved with an approximate marker.").waitFor();
  const approved = await db.complaint.findUniqueOrThrow({ where: { id: pinned.id } });
  assert(approved.publicVisible && approved.publicLatitude === 24.92 && approved.publicLongitude === 67.09, "pinned case was not approved with approximate coordinates");
  const publicMap = await (await fetch(`${base}/api/map`)).text();
  assert(publicMap.includes(pinned.id) && !publicMap.includes(pinless.id) && !publicMap.includes("24.92012"), "public map leaked private or exact location");

  const citizenPage = await pageFor(citizen.id);
  await citizenPage.goto(`${base}/report`);
  await citizenPage.getByLabel("Issue category *").selectOption("Streetlights");
  await citizenPage.getByLabel("Short issue title *").fill("[QA TEST] Pin-less streetlight report");
  await citizenPage.getByLabel("Describe the problem *").fill("[QA TEST] Fictional streetlight not working near a public road.");
  await citizenPage.getByRole("button", { name: "Continue" }).click();
  await citizenPage.getByText("A map pin is optional for submitting your report.", { exact: false }).waitFor();
  await citizenPage.getByLabel("Karachi district *").selectOption("East");
  await citizenPage.getByLabel("Search town or neighborhood *").fill("Gulshan-e-Iqbal");
  await citizenPage.getByRole("option", { name: "Gulshan-e-Iqbal" }).click();
  await citizenPage.getByRole("button", { name: "Continue" }).click();
  await citizenPage.getByRole("button", { name: "Continue" }).click();
  await citizenPage.getByText("Your report can still be submitted using the selected area", { exact: false }).waitFor();
  await citizenPage.getByRole("button", { name: "Submit Report" }).click();
  await citizenPage.getByText("Report received. Save your reference").waitFor();
  const reference = new URL(citizenPage.url()).searchParams.get("ref");
  const submitted = await db.complaint.findUniqueOrThrow({ where: { reference } }); complaints.push(submitted.id);
  assert(submitted.userId === citizen.id && submitted.latitude == null && submitted.longitude == null, "pin-less submission lost owner or invented coordinates");
  await citizenPage.goto(`${base}/track?ref=${encodeURIComponent(reference)}`);
  assert(await citizenPage.getByText("[QA TEST] Pin-less streetlight report").count() > 0, "owner could not track pin-less report");
  assert(errors.length === 0, `browser errors: ${errors.join(" | ")}`);
  console.log("PASS: pin-less admin map guidance and hidden action; pinned map approval with approximate marker; pin-less wizard submission and owner tracking; public coordinate privacy; no browser errors");
} finally {
  for (const session of sessions) await session.context.close();
  if (sessions.length) await db.session.deleteMany({ where: { tokenHash: { in: sessions.map(item => item.tokenHash) } } });
  await db.auditLog.deleteMany({ where: { targetId: { in: complaints } } });
  await db.caseLink.deleteMany({ where: { sourceComplaintId: { in: complaints } } });
  await db.notificationDeliveryAttempt.deleteMany({ where: { outbox: { complaintId: { in: complaints } } } });
  await db.notificationOutbox.deleteMany({ where: { complaintId: { in: complaints } } });
  await db.notification.deleteMany({ where: { complaintId: { in: complaints } } });
  await db.caseEvent.deleteMany({ where: { complaintId: { in: complaints } } });
  await db.complaintSlaSnapshot.deleteMany({ where: { complaintId: { in: complaints } } });
  await db.complaint.deleteMany({ where: { id: { in: complaints } } });
  if (users.length) await db.user.deleteMany({ where: { id: { in: users } } });
  await browser.close(); await db.$disconnect();
}
