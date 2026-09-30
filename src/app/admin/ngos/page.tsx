
import { brand } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { AdminNav, ErrorNotice, StatusBadge } from "@/components/operations";
import { createNgoAction } from "@/app/actions/ngos";
import { ngoStatuses } from "@/lib/operations/ngos";

export const metadata: Metadata = { title: "NGO partners and projects" };
export const dynamic = "force-dynamic";

export default async function NgoPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await requireRole(["ADMIN"]);
  const query = await searchParams;
  const status = ngoStatuses.find(item => item === query.status);
  const ngos = await prisma.partnerNgo.findMany({ where: status ? { status } : undefined, include: { projects: { select: { id: true, status: true, title: true } } }, orderBy: { name: "asc" } });
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">Checked partnership records</p><h1 className="page-heading mt-3">NGOs and community projects</h1><p className="page-subtitle">Organizations remain prospective until {brand.name} records an actual agreement. Only active partners can be attached to new work.</p><AdminNav /><ErrorNotice error={query.error} />
    <form method="get" className="mt-7 flex flex-wrap items-end gap-3"><label><span className="field-label">Partnership status</span><select name="status" defaultValue={status ?? ""} className="field-input"><option value="">All statuses</option>{ngoStatuses.map(item => <option key={item}>{item}</option>)}</select></label><button className="btn-dark cursor-pointer">Filter</button></form>
    <div className="mt-8 grid gap-7 lg:grid-cols-[350px_1fr]"><form action={createNgoAction} className="surface-card h-fit space-y-4"><h2 className="text-xl font-bold">Add prospective organization</h2><p className="text-xs text-slate-600">Adding a record does not establish an official partnership.</p><label className="block"><span className="field-label">Organization name</span><input name="name" className="field-input" minLength={3} maxLength={140} required /></label><label className="block"><span className="field-label">Contact person</span><input name="contactPerson" className="field-input" minLength={2} maxLength={120} required /></label><label className="block"><span className="field-label">Private email</span><input name="contactEmail" type="email" className="field-input" maxLength={150} /></label><label className="block"><span className="field-label">Private phone</span><input name="contactPhone" className="field-input" maxLength={30} /></label><label className="block"><span className="field-label">Publicly approved contact (optional)</span><input name="publicContact" className="field-input" maxLength={200} /></label><label className="block"><span className="field-label">Karachi service areas</span><input name="serviceAreas" className="field-input" minLength={3} maxLength={500} required /></label><label className="block"><span className="field-label">Expertise</span><textarea name="expertise" className="field-input min-h-24" minLength={3} maxLength={500} required /></label><button className="btn-dark cursor-pointer">Add prospective NGO</button></form><div className="space-y-4">{ngos.length ? ngos.map(item => <Link key={item.id} href={`/admin/ngos/${item.id}`} className="surface-card block hover:border-emerald-300"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-bold">{item.name}</h2><p className="mt-1 text-xs text-slate-500">{item.serviceAreas} · {item.expertise}</p></div><StatusBadge status={item.status} /></div><p className="mt-3 text-sm">{item.projects.filter(project => project.status === "ACTIVE").length} active projects · {item.projects.filter(project => project.status === "COMPLETED").length} completed</p><span className="mt-2 block text-sm font-bold text-emerald-700 underline">Manage organization and projects</span></Link>) : <p className="surface-card text-sm text-slate-600">No organizations match this view.</p>}</div></div>
  </div></section>;
}
