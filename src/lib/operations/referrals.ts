
import { brand } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { canTransitionReferral, isOneOf, referralStatuses } from "@/lib/workflow";
import { Actor, audit, code, event, notify, OperationError, optionalText, requireAdmin, text } from "./common";
import { assertCityAccess, requireCaseOperator } from "./city-access";

export async function createDepartment(actor: Actor, input: { name: string; jurisdiction: string; serviceAreas: string; contactDetails?: string }) {
  requireAdmin(actor);
  const data = { name: text(input.name, 3, 120), jurisdiction: text(input.jurisdiction, 2, 300), serviceAreas: text(input.serviceAreas, 2, 500), contactDetails: optionalText(input.contactDetails, 500) };
  return prisma.$transaction(async tx => {
    const department = await tx.department.create({ data });
    await audit(tx, actor.id, "DEPARTMENT_CREATED", "Department", department.id, department.name);
    return department;
  });
}

export async function updateDepartment(actor: Actor, departmentId: string, input: { jurisdiction: string; serviceAreas: string; contactDetails?: string; active: boolean }) {
  requireAdmin(actor);
  const data = { jurisdiction: text(input.jurisdiction, 2, 300), serviceAreas: text(input.serviceAreas, 2, 500), contactDetails: optionalText(input.contactDetails, 500), active: input.active };
  return prisma.$transaction(async tx => {
    const department = await tx.department.findUnique({ where: { id: departmentId } });
    if (!department) throw new OperationError("not_found");
    const updated = await tx.department.update({ where: { id: departmentId }, data });
    await audit(tx, actor.id, "DEPARTMENT_UPDATED", "Department", departmentId, `${data.jurisdiction}; active=${data.active}`);
    return updated;
  });
}

export async function createReferralDraft(actor: Actor, complaintId: string, departmentId: string) {
  requireCaseOperator(actor);
  return prisma.$transaction(async tx => {
    const complaint = await tx.complaint.findUnique({ where: { id: complaintId } });
    const department = await tx.department.findUnique({ where: { id: departmentId } });
    if (!complaint || !department || !department.active) throw new OperationError("not_found");
    await assertCityAccess(tx, actor, complaint.cityId);
    if (actor.role === "CITY_MANAGER" && department.cityId !== complaint.cityId) throw new OperationError("forbidden");
    const referral = await tx.referral.create({ data: { code: code("REF"), complaintId, departmentId, createdById: actor.id } });
    await event(tx, { complaintId, referralId: referral.id, actorId: actor.id, kind: "REFERRAL_DRAFT", summary: `Draft referral to ${department.name} created`, visibility: "INTERNAL" });
    await audit(tx, actor.id, "REFERRAL_DRAFT", "Referral", referral.id, department.name);
    return referral;
  });
}

export async function updateReferral(actor: Actor, referralId: string, input: { status: string; submissionMethod?: string; submittedAt?: string; officialReference?: string; followUpAt?: string; response?: string }) {
  requireCaseOperator(actor);
  if (!isOneOf(input.status, referralStatuses)) throw new OperationError("invalid");
  const method = optionalText(input.submissionMethod, 120);
  const officialReference = optionalText(input.officialReference, 120);
  const response = optionalText(input.response, 2000);
  const submittedAt = input.submittedAt ? new Date(input.submittedAt) : null;
  const followUpAt = input.followUpAt ? new Date(input.followUpAt) : null;
  if ((submittedAt && Number.isNaN(submittedAt.getTime())) || (followUpAt && Number.isNaN(followUpAt.getTime()))) throw new OperationError("invalid");
  if (submittedAt && submittedAt > new Date()) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const referral = await tx.referral.findUnique({ where: { id: referralId }, include: { complaint: true, department: true } });
    if (!referral) throw new OperationError("not_found");
    await assertCityAccess(tx, actor, referral.complaint.cityId);
    if (actor.role === "CITY_MANAGER" && referral.department.cityId !== referral.complaint.cityId) throw new OperationError("forbidden");
    if (!canTransitionReferral(referral.status, input.status)) throw new OperationError("conflict");
    const actualMethod = method ?? referral.submissionMethod;
    const actualDate = submittedAt ?? referral.submittedAt;
    if (input.status !== "DRAFT" && input.status !== "CLOSED" && (!actualMethod || !actualDate)) throw new OperationError("invalid");
    if (["ACKNOWLEDGED", "ACTION_REPORTED"].includes(input.status) && !response) throw new OperationError("invalid");
    if (input.status === "FOLLOW_UP_REQUIRED" && !followUpAt) throw new OperationError("invalid");
    if (referral.status === "DRAFT" && input.status === "CLOSED") {
      // A cancelled draft is closed without implying that a department received it.
      if (!response) throw new OperationError("invalid");
    }
    const updated = await tx.referral.update({ where: { id: referralId }, data: { status: input.status, submissionMethod: actualMethod, submittedAt: actualDate, officialReference, followUpAt, response } });
    const submitted = referral.status === "DRAFT" && input.status === "SUBMITTED";
    const summary = submitted ? `Referral ${referral.code} submitted to ${referral.department.name} by ${actualMethod} on ${actualDate!.toISOString().slice(0, 10)}` : `Referral ${referral.code} changed to ${input.status}`;
    await event(tx, { complaintId: referral.complaintId, referralId, actorId: actor.id, kind: submitted ? "REFERRAL_SUBMITTED" : "REFERRAL_STATUS", summary, visibility: submitted ? "OWNER" : "INTERNAL" });
    await audit(tx, actor.id, "REFERRAL_STATUS", "Referral", referralId, `${referral.status} → ${input.status}`);
    if (submitted) await notify(tx, referral.complaint.userId, "Referral recorded", `A referral for ${referral.complaint.reference} was recorded by the ${brand.name} team.`, `/track?ref=${referral.complaint.reference}`);
    return updated;
  });
}
