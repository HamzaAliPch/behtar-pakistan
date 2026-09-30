import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { approveStoryContent, approveStoryEvidence, approveStoryPublicDetails } from "../src/lib/operations/completed-work";
import { citizenResolution, transitionComplaint } from "../src/lib/operations/cases";
import { PublicMapApprovalError, setPublicVisibility } from "../src/lib/geo";
import { getPublishedStory } from "../src/lib/completed-work-public";
import { privateStoragePath } from "../src/lib/private-storage";
import { consumePasswordReset, requestPasswordReset } from "../src/lib/auth/password-recovery";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { formatPakistanDateTime } from "../src/lib/pakistan-time";
import { processNotificationOutbox, scheduleResolutionReminders } from "../src/lib/notifications";

const isolated = process.env.DATABASE_URL?.includes("auth-test.db") && process.env.AUTH_TEST_MODE === "1";

test("[QA TEST] pin-less verified work publishes without a map marker and confirmation is idempotent", { skip: !isolated }, async () => {
  const db = new PrismaClient(), suffix = randomBytes(6).toString("hex");
  const files: string[] = [], users: string[] = [];
  let complaintId = "";
  try {
    const city = await db.city.findUniqueOrThrow({ where: { slug: "karachi" } });
    const admin = await db.user.create({ data: { name: "[QA TEST] Story admin", email: `qa-pinless-admin-${suffix}@example.test`, passwordHash: "test-only", role: "ADMIN" } }); users.push(admin.id);
    const owner = await db.user.create({ data: { name: "[QA TEST] Volunteer owner", email: `qa-pinless-owner-${suffix}@example.test`, passwordHash: "test-only", role: "VOLUNTEER" } }); users.push(owner.id);
    const unrelated = await db.user.create({ data: { name: "[QA TEST] Unrelated", email: `qa-pinless-other-${suffix}@example.test`, passwordHash: "test-only", role: "CITIZEN" } }); users.push(unrelated.id);
    const actor = { id: admin.id, role: admin.role }, ownerActor = { id: owner.id, role: owner.role };
    const complaint = await db.complaint.create({ data: { userId: owner.id, cityId: city.id, reference: `KFX-QA-${suffix.toUpperCase()}`, title: "[QA TEST] Fictional streetlight", description: "[QA TEST] Fictional report with no location pin.", category: "Streetlights", district: "East", area: "Gulistan-e-Johar" } }); complaintId = complaint.id;
    const makeImage = async (stage: "BEFORE" | "AFTER") => {
      const storageKey = `${randomBytes(20).toString("hex")}.png`, location = privateStoragePath(storageKey);
      await mkdir(path.dirname(location), { recursive: true }); await writeFile(location, Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), { flag: "wx" }); files.push(location);
      return db.evidence.create({ data: { complaintId, uploaderId: admin.id, stage, visibility: "OWNER", storageKey, originalName: "qa.png", mimeType: "image/png", size: 16 } });
    };
    const before = await makeImage("BEFORE"), after = await makeImage("AFTER");
    await transitionComplaint(actor, complaintId, "UNDER_REVIEW", "[QA TEST] Review started");
    await transitionComplaint(actor, complaintId, "VERIFIED", "[QA TEST] Fictional report verified");
    await assert.rejects(setPublicVisibility(actor, complaintId, true, "[QA TEST] Public streetlight", "Gulistan-e-Johar"), (error: unknown) => error instanceof PublicMapApprovalError && error.code === "location_required");
    await assert.rejects(approveStoryPublicDetails({ id: unrelated.id, role: "CITIZEN" }, complaintId, "Fictional streetlight repaired", "Gulistan-e-Johar"));
    await approveStoryPublicDetails(actor, complaintId, "Fictional streetlight repaired", "Gulistan-e-Johar");
    await approveStoryContent(actor, complaintId, "[QA TEST] A streetlight was reported out in a public area.", "[QA TEST] The team repaired and documented the fictional light.");
    await approveStoryEvidence(actor, before.id, true, true); await approveStoryEvidence(actor, after.id, true, true);
    await transitionComplaint(actor, complaintId, "RESOLUTION_PROPOSED", "[QA TEST] Fictional completion proposed");
    assert.equal((await db.completedWorkStory.findUniqueOrThrow({ where: { complaintId } })).status, "DRAFT");
    await assert.rejects(citizenResolution({ id: unrelated.id, role: "CITIZEN" }, complaintId, "CONFIRM"), { code: "forbidden" });
    await citizenResolution(ownerActor, complaintId, "CONFIRM");
    await citizenResolution(ownerActor, complaintId, "CONFIRM");
    assert.equal(await db.caseEvent.count({ where: { complaintId, kind: "CITIZEN_CONFIRM" } }), 1);
    const story = await db.completedWorkStory.findUniqueOrThrow({ where: { complaintId } });
    assert.equal(story.status, "PUBLISHED");
    assert.equal((await getPublishedStory(story.id))?.reference, complaint.reference);
    assert.equal((await getPublishedStory(story.id))?.publicMapCase, false);
    const current = await db.complaint.findUniqueOrThrow({ where: { id: complaintId } });
    assert.equal(current.latitude, null); assert.equal(current.publicLatitude, null); assert.equal(current.publicVisible, false);
    await approveStoryEvidence(actor, after.id, false, false);
    assert.equal((await db.completedWorkStory.findUniqueOrThrow({ where: { complaintId } })).status, "WITHDRAWN");
    assert.equal(await getPublishedStory(story.id), null);
    await approveStoryContent(actor, complaintId, "[QA TEST] The fictional streetlight was out in a public area.", "[QA TEST] The team documented a fictional repair.");
    assert.equal((await db.completedWorkStory.findUniqueOrThrow({ where: { complaintId } })).problemSummary, "[QA TEST] The fictional streetlight was out in a public area.");
    assert.match(formatPakistanDateTime(complaint.createdAt), / PKT$/);
  } finally {
    if (complaintId) await db.complaint.delete({ where: { id: complaintId } });
    await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await db.notificationDeliveryAttempt.deleteMany({ where: { outbox: { userId: { in: users } } } });
    await db.notificationOutbox.deleteMany({ where: { userId: { in: users } } });
    await db.notification.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    for (const file of files) await unlink(file).catch(() => undefined);
    await db.$disconnect();
  }
});

