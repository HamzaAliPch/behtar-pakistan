import { testCookieName } from "./http-cookie";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { createContact, linkContactComplaint, linkContactProject, recordContactInteraction, updateContact } from "../src/lib/operations/contacts";

const base = process.env.AUTH_TEST_BASE_URL;
test("private CRM access, duplicate checks, follow-ups and links", { skip: !base }, async () => {
  if (!base || !process.env.DATABASE_URL?.includes("auth-test.db")) throw new Error("CRM tests require isolated auth-test.db");
  const db = new PrismaClient(), suffix = randomBytes(5).toString("hex");
  const users: string[] = [], contacts: string[] = [];
  let complaintId = "", ngoId = "", projectId = "";
  try {
    const passwordHash = await hashPassword(`crm-${suffix}-password`);
    const [admin, citizen] = await Promise.all(["ADMIN", "CITIZEN"].map((role, index) => db.user.create({ data: { name: `CRM ${index}`, email: `crm-${index}-${suffix}@example.test`, passwordHash, role: role as "ADMIN" | "CITIZEN" } })));
    users.push(admin.id, citizen.id);
    const adminActor = { id: admin.id, role: admin.role }, citizenActor = { id: citizen.id, role: citizen.role };
    const input = { name: `Private Donor ${suffix}`, category: "DONOR", organization: "Community", email: `private-${suffix}@example.test`, phone: "+92 300 1234567", serviceArea: "District East", ownerId: admin.id, notes: "Private contact notes" };
    await assert.rejects(() => createContact(citizenActor, input));
    const contact = await createContact(adminActor, input); contacts.push(contact.id);
    await assert.rejects(() => createContact(adminActor, { ...input, name: "Different person", phone: "+923009999999" }));
    await assert.rejects(() => createContact(adminActor, { ...input, email: "new@example.test", phone: "0300-1234567" }));
    await assert.rejects(() => updateContact(citizenActor, contact.id, input));
    await updateContact(adminActor, contact.id, { ...input, serviceArea: "District Central" });
    const followUp = new Date(Date.now() + 86_400_000).toISOString();
    await assert.rejects(() => recordContactInteraction(citizenActor, contact.id, { channel: "PHONE", summary: "Called to review the community project." }));
    await recordContactInteraction(adminActor, contact.id, { channel: "PHONE", summary: "Called to review the community project.", nextFollowUpAt: followUp });
    assert.ok((await db.crmContact.findUniqueOrThrow({ where: { id: contact.id } })).nextFollowUpAt);
    const complaint = await db.complaint.create({ data: { reference: `KFX-CRM-${suffix.toUpperCase()}`, title: "Public road issue", category: "Other", description: "A public road has a reported issue.", area: "Karachi" } }); complaintId = complaint.id;
    const ngo = await db.partnerNgo.create({ data: { name: `CRM NGO ${suffix}`, contactPerson: "Coordinator", serviceAreas: "East", expertise: "Road support", status: "ACTIVE", verifiedAt: new Date(), verifiedById: admin.id, agreementNote: "Test agreement reviewed by admin." } }); ngoId = ngo.id;
    const project = await db.ngoProject.create({ data: { ngoId, title: "Road documentation", description: "Document this project's road work", complaintId } }); projectId = project.id;
    await assert.rejects(() => linkContactComplaint(citizenActor, contact.id, complaintId));
    await linkContactComplaint(adminActor, contact.id, complaintId);
    await linkContactProject(adminActor, contact.id, projectId);
    assert.equal(await db.contactCaseLink.count({ where: { contactId: contact.id } }), 1);
    assert.equal(await db.contactProjectLink.count({ where: { contactId: contact.id } }), 1);
    const token = randomBytes(32).toString("hex");
    await db.session.create({ data: { userId: admin.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
    assert.equal((await fetch(`${base}/admin/contacts`, { redirect: "manual" })).status, 307);
    assert.equal((await fetch(`${base}/admin/contacts/${contact.id}`, { redirect: "manual" })).status, 307);
    assert.equal((await fetch(`${base}/admin/contacts`, { headers: { Cookie: `${testCookieName}=${token}` } })).status, 200);
    const detail = await (await fetch(`${base}/admin/contacts/${contact.id}`, { headers: { Cookie: `${testCookieName}=${token}` } })).text();
    assert.match(detail, /Private contact notes|Public road issue/);
    assert.doesNotMatch(await (await fetch(`${base}/funds`)).text(), new RegExp(`private-${suffix}@example\\.test|Private contact notes`));
  } finally {
    if (contacts.length) await db.crmContact.deleteMany({ where: { id: { in: contacts } } });
    if (projectId) await db.ngoProject.delete({ where: { id: projectId } });
    if (ngoId) await db.partnerNgo.delete({ where: { id: ngoId } });
    if (complaintId) await db.complaint.delete({ where: { id: complaintId } });
    if (users.length) { await db.auditLog.deleteMany({ where: { actorId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } }); }
    await db.$disconnect();
  }
});
