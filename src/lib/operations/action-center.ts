
import { brand } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { nextComplaintStatuses } from "@/lib/workflow";
import { type Actor, event, notifyAdmins, OperationError, text } from "./common";
import { assertCityAccess, requireCaseOperator } from "./city-access";
import { transitionComplaint } from "./cases";

export type ReviewDecision = "VERIFY" | "REQUEST_INFO" | "REJECT";

export function hasOutstandingInformationRequest(status: string, events: readonly { kind: string; summary: string }[]): boolean {
  if (status !== "BLOCKED") return false;
  const latestStatus = events.find(item => item.kind === "COMPLAINT_STATUS");
  return latestStatus?.summary.startsWith("BLOCKED: More information requested:") ?? false;
}

// This is only a guided sequence; every state change still goes through the
// existing validated transition service (including its audit and notifications).
export async function reviewComplaint(actor: Actor, complaintId: string, decision: ReviewDecision, reason: string) {
  requireCaseOperator(actor);
  if (!["VERIFY", "REQUEST_INFO", "REJECT"].includes(decision)) throw new OperationError("invalid");
  const explanation = text(reason, 3, 1000);
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId }, select: { status: true, cityId: true } });
  if (!complaint) throw new OperationError("not_found");
  await assertCityAccess(prisma, actor, complaint.cityId);
  if (!["SUBMITTED", "UNDER_REVIEW", "BLOCKED", "REOPENED"].includes(complaint.status)) throw new OperationError("conflict");
  if (decision === "REQUEST_INFO" && complaint.status === "REOPENED") throw new OperationError("conflict");
  if (decision === "REJECT" && complaint.status === "REOPENED") throw new OperationError("conflict");
  if (complaint.status === "SUBMITTED" || complaint.status === "REOPENED" || (complaint.status === "BLOCKED" && decision === "VERIFY")) {
    await transitionComplaint(actor, complaintId, "UNDER_REVIEW", `${brand.name} team started reviewing this report`);
  }
  if (decision === "VERIFY") return transitionComplaint(actor, complaintId, "VERIFIED", explanation);
  if (decision === "REQUEST_INFO") return transitionComplaint(actor, complaintId, "BLOCKED", `More information requested: ${explanation}`);
  if (!nextComplaintStatuses(complaint.status).includes("REJECTED")) throw new OperationError("conflict");
  return transitionComplaint(actor, complaintId, "REJECTED", explanation);
}

export async function provideCaseInformation(actor: Actor, complaintId: string, answer: string) {
  const message = text(answer, 10, 2000);
  return prisma.$transaction(async tx => {
    const complaint = await tx.complaint.findUnique({ where: { id: complaintId }, select: { userId: true, status: true, reference: true, events: { where: { kind: "COMPLAINT_STATUS" }, orderBy: { createdAt: "desc" }, take: 1, select: { kind: true, summary: true } } } });
    if (!complaint) throw new OperationError("not_found");
    if (complaint.userId !== actor.id) throw new OperationError("forbidden");
    if (!hasOutstandingInformationRequest(complaint.status, complaint.events)) throw new OperationError("conflict");
    await event(tx, { complaintId, actorId: actor.id, kind: "CITIZEN_INFORMATION", summary: `Citizen provided more information: ${message}`, visibility: "OWNER" });
    await notifyAdmins(tx, "Citizen replied to information request", `${complaint.reference} has a new citizen reply.`, `/admin/cases/${complaintId}`);
  });
}

export function citizenProgress(status: string, owner: boolean, informationRequested = false): string {
  if (status === "BLOCKED" && informationRequested) return "We asked the citizen for more information. Their private tracking page has a reply form.";
  const messages: Record<string, string> = {
    SUBMITTED: "Report received. Our team will review the details.",
    UNDER_REVIEW: "Our team is checking the report.",
    VERIFIED: "The report has been verified. We are choosing the next action.",
    ASSIGNED: "A team member or volunteer has been assigned.",
    IN_PROGRESS: "Work is in progress; updates will appear in the case timeline.",
    BLOCKED: "The case needs more information or another action before work can continue.",
    RESOLUTION_PROPOSED: owner ? "Please review the shared completion evidence and confirm or dispute the result." : "The team is reviewing the proposed resolution for this legacy case.",
    RESOLVED: "The resolution has been confirmed and the case is closed.",
    REOPENED: "The case has been reopened for another review.",
    REJECTED: "The report was rejected. The recorded reason is in the case timeline.",
  };
  return messages[status] ?? "Check the case timeline for updates.";
}
