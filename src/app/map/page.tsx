
import { brand } from "@/lib/brand";
import type { Metadata } from "next";
import { MapExplorer } from "@/components/map-explorer";
import { activePublicCities } from "@/lib/public-cities";
export const metadata: Metadata = { title: "Explore public issue map" };
export default async function MapPage() { const cities = await activePublicCities(); return <section className="inner-page"><div className="page-shell max-w-7xl"><p className="section-kicker">Explore active cities</p><h1 className="page-heading mt-3">Public issue map</h1><p className="page-subtitle">See verified cases that {brand.name} has approved for public display. Locations are approximate to protect residents. Karachi is currently the only active reporting city.</p><MapExplorer cities={cities.map(city => ({ slug: city.slug, name: city.name, districts: city.districts.map(item => item.name) }))} /></div></section>; }
