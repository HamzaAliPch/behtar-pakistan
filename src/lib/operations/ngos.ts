import { prisma } from "@/lib/prisma";
import { audit, OperationError, requireAdmin, text, type Actor } from "./common";
import { reconcileCompletedWork } from "./completed-work";

export const ngoStatuses = ["PROSPECTIVE", "CONTACTED", "VERIFICATION_PENDING", "ACTIVE", "INACTIVE"] as const;
export const ngoProjectStatuses = ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
const nextNgo: Record<string, string[]> = { PROSPECTIVE: ["CONTACTED", "INACTIVE"], CONTACTED: ["VERIFICATION_PENDING", "INACTIVE"], VERIFICATION_PENDING: ["ACTIVE", "INACTIVE"], ACTIVE: ["INACTIVE"], INACTIVE: ["CONTACTED", "VERIFICATION_PENDING"] };
const nextProject: Record<string, string[]> = { PLANNED: ["ACTIVE", "CANCELLED"], ACTIVE: ["COMPLETED", "CANCELLED"], COMPLETED: [], CANCELLED: [] };
export const nextNgoStatuses = (status: string) => nextNgo[status] ?? [];
export const nextNgoProjectStatuses = (status: string) => nextProject[status] ?? [];
function safePublicText(value: string, min: number, max: number): string {
  const clean = text(value, min, max);
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(clean) || /\b(?:\+?\d[\d ()-]{8,}\d)\b/.test(clean) || /\b2[4-5]\.\d{3,}\s*[,/]\s*6[6-7]\.\d{3,}\b/.test(clean)) throw new OperationError("invalid");
  return clean;
}

export async function createNgo(actor: Actor, input: { name: string; contactPerson: string; contactEmail?: string; contactPhone?: string; publicContact?: string; serviceAreas: string; expertise: string }) {
  requireAdmin(actor);
  const name = text(input.name, 3, 140), contactPerson = text(input.contactPerson, 2, 120), serviceAreas = text(input.serviceAreas, 3, 500), expertise = text(input.expertise, 3, 500);
  const contactEmail = input.contactEmail?.trim() || null, contactPhone = input.contactPhone?.trim() || null, publicContact = input.publicContact?.trim() || null;
  if (contactEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.length > 150)) throw new OperationError("invalid");
  if (contactPhone && !/^\+?[0-9 ()-]{7,30}$/.test(contactPhone)) throw new OperationError("invalid");
  if (publicContact && publicContact.length > 200) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const ngo = await tx.partnerNgo.create({ data: { name, contactPerson, contactEmail, contactPhone, publicContact, serviceAreas, expertise, status: "PROSPECTIVE" } });
    await audit(tx, actor.id, "NGO_CREATED", "PartnerNgo", ngo.id);
    return ngo;
  });
}

export async function updateNgo(actor: Actor, id: string, input: { contactPerson: string; contactEmail?: string; contactPhone?: string; publicContact?: string; serviceAreas: string; expertise: string }) {
  requireAdmin(actor);
  const contactPerson = text(input.contactPerson, 2, 120), serviceAreas = text(input.serviceAreas, 3, 500), expertise = text(input.expertise, 3, 500);
  const contactEmail = input.contactEmail?.trim() || null, contactPhone = input.contactPhone?.trim() || null, publicContact = input.publicContact?.trim() || null;
  if (contactEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.length > 150)) throw new OperationError("invalid");
  if (contactPhone && !/^\+?[0-9 ()-]{7,30}$/.test(contactPhone)) throw new OperationError("invalid");
  if (publicContact && publicContact.length > 200) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const ngo = await tx.partnerNgo.findUnique({ where: { id } });
    if (!ngo) throw new OperationError("not_found");
    const updated = await tx.partnerNgo.update({ where: { id }, data: { contactPerson, contactEmail, contactPhone, publicContact, serviceAreas, expertise } });
    await audit(tx, actor.id, "NGO_PROFILE_UPDATED", "PartnerNgo", id);
    return updated;
  });
}

export async function transitionNgo(actor: Actor, id: string, status: string, agreementNote?: string, agreementConfirmed = false) {
  requireAdmin(actor);
  if (!ngoStatuses.includes(status as typeof ngoStatuses[number])) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const ngo = await tx.partnerNgo.findUnique({ where: { id } });
    if (!ngo) throw new OperationError("not_found");
    if (!nextNgo[ngo.status]?.includes(status)) throw new OperationError("conflict");
    const note = agreementNote?.trim() || null;
    if (status === "ACTIVE" && (!agreementConfirmed || !note || note.length < 20 || note.length > 1000)) throw new OperationError("invalid");
    const updated = await tx.partnerNgo.update({ where: { id }, data: { status, ...(status === "ACTIVE" ? { agreementNote: note, verifiedAt: new Date(), verifiedById: actor.id } : {}) } });
    await audit(tx, actor.id, "NGO_STATUS", "PartnerNgo", id, `${ngo.status} -> ${status}${status === "ACTIVE" ? `; agreement: ${note}` : ""}`);
    return updated;
  });
}

