import { testCookieName } from "./http-cookie";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { evidenceDirectory, publishEvidence, uploadEvidence, validateFieldMedia } from "../src/lib/operations/evidence";

const base = process.env.AUTH_TEST_BASE_URL;
const mp4 = new File([Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0])], "field.mp4", { type: "video/mp4" });

test("private media library validates videos and enforces case/task access", { skip: !base }, async () => {
  if (!base || !process.env.DATABASE_URL?.includes("auth-test.db")) throw new Error("Evidence tests require isolated auth-test.db");
  const db = new PrismaClient(), suffix = randomBytes(5).toString("hex");
  const userIds: string[] = [], evidenceIds: string[] = [], keys: string[] = [];
  let complaintId = "", taskId = "", applicationId = "";
  async function cookie(userId: string) { const token = randomBytes(32).toString("hex"); await db.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } }); return `${testCookieName}=${token}`; }
  try {
    await assert.rejects(() => validateFieldMedia(new File(["not video"], "fake.mp4", { type: "video/mp4" })));
    await assert.rejects(() => validateFieldMedia(new File([new Uint8Array(30 * 1024 * 1024 + 1)], "large.mp4", { type: "video/mp4" })));
    assert.equal((await validateFieldMedia(mp4)).mime, "video/mp4");
    const passwordHash = await hashPassword(`media-${suffix}-password`);
    const [admin, volunteer, owner, outsider] = await Promise.all(["ADMIN", "VOLUNTEER", "CITIZEN", "CITIZEN"].map((role, index) => db.user.create({ data: { name: `Media ${index}`, email: `media-${index}-${suffix}@example.test`, passwordHash, role: role as "ADMIN" | "VOLUNTEER" | "CITIZEN" } })));
    userIds.push(admin.id, volunteer.id, owner.id, outsider.id);
    const adminActor = { id: admin.id, role: admin.role }, volunteerActor = { id: volunteer.id, role: volunteer.role };
    const application = await db.volunteerApplication.create({ data: { userId: volunteer.id, fullName: "Field Media Volunteer", district: "East", serviceArea: "Gulshan", contactPhone: "+923001234567", contactEmail: volunteer.email, skills: "Field photos", availability: "Weekdays", status: "APPROVED" } }); applicationId = application.id;
    const complaint = await db.complaint.create({ data: { reference: `KFX-MEDIA-${suffix.toUpperCase()}`, title: "Broken road edge", category: "Roads & potholes", description: "Road edge requires field evidence", area: "Gulshan", status: "VERIFIED", userId: owner.id } }); complaintId = complaint.id;
    const task = await db.task.create({ data: { code: `TASK-MEDIA-${suffix.toUpperCase()}`, complaintId, assigneeId: volunteer.id, createdById: admin.id, type: "FIELD_VISIT", priority: "NORMAL", deadline: new Date(Date.now() + 86_400_000), instructions: "Record safe field video of road edge.", status: "ASSIGNED" } }); taskId = task.id;
    await assert.rejects(() => uploadEvidence({ id: outsider.id, role: outsider.role }, { complaintId, taskId, stage: "BEFORE", file: mp4 }));
    const video = await uploadEvidence(volunteerActor, { complaintId, taskId, stage: "BEFORE", note: "Private field video", file: mp4 }); evidenceIds.push(video.id); keys.push(video.storageKey);
    assert.equal(video.mimeType, "video/mp4");
    const [adminCookie, volunteerCookie, ownerCookie, outsiderCookie] = await Promise.all([cookie(admin.id), cookie(volunteer.id), cookie(owner.id), cookie(outsider.id)]);
    const url = `${base}/api/evidence/${video.id}`;
    assert.equal((await fetch(url)).status, 404);
    assert.equal((await fetch(url, { headers: { Cookie: outsiderCookie } })).status, 404);
    assert.equal((await fetch(url, { headers: { Cookie: ownerCookie } })).status, 404);
    assert.equal((await fetch(url, { headers: { Cookie: volunteerCookie } })).status, 200);
    const range = await fetch(url, { headers: { Cookie: adminCookie, Range: "bytes=0-7" } });
    assert.equal(range.status, 206);
    assert.match(range.headers.get("content-range") ?? "", /^bytes 0-7\//);
    assert.equal((await range.arrayBuffer()).byteLength, 8);
    assert.equal((await fetch(`${base}/admin/evidence`, { redirect: "manual" })).status, 307);
    const adminPage = await (await fetch(`${base}/admin/evidence`, { headers: { Cookie: adminCookie } })).text();
    assert.match(adminPage, /Private field video|KFX-MEDIA-/);
    await publishEvidence(adminActor, video.id);
    assert.equal((await fetch(url, { headers: { Cookie: ownerCookie } })).status, 200);
    assert.ok((await db.evidence.findUniqueOrThrow({ where: { id: video.id } })).visibility === "OWNER");
  } finally {
    if (evidenceIds.length) await db.evidence.deleteMany({ where: { id: { in: evidenceIds } } });
    for (const key of keys) await unlink(path.join(evidenceDirectory, key)).catch(() => undefined);
    if (taskId) await db.task.delete({ where: { id: taskId } });
    if (complaintId) await db.complaint.delete({ where: { id: complaintId } });
    if (applicationId) await db.volunteerApplication.delete({ where: { id: applicationId } });
    if (userIds.length) { await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } }); await db.user.deleteMany({ where: { id: { in: userIds } } }); }
    await db.$disconnect();
  }
});