test("[QA TEST] password reset tokens are private, single-use, short-lived and revoke sessions", { skip: !isolated }, async () => {
  const db = new PrismaClient(), suffix = randomBytes(6).toString("hex"), email = `qa-recovery-${suffix}@example.test`;
  let userId = "", captured = "";
  const password = `qa-original-${suffix}-secret`, next = `qa-new-${suffix}-secret`;
  try {
    const user = await db.user.create({ data: { name: "[QA TEST] Citizen", email, passwordHash: await hashPassword(password), role: "CITIZEN" } }); userId = user.id;
    const token = randomBytes(32).toString("hex");
    await db.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
    assert.deepEqual(await requestPasswordReset(email), { available: false });
    assert.equal(await db.passwordResetToken.count({ where: { userId } }), 0);
    const provider = { origin: "http://127.0.0.1:3100", deliver: async (_to: string, url: string) => { captured = new URL(url).searchParams.get("token") ?? ""; } };
    assert.deepEqual(await requestPasswordReset("unknown-" + email, provider), { available: true });
    await requestPasswordReset(email, provider);
    assert.match(captured, /^[a-f0-9]{64}$/);
    const row = await db.passwordResetToken.findFirstOrThrow({ where: { userId } });
    assert.notEqual(row.tokenHash, captured);
    assert.equal(await consumePasswordReset(captured, next), true);
    assert.equal(await consumePasswordReset(captured, next), false);
    assert.equal(await db.session.count({ where: { userId } }), 0);
    assert.equal(await verifyPassword(next, (await db.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash), true);
    assert.equal(await consumePasswordReset(randomBytes(32).toString("hex"), next), false);
    const baseTime = new Date();
    await requestPasswordReset(email, provider, baseTime);
    await requestPasswordReset(email, provider, new Date(baseTime.getTime() + 1000));
    const countBeforeLimit = await db.passwordResetToken.count({ where: { userId } });
    await requestPasswordReset(email, provider, new Date(baseTime.getTime() + 2000));
    assert.equal(await db.passwordResetToken.count({ where: { userId } }), countBeforeLimit, "fourth request within an hour must be throttled");
    assert.equal(await consumePasswordReset(captured, next, new Date(baseTime.getTime() + 21 * 60_000)), false, "a reset link must expire after 20 minutes");
  } finally {
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.passwordResetThrottle.deleteMany({ where: { key: { in: [email, `unknown-${email}`].map(value => `email:${createHash("sha256").update(value).digest("hex")}`) } } });
    await db.$disconnect();
  }
});

test("[QA TEST] injected clock schedules 24h and 72h reminders without resolving the case", { skip: !isolated }, async () => {
  const db = new PrismaClient(), suffix = randomBytes(6).toString("hex");
  let userId = "", adminId = "", complaintId = "";
  try {
    const owner = await db.user.create({ data: { name: "[QA TEST] Reminder owner", email: `qa-reminder-${suffix}@example.test`, passwordHash: "test-only", role: "CITIZEN" } }); userId = owner.id;
    const admin = await db.user.create({ data: { name: "[QA TEST] Reminder admin", email: `qa-reminder-admin-${suffix}@example.test`, passwordHash: "test-only", role: "ADMIN" } }); adminId = admin.id;
    const complaint = await db.complaint.create({ data: { userId, reference: `KFX-QA-REM-${suffix.toUpperCase()}`, title: "[QA TEST] Reminder case", description: "[QA TEST] Fictional reminder timing.", category: "Other", area: "Gulshan-e-Iqbal", status: "RESOLUTION_PROPOSED" } }); complaintId = complaint.id;
    const at = new Date("2030-01-01T00:00:00.000Z");
    for (let index = 0; index < 2; index++) await db.$transaction(tx => scheduleResolutionReminders(tx, { userId, complaintId, reference: complaint.reference, proposalEventId: `qa-proposal-${suffix}`, at }));
    const rows = await db.notificationOutbox.findMany({ where: { complaintId, kind: "RESOLUTION_REMINDER" }, orderBy: { dueAt: "asc" } });
    assert.equal(rows.length, 2, "duplicate scheduling must not create duplicate reminders");
    assert.deepEqual(rows.map(row => (row.dueAt.getTime() - at.getTime()) / 3_600_000), [24, 72]);
    await processNotificationOutbox(new Date(at.getTime() + 23 * 3_600_000));
    assert.equal(await db.notification.count({ where: { complaintId, kind: "RESOLUTION_REMINDER" } }), 0);
    await processNotificationOutbox(new Date(at.getTime() + 24 * 3_600_000));
    assert.equal(await db.notification.count({ where: { complaintId, kind: "RESOLUTION_REMINDER" } }), 1);
    await processNotificationOutbox(new Date(at.getTime() + 24 * 3_600_000));
    assert.equal(await db.notification.count({ where: { complaintId, kind: "RESOLUTION_REMINDER" } }), 1);
    assert.equal((await db.complaint.findUniqueOrThrow({ where: { id: complaintId } })).status, "RESOLUTION_PROPOSED");
    await transitionComplaint({ id: admin.id, role: admin.role }, complaintId, "REOPENED", "[QA TEST] Proposed resolution withdrawn for review");
    assert.equal(await db.notificationOutbox.count({ where: { complaintId, kind: "RESOLUTION_REMINDER", status: "CANCELLED" } }), 1);
    await processNotificationOutbox(new Date(at.getTime() + 73 * 3_600_000));
    assert.equal(await db.notification.count({ where: { complaintId, kind: "RESOLUTION_REMINDER" } }), 1);
  } finally {
    if (complaintId) {
      await db.notificationDeliveryAttempt.deleteMany({ where: { outbox: { complaintId } } });
      await db.notificationOutbox.deleteMany({ where: { complaintId } });
      await db.notification.deleteMany({ where: { OR: [{ complaintId }, { href: `/admin/cases/${complaintId}` }] } });
      await db.complaint.delete({ where: { id: complaintId } });
    }
    await db.auditLog.deleteMany({ where: { actorId: { in: [userId, adminId].filter(Boolean) } } });
    if (userId) await db.user.delete({ where: { id: userId } });
    if (adminId) await db.user.delete({ where: { id: adminId } });
    await db.$disconnect();
  }
});
