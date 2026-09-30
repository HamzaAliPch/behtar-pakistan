import { getCurrentUser } from "@/lib/auth/session";
import { categories } from "@/lib/complaints";
import { nearbyReports, nearbyReportsByArea, parseCoordinates } from "@/lib/geo";
import { allowRequest } from "@/lib/rate-limit";
import { publicDuplicateSuggestions } from "@/lib/duplicates";
import { getReportingCity } from "@/lib/location-catalog";
import { validateCatalogArea } from "@/lib/location-validation";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "CITIZEN" && user.role !== "VOLUNTEER")) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!allowRequest(`nearby:${user.id}`, 30, 60_000)) return Response.json({ error: "Please wait before searching again" }, { status: 429 });
  const query = new URL(request.url).searchParams;
  const category = query.get("category") ?? "";
  const description = (query.get("description") ?? "").slice(0, 500);
  const title = (query.get("title") ?? "").slice(0, 120);
  if (!categories.includes(category as typeof categories[number])) return Response.json({ error: "Choose a category" }, { status: 400 });
  try {
    const point = parseCoordinates(query.get("latitude"), query.get("longitude"));
    const district = query.get("district") ?? "", area = query.get("area") ?? "";
    let items;
    if (title.length >= 5 && district && area) {
      const city = await getReportingCity(query.get("citySlug") ?? "karachi");
      const location = validateCatalogArea(city, district, area, query.get("manualArea") === "1");
      items = await publicDuplicateSuggestions({ cityId: city.id, title, description, category, district: location.district, area: location.area, point });
    } else items = point ? await nearbyReports(point, category, description) : await nearbyReportsByArea(district, area, category, description);
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Invalid location" }, { status: 400 }); }
}
