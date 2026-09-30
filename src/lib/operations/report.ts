import { privateStoragePath } from "@/lib/private-storage";
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { categories } from "@/lib/complaints";
import { parseCoordinates } from "@/lib/geo";
import { getReportingCity } from "@/lib/location-catalog";
import { validateCatalogArea } from "@/lib/location-validation";
import { evidenceDirectory, validateEvidenceImage } from "./evidence";
import { audit, event, notifyAdmins, type Actor } from "./common";
import { queueCitizenNotice } from "@/lib/notifications";
import { snapshotSlaAtSubmission } from "@/lib/sla";
import { submissionDuplicateCandidates } from "@/lib/duplicates";

export class ReportInputError extends Error {}
export const MAX_REPORT_PHOTOS = 5;

export type CitizenReportInput = {
  citySlug?: string;
  submissionKey: string; title: string; category: string; description: string;
  district: string; area: string; manualArea: boolean;
  streetOrBlock?: string; landmark?: string; privateDirections?: string;
  latitude?: string; longitude?: string; photos: File[];
};

function optional(value: string | undefined, max: number, field: string): string | null {
  const clean = (value ?? "").trim();
  if (clean.length > max) throw new ReportInputError(`${field} is too long.`);
  return clean || null;
}

export async function submitCitizenReport(actor: Actor, input: CitizenReportInput): Promise<{ reference: string; id: string; duplicate: boolean }> {
  if (actor.role !== "CITIZEN" && actor.role !== "VOLUNTEER") throw new ReportInputError("Only signed-in citizens and volunteers can submit reports.");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.submissionKey)) throw new ReportInputError("Refresh the form and try again.");
  const existing = await prisma.complaint.findUnique({ where: { submissionKey: input.submissionKey }, select: { id: true, userId: true, reference: true } });
  if (existing) {
    if (existing.userId !== actor.id) throw new ReportInputError("This submission belongs to another account.");
    return { id: existing.id, reference: existing.reference, duplicate: true };
  }
  const title = input.title.trim(), description = input.description.trim();
  if (title.length < 5 || title.length > 120) throw new ReportInputError("Give the issue a title between 5 and 120 characters.");
  if (!categories.includes(input.category as typeof categories[number])) throw new ReportInputError("Choose a valid issue category.");
  if (description.length < 10 || description.length > 2000) throw new ReportInputError("Describe the issue in 10 to 2000 characters.");
  let location: ReturnType<typeof validateCatalogArea>, point: ReturnType<typeof parseCoordinates>;
  let city: Awaited<ReturnType<typeof getReportingCity>>;
  try { city = await getReportingCity(input.citySlug || "karachi"); location = validateCatalogArea(city, input.district, input.area, input.manualArea); }
  catch (error) { throw new ReportInputError(error instanceof Error ? error.message : "Choose a valid Karachi area."); }
  try { point = parseCoordinates(input.latitude, input.longitude); }
  catch { throw new ReportInputError("Choose a valid Karachi map pin or leave the pin empty."); }
  const streetOrBlock = optional(input.streetOrBlock, 120, "Street or block");
  const landmark = optional(input.landmark, 120, "Nearby landmark");
  const privateDirections = optional(input.privateDirections, 300, "Location directions");
  const detail = [streetOrBlock && `Street/block: ${streetOrBlock}`, landmark && `Landmark: ${landmark}`, privateDirections && `Directions: ${privateDirections}`].filter(Boolean).join(" · ");
  if (!Array.isArray(input.photos) || input.photos.length > MAX_REPORT_PHOTOS) throw new ReportInputError("Choose no more than five photos.");
  const images = [];
  for (const file of input.photos) {
    try { images.push({ file, ...(await validateEvidenceImage(file)) }); }
    catch { throw new ReportInputError("Each photo must be a JPEG, PNG or WebP image of 5 MB or less."); }
  }
  const detection = await submissionDuplicateCandidates({ cityId: city.id, title, description, category: input.category, district: location.district, area: location.area, point });
  const storedKeys: string[] = [];
  try {
    if (images.length) await mkdir(evidenceDirectory, { recursive: true });
    const stored: { key: string; image: (typeof images)[number] }[] = [];
    for (const image of images) {
      const key = `${randomBytes(20).toString("hex")}.${image.extension}`;
      await writeFile(privateStoragePath(key), image.bytes, { flag: "wx" });
      storedKeys.push(key);
      stored.push({ key, image });
    }
    const reference = `KFX-${randomBytes(8).toString("hex").toUpperCase()}`;
    const complaint = await prisma.$transaction(async tx => {
      const currentCity = await tx.city.findUnique({ where: { id: city.id }, select: { status: true, reportingAdapter: true } });
      if (currentCity?.status !== "ACTIVE" || currentCity.reportingAdapter !== "KARACHI_V1") throw new ReportInputError("Reporting is not available in this city yet.");
      const created = await tx.complaint.create({ data: { reference, cityId: city.id, districtRecordId: location.districtRecordId, localityId: location.localityId, locationNeedsReview: location.locationNeedsReview, submissionKey: input.submissionKey, title, category: input.category, description, district: location.district, area: location.area, areaSource: location.source, location: detail || null, streetOrBlock, landmark, privateDirections, latitude: point?.latitude, longitude: point?.longitude, userId: actor.id, status: "SUBMITTED" } });
      for (const candidate of detection.candidates) await tx.caseLink.create({ data: { sourceComplaintId: created.id, targetComplaintId: candidate.id, score: candidate.score } });
      await audit(tx, actor.id, "DUPLICATE_DETECTION_RUN", "Complaint", created.id, JSON.stringify({ status: "COMPLETED", candidateCount: detection.candidates.length, reason: detection.reason }));
      const submittedEvent = await event(tx, { complaintId: created.id, actorId: actor.id, kind: "SUBMITTED", summary: "Complaint submitted", visibility: "PUBLIC" });
      await snapshotSlaAtSubmission(tx, created);
      await queueCitizenNotice(tx, { userId: actor.id, complaintId: created.id, reference, kind: "COMPLAINT_SUBMITTED", title: "Report received", eventKey: submittedEvent.id });
      for (const { key, image } of stored) {
        const evidence = await tx.evidence.create({ data: { complaintId: created.id, uploaderId: actor.id, stage: "BEFORE", visibility: "OWNER", storageKey: key, originalName: image.file.name.slice(0, 180), mimeType: image.mime, size: image.bytes.length } });
        await event(tx, { complaintId: created.id, actorId: actor.id, evidenceId: evidence.id, kind: "EVIDENCE_ADDED", summary: "Citizen provided a report photo", visibility: "OWNER" });
      }
      await notifyAdmins(tx, "New complaint", `A citizen submitted ${reference}.`, `/admin/cases/${created.id}`);
      return created;
    });
    return { id: complaint.id, reference, duplicate: false };
  } catch (error) {
    for (const key of storedKeys) await unlink(privateStoragePath(key)).catch(() => undefined);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.complaint.findUnique({ where: { submissionKey: input.submissionKey }, select: { id: true, userId: true, reference: true } });
      if (duplicate?.userId === actor.id) return { id: duplicate.id, reference: duplicate.reference, duplicate: true };
    }
    throw error;
  }
}
