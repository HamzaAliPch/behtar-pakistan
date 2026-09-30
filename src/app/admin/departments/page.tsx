import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { createDepartmentAction, updateDepartmentAction } from "@/app/actions/operations";
import { AdminNav, ErrorNotice } from "@/components/operations";

export const metadata: Metadata = { title: "Department directory" };
export const dynamic = "force-dynamic";

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole(["ADMIN"], "/admin/departments");
  const { error } = await searchParams;
  const departments = await prisma.department.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { referrals: true } } } });
  return <section className="inner-page"><div className="page-shell">
    <p className="section-kicker">Referral directory</p><h1 className="page-heading mt-3">Departments & jurisdictions</h1><p className="page-subtitle">Maintain contacts and coverage. Adding a department does not submit a referral.</p><AdminNav /><ErrorNotice error={error} />
    <form action={createDepartmentAction} className="surface-card mt-8 grid gap-4 sm:grid-cols-2"><div><label className="field-label" htmlFor="department-name">Department name</label><input id="department-name" name="name" className="field-input" minLength={3} maxLength={120} required /></div><div><label className="field-label" htmlFor="jurisdiction">Jurisdiction</label><input id="jurisdiction" name="jurisdiction" className="field-input" maxLength={300} required /></div><div><label className="field-label" htmlFor="serviceAreas">Service areas</label><input id="serviceAreas" name="serviceAreas" className="field-input" maxLength={500} required /></div><div><label className="field-label" htmlFor="contactDetails">Contact details (optional)</label><input id="contactDetails" name="contactDetails" className="field-input" maxLength={500} /></div><button className="btn-dark cursor-pointer sm:col-span-2 sm:w-fit" type="submit">Add department</button></form>
    <div className="mt-8 grid gap-4 md:grid-cols-2">{departments.length ? departments.map(item => <article key={item.id} className="surface-card"><div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{item.name}</h2><span className="text-xs font-bold text-emerald-700">{item.active ? "Active" : "Inactive"}</span></div><p className="mt-2 text-xs text-slate-500">{item._count.referrals} referrals recorded</p><form action={updateDepartmentAction} className="mt-5 space-y-3"><input type="hidden" name="departmentId" value={item.id} /><div><label className="field-label" htmlFor={`jurisdiction-${item.id}`}>Jurisdiction</label><input id={`jurisdiction-${item.id}`} name="jurisdiction" className="field-input" defaultValue={item.jurisdiction} maxLength={300} required /></div><div><label className="field-label" htmlFor={`areas-${item.id}`}>Service areas</label><input id={`areas-${item.id}`} name="serviceAreas" className="field-input" defaultValue={item.serviceAreas} maxLength={500} required /></div><div><label className="field-label" htmlFor={`contact-${item.id}`}>Contact details</label><input id={`contact-${item.id}`} name="contactDetails" className="field-input" defaultValue={item.contactDetails ?? ""} maxLength={500} /></div><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="active" value="1" defaultChecked={item.active} /> Accept new referral drafts</label><button className="btn-dark min-h-11 cursor-pointer" type="submit">Save directory entry</button></form></article>) : <p className="surface-card text-sm text-slate-500">No departments added yet.</p>}</div>
  </div></section>;
}
