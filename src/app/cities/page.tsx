import Link from "next/link";
import { MapPin, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { brand } from "@/lib/brand";

export const metadata = { title: "Choose your city" };
export const dynamic = "force-dynamic";
export default async function CitiesPage() {
  const cities = await prisma.city.findMany({ include: { region: true }, orderBy: [{ status: "asc" }, { name: "asc" }] });
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">{brand.positioning}</p><h1 className="page-heading mt-3">Your city. Our shared future.</h1><p className="page-subtitle">Start with your city. Karachi is our first active community; other cities are coming soon and do not accept reports yet.</p><div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{cities.map(city => { const active = city.status === "ACTIVE" && city.reportingAdapter === "KARACHI_V1" && city.slug === "karachi"; return <article className="surface-card" key={city.id}><span className="dimensional-icon"><MapPin size={25} /></span><p className="mt-5 text-xs font-semibold uppercase tracking-widest text-slate-500">{city.region.name}</p><h2 className="mt-2 text-2xl font-bold">Behtar {city.name}</h2><p className="my-4 text-sm text-slate-600">{active ? "Reporting is open. Share an issue and follow its progress." : "Coming soon. Reporting and local operations are not available here yet."}</p>{active ? <Link href={`/report?city=${city.slug}`} className="btn-dark">Report in {city.name} <ArrowUpRight size={16} /></Link> : <span className="status-pill bg-slate-100 text-slate-600">Coming soon</span>}</article>; })}</div></div></section>;
}
