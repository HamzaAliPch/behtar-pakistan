import { allowRequest, requestIdentity } from "@/lib/rate-limit";
import { parseCoordinates } from "@/lib/geo";
import { getReportingCity } from "@/lib/location-catalog";
import { normalizeArea } from "@/lib/karachi-areas";

type Place = { name: string; latitude: number | null; longitude: number | null; district?: string; source: "provider" | "catalog" };
type Result = { items: Place[]; status: "ok" | "catalog_only" | "no_matches"; message?: string };
const cache = new Map<string, { expires: number; result: Result }>();
let lastExternalRequest = 0;

async function catalogMatches(query: string): Promise<Place[]> {
  const city = await getReportingCity();
  const normalized = normalizeArea(query.split(",")[0]);
  if (normalized.length < 3) return [];
  return city.districts.flatMap(district => district.localities
    .filter(locality => normalizeArea(locality.name).includes(normalized))
    .map(locality => ({ name: `${locality.name}, District ${district.name}, Karachi`, latitude: null, longitude: null, district: district.name, source: "catalog" as const }))).slice(0, 5);
}

export async function GET(request: Request) {
  if (!allowRequest(`geocode:${requestIdentity(request)}`, 10, 60_000)) return Response.json({ code: "rate_limited", error: "Search limit reached. Please wait a minute." }, { status: 429 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3 || q.length > 100 || /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\+?\d[\d ()-]{8,}\d)\b|\b(?:house|flat|plot|apartment)\s*#?\s*\d+\b/i.test(q)) return Response.json({ code: "invalid", error: "Search a public area or landmark, without personal contact or home details." }, { status: 400 });
  const key = normalizeArea(q);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return Response.json(cached.result, { headers: { "Cache-Control": "private, max-age=300" } });

  const catalog = await catalogMatches(q);
  const fallback = (code: "not_configured" | "unavailable") => {
    if (catalog.length) {
      const result: Result = { items: catalog, status: "catalog_only", message: code === "not_configured" ? "Address lookup is not configured. Showing listed Karachi areas; choose a pin manually." : "Address lookup is unavailable. Showing listed Karachi areas without invented map coordinates." };
      cache.set(key, { result, expires: Date.now() + 10 * 60_000 });
      return Response.json(result);
    }
    return Response.json({ code, error: code === "not_configured" ? "Address lookup is not configured. Enter an area manually or place a pin." : "Address lookup is temporarily unavailable. Enter an area manually or place a pin." }, { status: 503 });
  };
  if (process.env.GEOCODER_ENABLED === "0") return fallback("not_configured");
  if (Date.now() - lastExternalRequest < 1100) return catalog.length ? fallback("unavailable") : Response.json({ code: "rate_limited", error: "Please wait a moment before searching again." }, { status: 429 });
  lastExternalRequest = Date.now();
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${q}, Karachi, Pakistan`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "pk");
    url.searchParams.set("viewbox", "66.3,25.6,67.7,24.45");
    url.searchParams.set("bounded", "1");
    const response = await fetch(url, { headers: { "User-Agent": process.env.GEOCODER_USER_AGENT || "BehtarPakistan/1.0 (https://test.socialautomation.my.id)", Accept: "application/json" }, signal: AbortSignal.timeout(7000) });
    if (!response.ok) return fallback("unavailable");
    const raw = await response.json() as { display_name?: string; lat?: string; lon?: string }[];
    if (!Array.isArray(raw)) return fallback("unavailable");
    const places: Place[] = raw.flatMap(item => { try { const point = parseCoordinates(item.lat, item.lon); return point ? [{ name: String(item.display_name ?? "").slice(0, 180), ...point, source: "provider" as const }] : []; } catch { return []; } });
    const result: Result = places.length ? { items: places, status: "ok" } : catalog.length ? { items: catalog, status: "catalog_only", message: "No map match was found. Showing listed Karachi areas without invented coordinates." } : { items: [], status: "no_matches" };
    if (cache.size > 1000) cache.clear();
    cache.set(key, { result, expires: Date.now() + 24 * 60 * 60_000 });
    return Response.json(result);
  } catch { return fallback("unavailable"); }
}
