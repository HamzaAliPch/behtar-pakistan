import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { categories } from "@/lib/complaints";
import { DISTRICTS } from "@/lib/geo";
import { complaintStatuses } from "@/lib/workflow";
import { allowRequest, requestIdentity } from "@/lib/rate-limit";
import { activePublicCities, publicComplaintCityFilter, selectedPublicCity } from "@/lib/public-cities";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!allowRequest(`map:${requestIdentity(request)}`, 80, 60_000)) return Response.json({ error: "Too many requests" }, { status: 429 });
  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const district = url.searchParams.get("district") ?? "";
  const citySlug = url.searchParams.get("city") || undefined;
  const cities = await activePublicCities();
  const city = selectedPublicCity(citySlug, cities);
  const validDistricts = city ? city.districts.map(item => item.name) : [...new Set([...DISTRICTS, ...cities.flatMap(item => item.districts.map(district => district.name))])];
  if (city === undefined || (category && !categories.includes(category as typeof categories[number])) || (status && !complaintStatuses.includes(status as typeof complaintStatuses[number])) || (district && !validDistricts.includes(district))) return Response.json({ error: "Invalid filter" }, { status: 400 });
  const items = await prisma.complaint.findMany({
    where: { publicVisible: true, ...publicComplaintCityFilter(city?.id ?? null, cities.map(item => item.id)), publicLatitude: { not: null }, publicLongitude: { not: null }, ...(category && { category }), ...(status && { status }), ...(district && { district }) },
    select: { id: true, publicTitle: true, category: true, publicArea: true, district: true, status: true, publicLatitude: true, publicLongitude: true, updatedAt: true },
    orderBy: { updatedAt: "desc" }, take: 500,
  });
  const payload = items.map(item => ({ id: item.id, title: item.publicTitle, category: item.category, area: item.publicArea, district: item.district, status: item.status, latitude: item.publicLatitude, longitude: item.publicLongitude }));
  const etag = `"${createHash("sha256").update(JSON.stringify(items)).digest("hex")}"`;
  const headers = { ETag: etag, "Cache-Control": "public, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return Response.json({ items: payload, updatedAt: new Date().toISOString(), truncated: items.length === 500 }, { headers });
}
