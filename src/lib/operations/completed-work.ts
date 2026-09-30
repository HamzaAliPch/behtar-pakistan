import { privateStoragePath } from "@/lib/private-storage";
import { stat } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { audit, OperationError, requireAdmin, text, type Actor, type Tx } from "./common";

const filePattern = /^[a-f0-9]{40}\.(?:jpg|png|webp)$/i;
const unsafePublicText = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\+?\d[\d ()-]{8,}\d)\b|\b(?:house|plot|flat|apartment|street)\s*#?\s*\d+\b|\b2[4-5]\.\d{3,}\s*[,/]\s*6[6-7]\.\d{3,}\b/i;
export function safeStoryText(value: string, min: number, max: number) {
  const clean = text(value, min, max);
  if (unsafePublicText.test(clean)) throw new OperationError("invalid");
  return clean;
}

async function availableImage(item: { storageKey: string; mimeType: string }) {
  if (!filePattern.test(item.storageKey) || !["image/jpeg", "image/png", "image/webp"].includes(item.mimeType)) return false;
  try { return (await stat(privateStoragePath(item.storageKey))).isFile(); } catch { return false; }
}

export async function reconcileCompletedWork(tx: Tx, complaintId: string, actorId?: string) {
  const complaint = await tx.complaint.findUnique({ where: { id: complaintId }, select: { id: true, userId: true, status: true, storyPublicApprovedAt: true, publicTitle: true, publicArea: true, district: true, evidence: { where: { stage: { in: ["BEFORE", "AFTER"] }, mimeType: { startsWith: "image/" } }, select: { id: true, stage: true, storageKey: true, mimeType: true, publicApprovedAt: true, createdAt: true }, orderBy: { createdAt: "asc" } }, events: { where: { kind: { in: ["VERIFIED", "CITIZEN_CONFIRM", "COMPLAINT_STATUS"] } }, select: { kind: true, summary: true, createdAt: true }, orderBy: { createdAt: "asc" } } } });
  if (!complaint) throw new OperationError("not_found");
  let story = await tx.completedWorkStory.findUnique({ where: { complaintId } });
  if (!story && complaint.status !== "RESOLVED") return null;
  if (!story) story = await tx.completedWorkStory.create({ data: { complaintId, holdReason: "Public story review required" } });
  const verified = complaint.events.some(item => item.kind === "VERIFIED");
  const confirmation = complaint.userId
    ? complaint.events.findLast(item => item.kind === "CITIZEN_CONFIRM")
    : complaint.events.findLast(item => item.kind === "COMPLAINT_STATUS" && item.summary.startsWith("RESOLVED:"));
  const reasons: string[] = [];
  if (complaint.status !== "RESOLVED") reasons.push(["REOPENED", "REJECTED"].includes(complaint.status) ? "Case reopened, disputed or rejected" : "Resolution verification pending");
  if (!verified) reasons.push("Complaint verification missing");
  if (!confirmation) reasons.push("Citizen or authorized legacy resolution confirmation missing");
  if (!complaint.storyPublicApprovedAt || !complaint.publicTitle || !complaint.publicArea || !complaint.district || unsafePublicText.test(`${complaint.publicTitle ?? ""} ${complaint.publicArea ?? ""}`)) reasons.push("Safe public title, district and approximate area need approval");
  if (!story.contentApprovedAt || !story.problemSummary || !story.workSummary) reasons.push("Public problem and work summaries need admin approval");
  const selected: Record<string, string | null> = { BEFORE: null, AFTER: null };
  for (const stage of ["BEFORE", "AFTER"] as const) {
    const rows = complaint.evidence.filter(item => item.stage === stage);
    if (!rows.length) { reasons.push(`Missing ${stage} photo`); continue; }
    for (const row of stage === "AFTER" ? [...rows].reverse() : rows) {
      if (row.publicApprovedAt && await availableImage(row)) { selected[stage] = row.id; break; }
    }
    if (!selected[stage]) reasons.push(`${stage} photo awaiting public approval or file unavailable`);
  }
  if (story.manuallyWithdrawn) reasons.push("Publication withdrawn by admin");
  const publish = reasons.length === 0;
  const nextStatus = publish ? "PUBLISHED" : story.status === "PUBLISHED" || story.status === "WITHDRAWN" ? "WITHDRAWN" : "DRAFT";
  const now = new Date();
  const updated = await tx.completedWorkStory.update({ where: { id: story.id }, data: {
    status: nextStatus, holdReason: publish ? null : reasons.join("; "),
    beforeEvidenceId: selected.BEFORE, afterEvidenceId: selected.AFTER,
    completedAt: confirmation?.createdAt ?? null,
    ...(nextStatus === "PUBLISHED" && story.status !== "PUBLISHED" ? { publishedAt: now, withdrawnAt: null } : {}),
    ...(nextStatus === "WITHDRAWN" && story.status !== "WITHDRAWN" ? { withdrawnAt: now } : {}),
  } });
  if (story.status !== nextStatus) await audit(tx, actorId ?? null, nextStatus === "PUBLISHED" ? "STORY_PUBLISHED" : nextStatus === "WITHDRAWN" ? "STORY_WITHDRAWN" : "STORY_DRAFT", "CompletedWorkStory", story.id, updated.holdReason ?? undefined);
  return updated;
}

