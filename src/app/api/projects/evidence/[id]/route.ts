import { privateStoragePath } from "@/lib/private-storage";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { activePublicCities, publicProjectCityFilter } from "@/lib/public-cities";

export const dynamic = "force-dynamic";
const mime: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cities = await activePublicCities();
  const file = await prisma.evidence.findFirst({ where: { id, publicApprovedAt: { not: null }, ngoProject: { publicApproved: true, status: { in: ["ACTIVE", "COMPLETED"] }, ngo: { status: "ACTIVE", verifiedAt: { not: null } }, ...publicProjectCityFilter(null, cities.map(city => city.id)) } }, select: { storageKey: true, mimeType: true } });
  if (!file || !mime[file.mimeType] || !new RegExp(`^[a-f0-9-]{20,}\\${mime[file.mimeType]}$`, "i").test(file.storageKey)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(privateStoragePath(file.storageKey));
    return new Response(bytes, { headers: { "Content-Type": file.mimeType, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
