import { testCookieName } from "./http-cookie";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { setVolunteerActive, updateTeamProfile } from "../src/lib/operations/team";
import { createTask, updateTaskStatus } from "../src/lib/operations/tasks";

const base = process.env.AUTH_TEST_BASE_URL;
test("team profiles, assignments and paused volunteer permissions", { skip: !base }, async () => {
  if (!base || !process.env.DATABASE_URL?.includes("auth-test.db")) throw new Error("Team tests require isolated auth-test.db");
  const db = new PrismaClient(), suffix = randomBytes(5).toString("hex");
  const users: string[] = [], complaints: string[] = [], tasks: string[] = [];
  let applicationId = "";
  try {
    const passwordHash = await hashPassword(`team-${suffix}-password`);
    const [admin, volunteer, citizen] = await Promise.all(["ADMIN", "VOLUNTEER", "CITIZEN"].map((role, index) => db.user.create({ data: { name: `Team ${index}`, email: `team-${index}-${suffix}@example.test`, passwordHash, role: role as "ADMIN" | "VOLUNTEER" | "CITIZEN" } })));
    users.push(admin.id, volunteer.id, citizen.id);
    const adminActor = { id: admin.id, role: admin.role }, volunteerActor = { id: volunteer.id, role: volunteer.role }, citizenActor = { id: citizen.id, role: citizen.role };
    const application = await db.volunteerApplication.create({ data: { userId: volunteer.id, fullName: "Field Volunteer", district: "East", serviceArea: "Gulshan-e-Iqbal", contactPhone: "+923001234567", contactEmail: volunteer.email, skills: "Field survey", availability: "Weekends", status: "APPROVED" } });
    applicationId = application.id;
    const complaint = await db.complaint.create({ data: { reference: `KFX-TEAM-${suffix.toUpperCase()}`, title: "Broken light at junction", category: "Streetlights", description: "A broken light at a public junction", area: "Gulshan-e-Iqbal", district: "East", status: "VERIFIED", userId: citizen.id } });
    complaints.push(complaint.id);
    await db.caseEvent.create({ data: { complaintId: complaint.id, actorId: admin.id, kind: "VERIFIED", summary: "Team test verification", visibility: "INTERNAL" } });
    await assert.rejects(() => updateTeamProfile(citizenActor, application.id, { district: "East", serviceArea: "Gulshan-e-Iqbal", availability: "Weekdays", skills: "Survey" }));
    await assert.rejects(() => updateTeamProfile(adminActor, application.id, { district: "Japan", serviceArea: "Gulshan-e-Iqbal", availability: "Weekdays", skills: "Survey" }));
    await updateTeamProfile(adminActor, application.id, { district: "Central", serviceArea: "North Nazimabad", availability: "Weekdays", skills: "Photo documentation" });
    assert.equal((await db.volunteerApplication.findUniqueOrThrow({ where: { id: application.id } })).serviceArea, "North Nazimabad");
    const task = await createTask(adminActor, { complaintId: complaint.id, assigneeId: volunteer.id, type: "FIELD_VISIT", priority: "NORMAL", deadline: new Date(Date.now() + 86_400_000).toISOString(), instructions: "Visit the junction and document the light." });
    tasks.push(task.id);
    assert.equal(task.assigneeId, volunteer.id);
    const token = randomBytes(32).toString("hex");
    await db.session.create({ data: { userId: admin.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
    assert.equal((await fetch(`${base}/admin/team`, { redirect: "manual" })).status, 307);
    assert.equal((await fetch(`${base}/admin/team`, { headers: { Cookie: `${testCookieName}=${token}` } })).status, 200);
    const paused = await setVolunteerActive(adminActor, application.id, false);
    assert.equal(paused.unassigned, 1);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: volunteer.id } })).role, "CITIZEN");
    assert.equal((await db.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId, null);
    await assert.rejects(() => updateTaskStatus(volunteerActor, task.id, "IN_PROGRESS"));
    await assert.rejects(() => setVolunteerActive(citizenActor, application.id, true));
    await setVolunteerActive(adminActor, application.id, true);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: volunteer.id } })).role, "VOLUNTEER");
    assert.equal((await db.volunteerApplication.findUniqueOrThrow({ where: { id: application.id } })).status, "APPROVED");
    assert.ok(await db.auditLog.count({ where: { targetId: application.id, action: "TEAM_MEMBER_DEACTIVATED" } }));
  } finally {
    if (tasks.length) await db.task.deleteMany({ where: { id: { in: tasks } } });
    if (complaints.length) await db.complaint.deleteMany({ where: { id: { in: complaints } } });
    if (applicationId) await db.volunteerApplication.delete({ where: { id: applicationId } });
    if (users.length) { await db.auditLog.deleteMany({ where: { actorId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } }); }
    await db.$disconnect();
  }
});
