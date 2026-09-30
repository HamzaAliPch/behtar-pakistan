import { privateStoragePath, privateStorageRoot } from "@/lib/private-storage";
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { evidenceStages, isOneOf } from "@/lib/workflow";
import { Actor, audit, event, notify, notifyAdmins, OperationError, optionalText } from "./common";
import { assertCityAccess } from "./city-access";

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const MAX_EVIDENCE_VIDEO_BYTES = 30 * 1024 * 1024;
export const evidenceDirectory = privateStorageRoot;

function detectImage(bytes: Buffer): { mime: string; extension: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", extension: "png" };
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", extension: "webp" };
  return null;
}

export async function validateEvidenceImage(file: File): Promise<{ bytes: Buffer; mime: string; extension: string }> {
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_EVIDENCE_BYTES) throw new OperationError("invalid");
  const bytes = Buffer.from(await file.arrayBuffer());
  const image = detectImage(bytes);
  if (!image || file.type !== image.mime) throw new OperationError("invalid");
  return { bytes, ...image };
}

export async function validateFieldMedia(file: File): Promise<{ bytes: Buffer; mime: string; extension: string }> {
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_EVIDENCE_VIDEO_BYTES) throw new OperationError("invalid");
  if (file.type.startsWith("image/")) return validateEvidenceImage(file);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (file.type === "video/mp4" && bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return { bytes, mime: "video/mp4", extension: "mp4" };
  if (file.type === "video/webm" && bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { bytes, mime: "video/webm", extension: "webm" };
  throw new OperationError("invalid");
}

export async function uploadEvidence(actor: Actor, input: { complaintId: string; taskId?: string; ngoProjectId?: string; stage: string; visibility?: string; note?: string; file: File }) {
  if (!isOneOf(input.stage, evidenceStages)) throw new OperationError("invalid");
  const note = optionalText(input.note, 1000);
  const { bytes, ...image } = await validateFieldMedia(input.file);
  const complaint = await prisma.complaint.findUnique({ where: { id: input.complaintId } });
  if (!complaint) throw new OperationError("not_found");
  if (actor.role === "CITY_MANAGER") await assertCityAccess(prisma, actor, complaint.cityId);
  const task = input.taskId ? await prisma.task.findUnique({ where: { id: input.taskId } }) : null;
  if (input.taskId && (!task || task.complaintId !== complaint.id)) throw new OperationError("invalid");
  const ngoProjectId = input.ngoProjectId || task?.ngoProjectId || null;
  if (ngoProjectId) {
    const project = await prisma.ngoProject.findUnique({ where: { id: ngoProjectId }, select: { complaintId: true } });
    if (!project || project.complaintId !== complaint.id || (actor.role !== "ADMIN" && actor.role !== "CITY_MANAGER" && task?.ngoProjectId !== ngoProjectId)) throw new OperationError("forbidden");
  }
  if (actor.role !== "ADMIN" && actor.role !== "CITY_MANAGER") {
    const approval = actor.role === "VOLUNTEER" ? await prisma.volunteerApplication.findUnique({ where: { userId: actor.id }, select: { status: true } }) : null;
    if (!task || task.assigneeId !== actor.id || approval?.status !== "APPROVED") throw new OperationError("forbidden");
  }
  const visibility = (actor.role === "ADMIN" || actor.role === "CITY_MANAGER") && input.visibility === "OWNER" ? "OWNER" : "INTERNAL";
  const storageKey = `${randomBytes(20).toString("hex")}.${image.extension}`;
  await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(privateStoragePath(storageKey), bytes, { flag: "wx" });
  try {
    return await prisma.$transaction(async tx => {
      if (actor.role === "CITY_MANAGER") await assertCityAccess(tx, actor, complaint.cityId);
      const evidence = await tx.evidence.create({ data: { complaintId: complaint.id, taskId: task?.id, ngoProjectId, uploaderId: actor.id, stage: input.stage, visibility, storageKey, originalName: input.file.name.slice(0, 180), mimeType: image.mime, size: bytes.length, note } });
      await event(tx, { complaintId: complaint.id, taskId: task?.id, evidenceId: evidence.id, actorId: actor.id, kind: "EVIDENCE_ADDED", summary: `${input.stage} ${image.mime.startsWith("video/") ? "video" : "photo"} added${note ? `: ${note}` : ""}`, visibility: visibility === "OWNER" ? "OWNER" : task ? "TASK" : "INTERNAL" });
      if (actor.role === "ADMIN" || actor.role === "CITY_MANAGER") await audit(tx, actor.id, "EVIDENCE_ADDED", "Evidence", evidence.id, input.stage);
      else await notifyAdmins(tx, "New field evidence", `A volunteer added ${input.stage.toLowerCase()} evidence.`, `/admin/cases/${complaint.id}`);
      return evidence;
    });
  } catch (error) {
    await unlink(privateStoragePath(storageKey)).catch(() => undefined);
    throw error;
  }
}

export async function publishEvidence(actor: Actor, evidenceId: string) {
  if (actor.role !== "ADMIN" && actor.role !== "CITY_MANAGER") throw new OperationError("forbidden");
  return prisma.$transaction(async tx => {
    const evidence = await tx.evidence.findUnique({ where: { id: evidenceId }, include: { complaint: true } });
    if (!evidence) throw new OperationError("not_found");
    await assertCityAccess(tx, actor, evidence.complaint.cityId);
    if (evidence.visibility === "OWNER") return evidence;
    await tx.evidence.update({ where: { id: evidenceId }, data: { visibility: "OWNER" } });
    await event(tx, { complaintId: evidence.complaintId, evidenceId, actorId: actor.id, kind: "EVIDENCE_PUBLISHED", summary: `${evidence.stage} photo made available for owner review`, visibility: "OWNER" });
    await audit(tx, actor.id, "EVIDENCE_PUBLISHED", "Evidence", evidenceId);
    await notify(tx, evidence.complaint.userId, "New case evidence", `A photo is available for ${evidence.complaint.reference}.`, `/track?ref=${evidence.complaint.reference}`);
    return evidence;
  });
}

export async function canReadEvidence(actor: Actor | null, evidence: { visibility: string; complaint: { userId: string | null; cityId: string | null }; task: { assigneeId: string | null } | null }): Promise<boolean> {
  if (!actor) return false;
  if (actor.role === "ADMIN") return true;
  if (evidence.visibility === "OWNER" && evidence.complaint.userId === actor.id) return true;
  if (actor.role === "CITY_MANAGER") {
    try { await assertCityAccess(prisma, actor, evidence.complaint.cityId); return true; } catch { return false; }
  }
  if (actor.role === "VOLUNTEER" && evidence.task?.assigneeId === actor.id) {
    const approval = await prisma.volunteerApplication.findUnique({ where: { userId: actor.id }, select: { status: true } });
    return approval?.status === "APPROVED";
  }
  return false;
}
