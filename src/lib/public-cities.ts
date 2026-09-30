import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function activePublicCities() {
  return prisma.city.findMany({ where: { status: "ACTIVE" }, select: { id: true, slug: true, name: true, districts: { where: { active: true }, select: { name: true }, orderBy: { name: "asc" } } }, orderBy: { name: "asc" } });
}

export function selectedPublicCity<T extends { slug: string }>(slug: string | undefined, cities: T[]): T | null | undefined {
  if (!slug) return null;
  return cities.find(city => city.slug === slug) ?? undefined;
}

export function publicComplaintCityFilter(cityId: string | null, activeIds: string[]) {
  return cityId ? { cityId } : { OR: [{ cityId: null }, { cityId: { in: activeIds } }] };
}

export function publicProjectCityFilter(cityId: string | null, activeIds: string[]): Prisma.NgoProjectWhereInput {
  if (cityId) return { OR: [{ complaint: { cityId } }, { complaintId: null, ngo: { cityId } }] };
  return { OR: [{ complaint: { OR: [{ cityId: null }, { cityId: { in: activeIds } }] } }, { complaintId: null, ngo: { OR: [{ cityId: null }, { cityId: { in: activeIds } }] } }] };
}
