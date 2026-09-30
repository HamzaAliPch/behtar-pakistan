import { DISTRICTS } from "./geo-constants";

export type KarachiDistrict = (typeof DISTRICTS)[number];

// Administrative sub-divisions: Commissioner Karachi, current seven-district map.
// https://commissionerkarachi.gos.pk/area-map
// Additional localities: Sindh Police East/South and Sindh government listings.
// https://sindhpolice.gov.pk/east/police-station
// https://sindhpolice.gov.pk/south
// https://industries.sindh.gov.pk/central
// Keep entries here reviewable; the reporting form also accepts a clearly marked
// citizen-entered area when a locality is missing.
export const KARACHI_AREAS: Record<KarachiDistrict, readonly string[]> = {
  Central: ["Gulberg", "Liaquatabad", "Nazimabad", "New Karachi", "North Nazimabad", "Federal B Area"],
  East: ["Ferozabad", "Gulshan-e-Iqbal", "Gulzar-e-Hijri", "Jamshed Quarters", "Gulistan-e-Johar"],
  South: ["Aram Bagh", "Civil Lines", "Garden", "Lyari", "Saddar", "Clifton", "Defence"],
  West: ["Manghopir", "Mominabad", "Orangi Town"],
  Korangi: ["Korangi", "Landhi", "Model Colony", "Shah Faisal Colony"],
  Malir: ["Malir", "Airport", "Bin Qasim", "Gadap", "Ibrahim Hyderi", "Murad Memon", "Shah Mureed"],
  Keamari: ["Keamari", "Baldia Town", "Harbor", "Maripur", "SITE"],
};

export function isKarachiDistrict(value: string): value is KarachiDistrict {
  return DISTRICTS.some(item => item === value);
}

export function normalizeArea(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

const PLACEHOLDERS = new Set(["other", "unknown", "none", "n/a", "na", "test", "japan", "karachi", "pakistan", "my area is not listed"]);

export function validateKarachiArea(district: string, area: string, manual: boolean): { district: KarachiDistrict; area: string; source: "CATALOG" | "MANUAL" } {
  if (!isKarachiDistrict(district)) throw new Error("Choose a Karachi district.");
  const clean = area.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (manual) {
    if (clean.length < 3 || clean.length > 80 || !/[\p{L}]/u.test(clean) || PLACEHOLDERS.has(normalizeArea(clean))) throw new Error("Enter a real Karachi area or neighborhood.");
    // A manual location is explicitly unverified. Reject a known locality under
    // the wrong district rather than allowing an inconsistent district pairing.
    for (const [knownDistrict, names] of Object.entries(KARACHI_AREAS)) {
      if (knownDistrict !== district && names.some(name => normalizeArea(name) === normalizeArea(clean))) throw new Error(`This listed area belongs under District ${knownDistrict}.`);
    }
    return { district, area: clean, source: "MANUAL" };
  }
  const listed = KARACHI_AREAS[district].find(name => normalizeArea(name) === normalizeArea(clean));
  if (!listed) throw new Error("Choose an area from this district or use the manual option.");
  return { district, area: listed, source: "CATALOG" };
}
