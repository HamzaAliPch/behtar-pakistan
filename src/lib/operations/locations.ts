import { prisma } from "@/lib/prisma";
import type { Actor } from "./common";

export async function saveCatalogLocation(actor: Actor, input: { id?: string; districtId: string; name: string; kind: string; sourceUrl: string; active: boolean }) {
  if (actor.role !== "ADMIN") throw new Error("Forbidden");
  const name = input.name.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 80 || !["LOCALITY", "NEIGHBORHOOD", "TOWN", "TEHSIL"].includes(input.kind)) throw new Error("Invalid location");
  let source: URL;
  try { source = new URL(input.sourceUrl); } catch { throw new Error("Provide a source URL"); }
  if (source.protocol !== "https:" || source.username || source.password || input.sourceUrl.length > 500) throw new Error("Provide a public HTTPS source URL");
  return prisma.$transaction(async tx => {
    const district = await tx.locationDistrict.findUnique({ where: { id: input.districtId } });
    if (!district) throw new Error("District not found");
    const previous = input.id ? await tx.locality.findUnique({ where: { id: input.id } }) : null;
    if (input.id && !previous) throw new Error("Location not found");
    // Preserve linked historical geography. Boundary changes get a new entry.
    if (previous && previous.districtId !== district.id) throw new Error("Create a new entry for a boundary change; retain the original record.");
    const data = { name, districtId: district.id, kind: input.kind, sourceUrl: source.href, active: input.active };
    const result = input.id ? await tx.locality.update({ where: { id: input.id }, data }) : await tx.locality.create({ data });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "LOCATION_CATALOG_UPDATED", targetType: "Locality", targetId: result.id, details: JSON.stringify({ previous, current: data }) } });
    return result;
  });
}
