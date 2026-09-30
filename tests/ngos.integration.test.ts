import { testCookieName } from "./http-cookie";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { addNgoMilestone, completeNgoMilestone, createNgo, createNgoProject, linkNgoEvidence, linkNgoTask, recordNgoContribution, transitionNgo, transitionNgoProject, verifyNgoContribution } from "../src/lib/operations/ngos";
import { createTask } from "../src/lib/operations/tasks";

const base = process.env.AUTH_TEST_BASE_URL;
test("NGO agreement, project outcomes, links and admin-only permissions", { skip: !base }, async () => {
  if (!base || !process.env.DATABASE_URL?.includes("auth-test.db")) throw new Error("NGO tests require isolated auth-test.db");
  const db = new PrismaClient(), suffix = randomBytes(5).toString("hex");
  let ngoId = "", projectId = "", complaintId = "", taskId = "", evidenceId = "", milestoneId = "", contributionId = "";
  const userIds: string[] = [];
  try {
    const passwordHash = await hashPassword(`ngo-${suffix}-password`);
    const [admin, citizen] = await Promise.all(["ADMIN", "CITIZEN"].map((role, index) => db.user.create({ data: { name: `NGO ${index}`, email: `ngo-${index}-${suffix}@example.test`, passwordHash, role: role as "ADMIN" | "CITIZEN" } })));
    userIds.push(admin.id, citizen.id);
    const adminActor = { id: admin.id, role: admin.role }, citizenActor = { id: citizen.id, role: citizen.role };
    const profile = { name: `Community Group ${suffix}`, contactPerson: "Field Coordinator", contactEmail: "private-ngo@example.test", contactPhone: "+923001234567", serviceAreas: "District East", expertise: "Drainage and field visits" };
    await assert.rejects(() => createNgo(citizenActor, profile));
    const ngo = await createNgo(adminActor, profile); ngoId = ngo.id;
    assert.equal(ngo.status, "PROSPECTIVE");
    await assert.rejects(() => transitionNgo(adminActor, ngo.id, "ACTIVE", "Claimed agreement", true));
    await transitionNgo(adminActor, ngo.id, "CONTACTED");
    await transitionNgo(adminActor, ngo.id, "VERIFICATION_PENDING");
    await assert.rejects(() => transitionNgo(adminActor, ngo.id, "ACTIVE", "No agreement checked", false));
    await transitionNgo(adminActor, ngo.id, "ACTIVE", "Written partnership agreement reviewed by Karachi Fix on test date.", true);
    const complaint = await db.complaint.create({ data: { reference: `KFX-NGO-${suffix.toUpperCase()}`, title: "Flooded junction", category: "Water & drainage", description: "Drainage is blocked at public junction", area: "Gulshan-e-Iqbal", status: "VERIFIED" } }); complaintId = complaint.id;
    await assert.rejects(() => createNgoProject(adminActor, { ngoId, title: "Drainage survey", description: "Survey this verified junction and document outcomes.", complaintId }));
    await db.caseEvent.create({ data: { complaintId, actorId: admin.id, kind: "VERIFIED", summary: "Field verified", visibility: "INTERNAL" } });
    await assert.rejects(() => createNgoProject(citizenActor, { ngoId, title: "Drainage survey", description: "Survey this verified junction and document outcomes.", complaintId }));
    const project = await createNgoProject(adminActor, { ngoId, title: "Drainage survey", description: "Survey this verified junction and document outcomes.", complaintId }); projectId = project.id;
    const task = await createTask(adminActor, { complaintId, type: "FIELD_VISIT", priority: "NORMAL", deadline: new Date(Date.now() + 86_400_000).toISOString(), instructions: "Document the actual site conditions." }); taskId = task.id;
    await assert.rejects(() => linkNgoTask(citizenActor, projectId, taskId));
    await linkNgoTask(adminActor, projectId, taskId);
    assert.equal((await db.task.findUniqueOrThrow({ where: { id: taskId } })).ngoProjectId, projectId);
    const evidence = await db.evidence.create({ data: { complaintId, uploaderId: admin.id, stage: "BEFORE", visibility: "INTERNAL", storageKey: `${randomBytes(20).toString("hex")}.png`, originalName: "field.png", mimeType: "image/png", size: 12 } }); evidenceId = evidence.id;
    await linkNgoEvidence(adminActor, projectId, evidenceId);
    assert.equal((await db.evidence.findUniqueOrThrow({ where: { id: evidenceId } })).ngoProjectId, projectId);
    const milestone = await addNgoMilestone(adminActor, projectId, "Document blocked drain", new Date(Date.now() + 86_400_000).toISOString()); milestoneId = milestone.id;
    await transitionNgoProject(adminActor, projectId, "ACTIVE");
    await assert.rejects(() => transitionNgoProject(adminActor, projectId, "COMPLETED"));
    await completeNgoMilestone(adminActor, milestoneId, "Team documented the blockage at the site.");
    await transitionNgoProject(adminActor, projectId, "COMPLETED", "The field team documented the blockage and submitted a recorded outcome.", true);
    assert.equal((await db.ngoProject.findUniqueOrThrow({ where: { id: projectId } })).publicApproved, true);
    const contribution = await recordNgoContribution(adminActor, projectId, { kind: "IN_KIND", amount: "500", description: "Volunteer transport", documentation: "Documented staff trip invoice 123" }); contributionId = contribution.id;
    assert.equal(contribution.verifiedAt, null);
    await assert.rejects(() => verifyNgoContribution(citizenActor, contributionId));
    await verifyNgoContribution(adminActor, contributionId);
    const token = randomBytes(32).toString("hex");
    await db.session.create({ data: { userId: admin.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
    assert.equal((await fetch(`${base}/admin/ngos`, { redirect: "manual" })).status, 307);
    assert.equal((await fetch(`${base}/admin/ngos`, { headers: { Cookie: `${testCookieName}=${token}` } })).status, 200);
    assert.equal((await fetch(`${base}/admin/ngos/${ngoId}`, { headers: { Cookie: `${testCookieName}=${token}` } })).status, 200);
    assert.doesNotMatch(await (await fetch(`${base}/funds`)).text(), /private-ngo@example.test|Community Group/);
  } finally {
    if (contributionId) await db.ngoContribution.delete({ where: { id: contributionId } });
    if (milestoneId) await db.ngoMilestone.delete({ where: { id: milestoneId } });
    if (evidenceId) await db.evidence.delete({ where: { id: evidenceId } });
    if (taskId) await db.task.delete({ where: { id: taskId } });
    if (projectId) await db.ngoProject.delete({ where: { id: projectId } });
    if (ngoId) await db.partnerNgo.delete({ where: { id: ngoId } });
    if (complaintId) await db.complaint.delete({ where: { id: complaintId } });
    if (userIds.length) { await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } }); await db.user.deleteMany({ where: { id: { in: userIds } } }); }
    await db.$disconnect();
  }
});