export async function createNgoProject(actor: Actor, input: { ngoId: string; title: string; description: string; complaintId?: string; campaignId?: string }) {
  requireAdmin(actor);
  const title = text(input.title, 5, 140), description = text(input.description, 20, 2000);
  return prisma.$transaction(async tx => {
    const ngo = await tx.partnerNgo.findUnique({ where: { id: input.ngoId } });
    if (!ngo || ngo.status !== "ACTIVE" || !ngo.verifiedAt) throw new OperationError("conflict");
    if (input.complaintId) {
      const complaint = await tx.complaint.findUnique({ where: { id: input.complaintId }, select: { id: true, events: { where: { kind: "VERIFIED" }, select: { id: true }, take: 1 } } });
      if (!complaint?.events.length) throw new OperationError("conflict");
    }
    if (input.campaignId) {
      const campaign = await tx.donationCampaign.findUnique({ where: { id: input.campaignId }, select: { id: true, approvedAt: true, status: true, complaintId: true } });
      if (!campaign?.approvedAt || !["PUBLISHED", "CLOSED"].includes(campaign.status) || (campaign.complaintId && input.complaintId !== campaign.complaintId)) throw new OperationError("conflict");
    }
    const project = await tx.ngoProject.create({ data: { ngoId: input.ngoId, title, description, complaintId: input.complaintId || null, campaignId: input.campaignId || null, createdById: actor.id } });
    await audit(tx, actor.id, "NGO_PROJECT_CREATED", "NgoProject", project.id);
    return project;
  });
}

export async function transitionNgoProject(actor: Actor, id: string, status: string, publicSummary?: string, publicApproved = false) {
  requireAdmin(actor);
  if (!ngoProjectStatuses.includes(status as typeof ngoProjectStatuses[number])) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const project = await tx.ngoProject.findUnique({ where: { id }, include: { ngo: true, milestones: true } });
    if (!project) throw new OperationError("not_found");
    if (!nextProject[project.status]?.includes(status)) throw new OperationError("conflict");
    if (status === "ACTIVE" && project.ngo.status !== "ACTIVE") throw new OperationError("conflict");
    if (status === "COMPLETED" && (!project.milestones.length || project.milestones.some(item => !item.completedAt || !item.outcome))) throw new OperationError("conflict");
    const summary = publicApproved ? safePublicText(publicSummary ?? "", 20, 1000) : null;
    if (publicApproved && project.ngo.status !== "ACTIVE") throw new OperationError("invalid");
    const updated = await tx.ngoProject.update({ where: { id }, data: { status, publicApproved, publicSummary: publicApproved ? summary : null } });
    await audit(tx, actor.id, "NGO_PROJECT_STATUS", "NgoProject", id, `${project.status} -> ${status}; public=${publicApproved}`);
    return updated;
  });
}

export async function setNgoProjectPublic(actor: Actor, id: string, approved: boolean, summaryInput?: string) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const project = await tx.ngoProject.findUnique({ where: { id }, include: { ngo: true } });
    if (!project) throw new OperationError("not_found");
    if (approved && (project.ngo.status !== "ACTIVE" || !["ACTIVE", "COMPLETED"].includes(project.status))) throw new OperationError("conflict");
    const summary = approved ? safePublicText(summaryInput ?? "", 20, 1000) : null;
    const updated = await tx.ngoProject.update({ where: { id }, data: { publicApproved: approved, publicSummary: summary } });
    await audit(tx, actor.id, approved ? "NGO_PROJECT_PUBLISHED" : "NGO_PROJECT_UNPUBLISHED", "NgoProject", id);
    return updated;
  });
}

export async function setNgoMilestonePublic(actor: Actor, id: string, approved: boolean) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const milestone = await tx.ngoMilestone.findUnique({ where: { id }, include: { project: { include: { ngo: true } } } });
    if (!milestone) throw new OperationError("not_found");
    if (approved && (!milestone.completedAt || !milestone.outcome || !milestone.project.publicApproved || milestone.project.ngo.status !== "ACTIVE")) throw new OperationError("conflict");
    if (approved) safePublicText(milestone.outcome!, 10, 1000);
    const updated = await tx.ngoMilestone.update({ where: { id }, data: { publicApproved: approved } });
    await audit(tx, actor.id, approved ? "NGO_MILESTONE_PUBLISHED" : "NGO_MILESTONE_UNPUBLISHED", "NgoMilestone", id);
    return updated;
  });
}

