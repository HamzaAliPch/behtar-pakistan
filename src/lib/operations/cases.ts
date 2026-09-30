import { prisma } from "@/lib/prisma";
import { canTransitionComplaint, isOneOf, complaintStatuses } from "@/lib/workflow";
import { Actor, audit, event, notify, notifyAdmins, OperationError, text } from "./common";
import { assertCityAccess, requireCaseOperator } from "./city-access";
import { reconcileCompletedWork } from "./completed-work";
import { cancelResolutionReminders, queueCitizenNotice, scheduleResolutionReminders, type NoticeKind } from "@/lib/notifications";
import { recordSlaMilestone } from "@/lib/sla";

export async function transitionComplaint(actor: Actor, complaintId: string, nextStatus: string, reason: string) {
  requireCaseOperator(actor);
  if (!isOneOf(nextStatus, complaintStatuses)) throw new OperationError("invalid");
  const cleanReason = text(reason, 3, 1000);
  return prisma.$transaction(async tx => {
    const complaint = await tx.complaint.findUnique({ where: { id: complaintId } });
    if (!complaint) throw new OperationError("not_found");
    await assertCityAccess(tx, actor, complaint.cityId);
    if (!canTransitionComplaint(complaint.status, nextStatus)) throw new OperationError("conflict");
    if (nextStatus === "RESOLVED") {
      if (complaint.userId) throw new OperationError("forbidden");
      const verified = await tx.caseEvent.count({ where: { complaintId, kind: "VERIFIED" } });
      const afterEvidence = await tx.evidence.count({ where: { complaintId, stage: "AFTER" } });
      if (!verified || !afterEvidence) throw new OperationError("conflict");
    }
    if (nextStatus === "RESOLUTION_PROPOSED") {
      const afterEvidence = await tx.evidence.count({ where: { complaintId, stage: "AFTER", visibility: "OWNER" } });
      if (!afterEvidence) throw new OperationError("conflict");
    }
    await tx.complaint.update({ where: { id: complaintId }, data: { status: nextStatus, ...(nextStatus === "REJECTED" ? { publicVisible: false, publicLatitude: null, publicLongitude: null, publicApprovedAt: null } : {}) } });
    const statusEvent = await event(tx, { complaintId, actorId: actor.id, kind: nextStatus === "VERIFIED" ? "VERIFIED" : "COMPLAINT_STATUS", summary: `${nextStatus.replaceAll("_", " ")}: ${cleanReason}`, visibility: "OWNER" });
    await recordSlaMilestone(tx, complaintId, nextStatus, statusEvent.createdAt);
    if (complaint.status === "RESOLUTION_PROPOSED" && nextStatus !== "RESOLUTION_PROPOSED") await cancelResolutionReminders(tx, complaintId);
    await reconcileCompletedWork(tx, complaintId, actor.id);
    await audit(tx, actor.id, "COMPLAINT_STATUS", "Complaint", complaintId, `${complaint.status} → ${nextStatus}: ${cleanReason}`);
    const kind: NoticeKind = nextStatus === "BLOCKED" && cleanReason.startsWith("More information requested:") ? "INFORMATION_REQUESTED" : ["UNDER_REVIEW", "VERIFIED", "RESOLUTION_PROPOSED", "RESOLVED", "REOPENED"].includes(nextStatus) ? nextStatus as NoticeKind : "TASK_PROGRESS";
    await queueCitizenNotice(tx, { userId: complaint.userId, complaintId, reference: complaint.reference, kind, title: kind === "INFORMATION_REQUESTED" ? "More information requested" : nextStatus === "RESOLUTION_PROPOSED" ? "Please review the proposed resolution" : "Case progress updated", eventKey: statusEvent.id });
    if (nextStatus === "RESOLUTION_PROPOSED") await scheduleResolutionReminders(tx, { userId: complaint.userId, complaintId, reference: complaint.reference, proposalEventId: statusEvent.id, at: statusEvent.createdAt });
    if (complaint.publicVisible && nextStatus !== "REJECTED") {
      const followers = await tx.complaintFollow.findMany({ where: { complaintId }, select: { userId: true } });
      for (const follower of followers) await notify(tx, follower.userId, "Followed report updated", `${complaint.title} is now ${nextStatus.toLowerCase().replaceAll("_", " ")}.`, `/map/case/${complaintId}`);
    }
    return nextStatus;
  });
}

export async function citizenResolution(actor: Actor, complaintId: string, decision: "CONFIRM" | "DISPUTE" | "REOPEN", reason?: string) {
  const cleanReason = decision === "CONFIRM" ? null : text(reason, 10, 1000);
  return prisma.$transaction(async tx => {
    const complaint = await tx.complaint.findUnique({ where: { id: complaintId } });
    if (!complaint) throw new OperationError("not_found");
    if (complaint.userId !== actor.id) throw new OperationError("forbidden");
    if (decision === "CONFIRM" && complaint.status === "RESOLVED") {
      const [latestProposal, confirmation] = await Promise.all([
        tx.caseEvent.findFirst({ where: { complaintId, kind: "COMPLAINT_STATUS", summary: { startsWith: "RESOLUTION_PROPOSED:" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        tx.caseEvent.findFirst({ where: { complaintId, kind: "CITIZEN_CONFIRM", actorId: actor.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      ]);
      if (confirmation && latestProposal && confirmation.createdAt >= latestProposal.createdAt) return "RESOLVED";
    }
    if (decision === "CONFIRM" || decision === "DISPUTE") {
      if (complaint.status !== "RESOLUTION_PROPOSED") throw new OperationError("conflict");
    } else if (decision === "REOPEN" && complaint.status !== "RESOLVED") throw new OperationError("conflict");
    const status = decision === "CONFIRM" ? "RESOLVED" : "REOPENED";
    await tx.complaint.update({ where: { id: complaintId }, data: { status } });
    const decisionEvent = await event(tx, { complaintId, actorId: actor.id, kind: `CITIZEN_${decision}`, summary: decision === "CONFIRM" ? "Citizen confirmed resolution" : `Citizen ${decision === "REOPEN" ? "reopened" : "disputed"} resolution: ${cleanReason}`, visibility: "OWNER" });
    await cancelResolutionReminders(tx, complaintId);
    await queueCitizenNotice(tx, { userId: complaint.userId, complaintId, reference: complaint.reference, kind: status === "RESOLVED" ? "RESOLVED" : "REOPENED", title: status === "RESOLVED" ? "Resolution confirmed" : "Case reopened for review", eventKey: decisionEvent.id });
    await reconcileCompletedWork(tx, complaintId, actor.id);
    await notifyAdmins(tx, decision === "CONFIRM" ? "Resolution confirmed" : "Dispute needs review", `${complaint.reference}: ${decision.toLowerCase()}`, `/admin/cases/${complaintId}`);
    return status;
  });
}

export async function addCaseNote(actor: Actor, complaintId: string, note: string) {
  requireCaseOperator(actor);
  const summary = text(note, 3, 2000);
  return prisma.$transaction(async tx => {
    const complaint = await tx.complaint.findUnique({ where: { id: complaintId }, select: { id: true, cityId: true } });
    if (!complaint) throw new OperationError("not_found");
    await assertCityAccess(tx, actor, complaint.cityId);
    await event(tx, { complaintId, actorId: actor.id, kind: "INTERNAL_NOTE", summary, visibility: "INTERNAL" });
    await audit(tx, actor.id, "CASE_NOTE", "Complaint", complaintId);
  });
}
