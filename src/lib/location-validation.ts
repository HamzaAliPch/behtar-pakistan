import { normalizeArea } from "./karachi-areas";
export type ReportingCity = { id: string; slug: string; name: string; districts: { id: string; name: string; localities: { id: string; name: string }[] }[] };

export function validateCatalogArea(city: ReportingCity, districtName: string, area: string, manual: boolean) {
  const district = city.districts.find(row => row.name === districtName);
  if (!district) throw new Error("Choose a district in the selected city.");
  const clean = area.normalize("NFKC").trim().replace(/\s+/g, " ");
  const key = normalizeArea(clean);
  if (clean.length < 3 || clean.length > 80 || !/[\p{L}]/u.test(clean) || ["other", "unknown", "none", "n/a", "na", "test", "japan", "karachi", "pakistan", "my area is not listed"].includes(key)) throw new Error("Enter a real area or neighborhood.");
  const locality = district.localities.find(row => normalizeArea(row.name) === key);
  if (!locality && !manual) throw new Error("Choose a listed area or use the manual option.");
  if (!locality && city.districts.some(row => row.id !== district.id && row.localities.some(item => normalizeArea(item.name) === key))) throw new Error("This listed area belongs to a different district.");
  return { district: district.name, area: locality?.name ?? clean, districtRecordId: district.id, localityId: locality?.id ?? null, source: manual ? "MANUAL" : "CATALOG", locationNeedsReview: manual || !locality };
}
