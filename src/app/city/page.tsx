import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { managerCities } from "@/lib/operations/city-access";

export default async function ManagerHome() {
  const actor = await requireRole(["CITY_MANAGER"], "/city");
  const cities = await managerCities(actor);
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">Behtar Pakistan operations</p><h1 className="page-heading">Your city workspaces</h1><p className="page-subtitle">Only cities assigned to your account appear here.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{cities.map(city => <Link className="surface-card" href={`/city/${city.slug}`} key={city.id}><h2 className="text-xl font-bold">Behtar {city.name}</h2><p className="mt-2 text-sm">Open city operations →</p></Link>)}{!cities.length && <p className="surface-card">No active city is assigned to this account. Ask a platform administrator to review your access.</p>}</div></div></section>;
}