export async function approveStoryContent(actor: Actor, complaintId: string, problem: string, work: string) {
  requireAdmin(actor);
  const problemSummary = safeStoryText(problem, 20, 1000), workSummary = safeStoryText(work, 20, 1000);
  return prisma.$transaction(async tx => {
    const complaint = await tx.complaint.findUnique({ where: { id: complaintId }, select: { id: true } });
    if (!complaint) throw new OperationError("not_found");
    const story = await tx.completedWorkStory.upsert({ where: { complaintId }, create: { complaintId, problemSummary, workSummary, contentApprovedAt: new Date(), contentApprovedById: actor.id }, update: { problemSummary, workSummary, contentApprovedAt: new Date(), contentApprovedById: actor.id } });
    await audit(tx, actor.id, "STORY_CONTENT_APPROVED", "CompletedWorkStory", story.id);
    return reconcileCompletedWork(tx, complaintId, actor.id);
  });
}

export async function approveStoryPublicDetails(actor: Actor, complaintId: string, title: string, area: string) {
  requireAdmin(actor);
  const publicTitle = safeStoryText(title, 5, 120);
  const publicArea = safeStoryText(area, 2, 80);
  return prisma.$transaction(async tx => {
    const complaint = await tx.complaint.findUnique({ where: { id: complaintId }, select: { district: true, status: true, publicTitle: true, publicArea: true } });
    if (!complaint) throw new OperationError("not_found");
    if (!complaint.district || ["SUBMITTED", "UNDER_REVIEW", "REJECTED"].includes(complaint.status)) throw new OperationError("invalid");
    const changed = complaint.publicTitle !== publicTitle || complaint.publicArea !== publicArea;
    await tx.complaint.update({ where: { id: complaintId }, data: { publicTitle, publicArea, storyPublicApprovedAt: new Date(), ...(changed ? { publicVisible: false, publicLatitude: null, publicLongitude: null, publicApprovedAt: null } : {}) } });
    await audit(tx, actor.id, "STORY_PUBLIC_DETAILS_APPROVED", "Complaint", complaintId);
    return reconcileCompletedWork(tx, complaintId, actor.id);
  });
}

export async function approveStoryEvidence(actor: Actor, evidenceId: string, approved: boolean, contentChecked: boolean) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const evidence = await tx.evidence.findUnique({ where: { id: evidenceId }, select: { id: true, complaintId: true, stage: true, mimeType: true, storageKey: true } });
    if (!evidence) throw new OperationError("not_found");
    if (!["BEFORE", "AFTER"].includes(evidence.stage) || !evidence.mimeType.startsWith("image/")) throw new OperationError("invalid");
    if (approved && (!contentChecked || !await availableImage(evidence))) throw new OperationError("invalid");
    await tx.evidence.update({ where: { id: evidenceId }, data: { publicApprovedAt: approved ? new Date() : null, publicApprovedById: approved ? actor.id : null } });
    await audit(tx, actor.id, approved ? "STORY_EVIDENCE_APPROVED" : "STORY_EVIDENCE_REVOKED", "Evidence", evidenceId);
    return reconcileCompletedWork(tx, evidence.complaintId, actor.id);
  });
}

export async function moderateStory(actor: Actor, complaintId: string, withdraw: boolean) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const story = await tx.completedWorkStory.findUnique({ where: { complaintId } });
    if (!story) throw new OperationError("not_found");
    await tx.completedWorkStory.update({ where: { id: story.id }, data: { manuallyWithdrawn: withdraw } });
    await audit(tx, actor.id, withdraw ? "STORY_MANUALLY_WITHDRAWN" : "STORY_WITHDRAWAL_LIFTED", "CompletedWorkStory", story.id);
    return reconcileCompletedWork(tx, complaintId, actor.id);
  });
}
