import { prisma } from "@/lib/prisma";
import { KARACHI_BOUNDS, type Point } from "./geo-constants";
import { normalizeArea } from "./karachi-areas";
import { getReportingCity } from "./location-catalog";
import { validateCatalogArea } from "./location-validation";
import { reconcileCompletedWork, safeStoryText } from "./operations/completed-work";
export { KARACHI_BOUNDS, DISTRICTS, KARACHI_CENTER } from "./geo-constants";
export type { Point } from "./geo-constants";

export function parseCoordinates(latitude: unknown, longitude: unknown): Point | null {
  if ((latitude === "" || latitude == null) && (longitude === "" || longitude == null)) return null;
  if (latitude === "" || longitude === "" || latitude == null || longitude == null) throw new Error("Both coordinates are required.");
  const lat = Number(latitude), lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < KARACHI_BOUNDS.minLat || lat > KARACHI_BOUNDS.maxLat || lon < KARACHI_BOUNDS.minLon || lon > KARACHI_BOUNDS.maxLon) throw new Error("Choose a valid Karachi location.");
  return { latitude: lat, longitude: lon };
}

export type PublicMapApprovalBlocker = "location_required" | "invalid_location" | "status_required";
export function publicMapApprovalBlocker(complaint: { status: string; latitude: number | null; longitude: number | null }): PublicMapApprovalBlocker | null {
  if (complaint.latitude == null || complaint.longitude == null) return "location_required";
  try { parseCoordinates(complaint.latitude, complaint.longitude); } catch { return "invalid_location"; }
  if (["SUBMITTED", "UNDER_REVIEW", "REJECTED"].includes(complaint.status)) return "status_required";
  return null;
}

export class PublicMapApprovalError extends Error {
  constructor(public readonly code: PublicMapApprovalBlocker) { super(code); }
}

export function approximatePoint(point: Point): Point {
  // About a kilometre grid. Public APIs never return the precise point.
  return { latitude: Math.round(point.latitude * 100) / 100, longitude: Math.round(point.longitude * 100) / 100 };
}

export function distanceKm(a: Point, b: Point): number {
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude), dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const CLOSED = ["RESOLVED", "REJECTED"];
const words = (value: string) => new Set(value.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
export async function nearbyReports(point: Point, category: string, description: string) {
  const radiusKm = 5;
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos(point.latitude * Math.PI / 180));
  const rows = await prisma.complaint.findMany({
    where: { publicVisible: true, publicLatitude: { gte: point.latitude - latDelta, lte: point.latitude + latDelta }, publicLongitude: { gte: point.longitude - lonDelta, lte: point.longitude + lonDelta }, status: { notIn: CLOSED } },
    select: { id: true, publicTitle: true, category: true, publicArea: true, status: true, publicLatitude: true, publicLongitude: true }, take: 150,
  });
  const queryWords = words(description);
  return rows.flatMap(row => {
    if (row.publicLatitude == null || row.publicLongitude == null) return [];
    const distance = distanceKm(point, { latitude: row.publicLatitude, longitude: row.publicLongitude });
    if (distance > radiusKm) return [];
    const overlap = [...queryWords].filter(word => words(row.publicTitle ?? "").has(word)).length;
    const categoryMatch = row.category === category;
    if (!categoryMatch && overlap < 2) return [];
    return [{ id: row.id, title: row.publicTitle ?? "Public report", category: row.category, area: row.publicArea ?? "Karachi", status: row.status, distanceKm: Math.round(distance * 10) / 10, score: (categoryMatch ? 3 : 0) + overlap + (distance < 1 ? 2 : 0) }];
  }).sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm).slice(0, 5);
}

export async function nearbyReportsByArea(district: string, area: string, category: string, description: string) {
  const location = validateCatalogArea(await getReportingCity(), district, area, true);
  const rows = await prisma.complaint.findMany({ where: { publicVisible: true, district: location.district, status: { notIn: CLOSED }, category }, select: { id: true, publicTitle: true, publicArea: true, category: true, status: true }, orderBy: { updatedAt: "desc" }, take: 150 });
  const target = normalizeArea(location.area), queryWords = words(description);
  return rows.flatMap(row => {
    if (normalizeArea(row.publicArea ?? "") !== target) return [];
    const overlap = [...queryWords].filter(word => words(row.publicTitle ?? "").has(word)).length;
    return [{ id: row.id, title: row.publicTitle ?? "Public report", category: row.category, area: row.publicArea ?? "Karachi", status: row.status, distanceKm: null, score: 3 + overlap }];
  }).sort((a, b) => b.score - a.score).slice(0, 5);
}

export async function setPublicVisibility(actor: { id: string; role: string }, complaintId: string, visible: boolean, title?: string, area?: string) {
  if (actor.role !== "ADMIN") throw new Error("Forbidden");
  return prisma.$transaction(async tx => {
    const complaint = await tx.complaint.findUnique({ where: { id: complaintId } });
    if (!complaint) throw new Error("Not found");
    if (visible) {
      const blocker = publicMapApprovalBlocker(complaint);
      if (blocker) throw new PublicMapApprovalError(blocker);
    }
    const publicTitle = title?.trim(), publicArea = area?.trim();
    if (visible && (!publicTitle || publicTitle.length < 5 || publicTitle.length > 120 || !publicArea || publicArea.length < 2 || publicArea.length > 80)) throw new Error("Enter a safe public title and approximate area.");
    if (visible) { safeStoryText(publicTitle!, 5, 120); safeStoryText(publicArea!, 2, 80); }
    const publicPoint = visible ? approximatePoint({ latitude: complaint.latitude!, longitude: complaint.longitude! }) : null;
    const updated = await tx.complaint.update({ where: { id: complaintId }, data: { publicVisible: visible, publicLatitude: publicPoint?.latitude ?? null, publicLongitude: publicPoint?.longitude ?? null, publicApprovedAt: visible ? new Date() : null, ...(visible ? { storyPublicApprovedAt: new Date(), publicTitle, publicArea } : {}) } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: visible ? "MAP_PUBLISHED" : "MAP_UNPUBLISHED", targetType: "Complaint", targetId: complaintId } });
    await tx.caseEvent.create({ data: { complaintId, actorId: actor.id, kind: visible ? "MAP_PUBLISHED" : "MAP_UNPUBLISHED", summary: visible ? "Case approved for public map" : "Case removed from public map", visibility: "INTERNAL" } });
    await reconcileCompletedWork(tx, complaintId, actor.id);
    return updated;
  });
}
