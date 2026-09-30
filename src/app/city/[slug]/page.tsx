import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { managerCity } from "@/lib/operations/city-access";
import { label } from "@/lib/workflow";

export const dynamic = "force-dynamic";
export default async function CityWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireRole(["CITY_MANAGER"], "/city");
  const { slug } = await params;
  const city = await managerCity(actor, slug).catch(() => null);
  if (!city) notFound();
  const [cases, activeTasks, overdueTasks, referrals, volunteers, ngos, departments, contacts, evidenceCount] = await Promise.all([
    prisma.complaint.findMany({ where: { cityId: city.id }, select: { id: true, reference: true, title: true, status: true, district: true, area: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.task.count({ where: { complaint: { cityId: city.id }, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
    prisma.task.count({ where: { complaint: { cityId: city.id }, status: { notIn: ["COMPLETED", "CANCELLED"] }, deadline: { lt: new Date() } } }),
    prisma.referral.count({ where: { complaint: { cityId: city.id }, status: { notIn: ["DRAFT", "CLOSED"] } } }),
    prisma.volunteerApplication.findMany({ where: { cityId: city.id, status: "APPROVED" }, select: { id: true, fullName: true, availability: true, serviceArea: true }, take: 30 }),
    prisma.partnerNgo.findMany({ where: { cityId: city.id, status: "ACTIVE", verifiedAt: { not: null } }, select: { id: true, name: true, projects: { where: { complaint: { cityId: city.id } }, select: { id: true, title: true, status: true } } }, take: 30 }),
    prisma.department.findMany({ where: { cityId: city.id, active: true }, select: { id: true, name: true, serviceAreas: true }, take: 30 }),
    prisma.crmContact.findMany({ where: { cityId: city.id }, select: { id: true, name: true, category: true, nextFollowUpAt: true }, take: 30 }),
    prisma.evidence.count({ where: { complaint: { cityId: city.id } } }),
  ]);
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">City operations · Assigned access</p><h1 className="page-heading">Behtar {city.name}</h1><p className="page-subtitle">Cases and linked work shown here belong to your assigned city. Unallocated historical records remain with platform admins for review.</p><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Recent cases", cases.length], ["Active tasks", activeTasks], ["Overdue tasks", overdueTasks], ["Open referrals", referrals], ["Authorized evidence", evidenceCount], ["Approved volunteers", volunteers.length], ["Active NGO partners", ngos.length], ["City contacts", contacts.length]].map(([title, value]) => <div className="surface-card" key={title}><p className="text-2xl font-bold">{value}</p><p className="text-sm text-slate-600">{title}</p></div>)}</div><div className="mt-8 grid gap-5 lg:grid-cols-2"><section className="surface-card"><h2 className="text-xl font-bold">Recent complaints</h2>{cases.map(item => <Link key={item.id} href={`/city/${slug}/cases/${item.id}`} className="block border-b py-3 text-sm"><strong>{item.reference} · {item.title}</strong><span className="block text-slate-600">{label(item.status)} · {item.district || "District to review"}, {item.area}</span></Link>)}{!cases.length && <p className="mt-4 text-sm">No linked complaints yet.</p>}</section><div className="space-y-5"><section className="surface-card"><h2 className="text-xl font-bold">City team</h2>{volunteers.map(item => <p key={item.id} className="mt-3 text-sm">{item.fullName} · {item.serviceArea} · {item.availability}</p>)}{!volunteers.length && <p className="mt-3 text-sm">No volunteer has been assigned to this city.</p>}</section><section className="surface-card"><h2 className="text-xl font-bold">Verified NGO partners</h2>{ngos.map(item => <p key={item.id} className="mt-3 text-sm">{item.name} · {item.projects.length} linked projects</p>)}{!ngos.length && <p className="mt-3 text-sm">No partner has been assigned to this city.</p>}</section><section className="surface-card"><h2 className="text-xl font-bold">Departments and outreach</h2><p className="mt-3 text-sm">{departments.length} assigned departments · {contacts.length} private contacts</p>{contacts.map(item => <p key={item.id} className="mt-2 text-sm">{item.name} · {label(item.category)}{item.nextFollowUpAt ? ` · Follow up ${item.nextFollowUpAt.toLocaleDateString("en-PK")}` : ""}</p>)}</section></div></div></div></section>;
}
