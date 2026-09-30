import { prisma } from "@/lib/prisma";
import { audit, OperationError, requireAdmin, text, type Actor, type Tx } from "./common";

export const contactCategories = ["GOVERNMENT_DEPARTMENT", "NGO", "VOLUNTEER", "CONTRACTOR", "COMMUNITY_REPRESENTATIVE", "DONOR", "OTHER_ORGANIZATION"] as const;
export const interactionChannels = ["PHONE", "EMAIL", "WHATSAPP", "MEETING", "IN_PERSON", "OTHER"] as const;
const normalizePhone = (value: string) => { const digits = value.replace(/\D/g, ""); return /^0\d{10}$/.test(digits) ? `92${digits.slice(1)}` : digits; };
const normalizeText = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

type ContactInput = { name: string; organization?: string; category: string; phone?: string; email?: string; whatsapp?: string; serviceArea?: string; notes?: string; nextFollowUpAt?: string; ownerId?: string; ngoId?: string; departmentId?: string };
function parseInput(input: ContactInput) {
  const name = text(input.name, 2, 120), organization = input.organization?.trim() || null;
  if (organization && organization.length > 160) throw new OperationError("invalid");
  if (!contactCategories.includes(input.category as typeof contactCategories[number])) throw new OperationError("invalid");
  const phone = input.phone?.trim() || null, email = input.email?.trim().toLowerCase() || null, whatsapp = input.whatsapp?.trim() || null;
  if (phone && (!/^\+?[0-9 ()-]{7,30}$/.test(phone) || normalizePhone(phone).length < 7)) throw new OperationError("invalid");
  if (whatsapp && !/^\+?[0-9 ()-]{7,30}$/.test(whatsapp)) throw new OperationError("invalid");
  if (email && (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new OperationError("invalid");
  const serviceArea = input.serviceArea?.trim() || null, notes = input.notes?.trim() || null;
  if ((serviceArea && serviceArea.length > 200) || (notes && notes.length > 2000)) throw new OperationError("invalid");
  const nextFollowUpAt = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null;
  if (nextFollowUpAt && (Number.isNaN(nextFollowUpAt.getTime()) || nextFollowUpAt < new Date("2020-01-01"))) throw new OperationError("invalid");
  return { name, organization, category: input.category, phone, normalizedPhone: phone ? normalizePhone(phone) : null, email, normalizedEmail: email, whatsapp, serviceArea, notes, nextFollowUpAt, ownerId: input.ownerId || null, ngoId: input.ngoId || null, departmentId: input.departmentId || null };
}

async function validateLinks(tx: Tx, data: ReturnType<typeof parseInput>) {
  if (data.ownerId && !await tx.user.findFirst({ where: { id: data.ownerId, role: "ADMIN" }, select: { id: true } })) throw new OperationError("invalid");
  if (data.ngoId && !await tx.partnerNgo.findUnique({ where: { id: data.ngoId }, select: { id: true } })) throw new OperationError("invalid");
  if (data.departmentId && !await tx.department.findUnique({ where: { id: data.departmentId }, select: { id: true } })) throw new OperationError("invalid");
  if (data.category === "NGO" && data.departmentId || data.category === "GOVERNMENT_DEPARTMENT" && data.ngoId) throw new OperationError("invalid");
}

async function checkDuplicate(tx: Tx, data: ReturnType<typeof parseInput>, exceptId?: string) {
  const candidates = await tx.crmContact.findMany({ where: { OR: [...(data.normalizedEmail ? [{ normalizedEmail: data.normalizedEmail }] : []), ...(data.normalizedPhone ? [{ normalizedPhone: data.normalizedPhone }] : []), { category: data.category }] }, select: { id: true, name: true, organization: true, normalizedEmail: true, normalizedPhone: true } });
  const match = candidates.find(item => item.id !== exceptId && (data.normalizedEmail && item.normalizedEmail === data.normalizedEmail || data.normalizedPhone && item.normalizedPhone === data.normalizedPhone || normalizeText(item.name) === normalizeText(data.name) && normalizeText(item.organization ?? "") === normalizeText(data.organization ?? "")));
  if (match) throw new OperationError("conflict");
}

export async function createContact(actor: Actor, input: ContactInput) {
  requireAdmin(actor);
  const data = parseInput(input);
  return prisma.$transaction(async tx => {
    await validateLinks(tx, data); await checkDuplicate(tx, data);
    const contact = await tx.crmContact.create({ data });
    await audit(tx, actor.id, "CONTACT_CREATED", "CrmContact", contact.id);
    return contact;
  });
}

export async function updateContact(actor: Actor, id: string, input: ContactInput) {
  requireAdmin(actor);
  const data = parseInput(input);
  return prisma.$transaction(async tx => {
    if (!await tx.crmContact.findUnique({ where: { id } })) throw new OperationError("not_found");
    await validateLinks(tx, data); await checkDuplicate(tx, data, id);
    const contact = await tx.crmContact.update({ where: { id }, data });
    await audit(tx, actor.id, "CONTACT_UPDATED", "CrmContact", id);
    return contact;
  });
}

export async function recordContactInteraction(actor: Actor, contactId: string, input: { channel: string; summary: string; happenedAt?: string; nextFollowUpAt?: string }) {
  requireAdmin(actor);
  if (!interactionChannels.includes(input.channel as typeof interactionChannels[number])) throw new OperationError("invalid");
  const summary = text(input.summary, 5, 2000), happenedAt = input.happenedAt ? new Date(input.happenedAt) : new Date(), nextFollowUpAt = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null;
  if (Number.isNaN(happenedAt.getTime()) || happenedAt > new Date() || happenedAt < new Date("2020-01-01") || nextFollowUpAt && Number.isNaN(nextFollowUpAt.getTime())) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    if (!await tx.crmContact.findUnique({ where: { id: contactId } })) throw new OperationError("not_found");
    const interaction = await tx.contactInteraction.create({ data: { contactId, actorId: actor.id, channel: input.channel, summary, happenedAt, nextFollowUpAt } });
    if (nextFollowUpAt) await tx.crmContact.update({ where: { id: contactId }, data: { nextFollowUpAt } });
    await audit(tx, actor.id, "CONTACT_INTERACTION", "CrmContact", contactId, input.channel);
    return interaction;
  });
}

export async function linkContactComplaint(actor: Actor, contactId: string, complaintId: string) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    if (!await tx.crmContact.findUnique({ where: { id: contactId } }) || !await tx.complaint.findUnique({ where: { id: complaintId } })) throw new OperationError("not_found");
    if (await tx.contactCaseLink.findUnique({ where: { contactId_complaintId: { contactId, complaintId } } })) throw new OperationError("conflict");
    await tx.contactCaseLink.create({ data: { contactId, complaintId } });
    await audit(tx, actor.id, "CONTACT_CASE_LINKED", "CrmContact", contactId, complaintId);
  });
}

export async function linkContactProject(actor: Actor, contactId: string, projectId: string) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const contact = await tx.crmContact.findUnique({ where: { id: contactId } });
    const project = await tx.ngoProject.findUnique({ where: { id: projectId } });
    if (!contact || !project) throw new OperationError("not_found");
    if (contact.ngoId && contact.ngoId !== project.ngoId) throw new OperationError("conflict");
    if (await tx.contactProjectLink.findUnique({ where: { contactId_projectId: { contactId, projectId } } })) throw new OperationError("conflict");
    await tx.contactProjectLink.create({ data: { contactId, projectId } });
    await audit(tx, actor.id, "CONTACT_PROJECT_LINKED", "CrmContact", contactId, projectId);
  });
}
