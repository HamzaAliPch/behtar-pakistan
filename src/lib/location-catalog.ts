import { prisma } from "@/lib/prisma";
import type { ReportingCity } from "./location-validation";

export async function getReportingCity(slug = "karachi"): Promise<ReportingCity> {
  const city = await prisma.city.findUnique({ where: { slug }, include: { districts: { where: { active: true }, orderBy: { name: "asc" }, include: { localities: { where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } } } } } });
  // No future city accepts reports until its service adapter and operational setup exist.
  if (!city || city.status !== "ACTIVE" || city.reportingAdapter !== "KARACHI_V1" || city.slug !== "karachi") throw new Error("Reporting is not available in this city yet. Please choose an active city.");
  return { id: city.id, slug: city.slug, name: city.name, districts: city.districts.map(({ id, name, localities }) => ({ id, name, localities })) };
}