export async function setNgoEvidencePublic(actor: Actor, id: string, approved: boolean, contentChecked: boolean) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const evidence = await tx.evidence.findUnique({ where: { id }, include: { ngoProject: { include: { ngo: true } } } });
    if (!evidence) throw new OperationError("not_found");
    if (approved && (!contentChecked || !evidence.ngoProject?.publicApproved || evidence.ngoProject.ngo.status !== "ACTIVE" || !evidence.mimeType.startsWith("image/"))) throw new OperationError("conflict");
    const updated = await tx.evidence.update({ where: { id }, data: { publicApprovedAt: approved ? new Date() : null, publicApprovedById: approved ? actor.id : null } });
    await audit(tx, actor.id, approved ? "NGO_EVIDENCE_PUBLISHED" : "NGO_EVIDENCE_UNPUBLISHED", "Evidence", id);
    await reconcileCompletedWork(tx, evidence.complaintId, actor.id);
    return updated;
  });
}

export async function addNgoMilestone(actor: Actor, projectId: string, titleInput: string, due?: string) {
  requireAdmin(actor);
  const title = text(titleInput, 5, 160), dueAt = due ? new Date(due) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const project = await tx.ngoProject.findUnique({ where: { id: projectId } });
    if (!project || ["COMPLETED", "CANCELLED"].includes(project.status)) throw new OperationError("conflict");
    const milestone = await tx.ngoMilestone.create({ data: { projectId, title, dueAt } });
    await audit(tx, actor.id, "NGO_MILESTONE_ADDED", "NgoMilestone", milestone.id);
    return milestone;
  });
}

export async function completeNgoMilestone(actor: Actor, id: string, outcomeInput: string) {
  requireAdmin(actor);
  const outcome = text(outcomeInput, 10, 1000);
  return prisma.$transaction(async tx => {
    const milestone = await tx.ngoMilestone.findUnique({ where: { id }, include: { project: true } });
    if (!milestone || milestone.completedAt || milestone.project.status !== "ACTIVE") throw new OperationError("conflict");
    const updated = await tx.ngoMilestone.update({ where: { id }, data: { outcome, completedAt: new Date() } });
    await audit(tx, actor.id, "NGO_MILESTONE_COMPLETED", "NgoMilestone", id, outcome);
    return updated;
  });
}

export async function linkNgoTask(actor: Actor, projectId: string, taskId: string) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const project = await tx.ngoProject.findUnique({ where: { id: projectId }, include: { ngo: true } });
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!project || !task) throw new OperationError("not_found");
    if (project.ngo.status !== "ACTIVE" || !project.complaintId || project.complaintId !== task.complaintId || task.ngoProjectId) throw new OperationError("conflict");
    await tx.task.update({ where: { id: taskId }, data: { ngoProjectId: projectId, partnerName: project.ngo.name } });
    await audit(tx, actor.id, "NGO_TASK_LINKED", "Task", taskId, projectId);
  });
}

export async function linkNgoEvidence(actor: Actor, projectId: string, evidenceId: string) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const project = await tx.ngoProject.findUnique({ where: { id: projectId } });
    const evidence = await tx.evidence.findUnique({ where: { id: evidenceId } });
    if (!project || !evidence) throw new OperationError("not_found");
    if (!project.complaintId || project.complaintId !== evidence.complaintId || evidence.ngoProjectId) throw new OperationError("conflict");
    await tx.evidence.update({ where: { id: evidenceId }, data: { ngoProjectId: projectId } });
    await audit(tx, actor.id, "NGO_EVIDENCE_LINKED", "Evidence", evidenceId, projectId);
  });
}

export async function recordNgoContribution(actor: Actor, projectId: string, input: { kind: string; amount?: string; description: string; documentation: string }) {
  requireAdmin(actor);
  if (!["CASH", "IN_KIND"].includes(input.kind)) throw new OperationError("invalid");
  const amountPkr = input.amount?.trim() ? Number(input.amount) : null;
  if (amountPkr != null && (!Number.isSafeInteger(amountPkr) || amountPkr < 1 || amountPkr > 10_000_000)) throw new OperationError("invalid");
  const description = text(input.description, 5, 300), documentation = text(input.documentation, 10, 1000);
  return prisma.$transaction(async tx => {
    const project = await tx.ngoProject.findUnique({ where: { id: projectId } });
    if (!project) throw new OperationError("not_found");
    const contribution = await tx.ngoContribution.create({ data: { projectId, kind: input.kind, amountPkr, description, documentation } });
    await audit(tx, actor.id, "NGO_CONTRIBUTION_RECORDED", "NgoContribution", contribution.id);
    return contribution;
  });
}

export async function verifyNgoContribution(actor: Actor, id: string) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const contribution = await tx.ngoContribution.findUnique({ where: { id } });
    if (!contribution) throw new OperationError("not_found");
    if (contribution.verifiedAt) throw new OperationError("conflict");
    const updated = await tx.ngoContribution.update({ where: { id }, data: { verifiedAt: new Date(), verifiedById: actor.id } });
    await audit(tx, actor.id, "NGO_CONTRIBUTION_VERIFIED", "NgoContribution", id);
    return updated;
  });
}
