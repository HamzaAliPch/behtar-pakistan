import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { reviewVolunteerAction } from "@/app/actions/operations";
import { AdminNav, ErrorNotice, StatusBadge } from "@/components/operations";

export const metadata: Metadata = { title: "Volunteer applications" };
export const dynamic = "force-dynamic";

export default async function VolunteerApplicationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole(["ADMIN"], "/admin/volunteers");
  const { error } = await searchParams;
  const applications = await prisma.volunteerApplication.findMany({ orderBy: { createdAt: "desc" }, include: { user: { select: { email: true } } } });
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">Volunteer management</p><h1 className="page-heading mt-3">Applications</h1><p className="page-subtitle">Review citizen applications before granting volunteer access. Every decision is recorded in the admin audit log.</p><AdminNav /><ErrorNotice error={error} />
    <div className="mt-8 space-y-5">{applications.length ? applications.map(item => <article key={item.id} className="surface-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{item.fullName}</h2><p className="mt-1 text-sm text-slate-500">{item.district} · {item.serviceArea}</p></div><StatusBadge status={item.status} /></div><div className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><p><strong>Contact:</strong> {item.contactEmail} · {item.contactPhone}</p><p><strong>Account:</strong> {item.user.email}</p><p><strong>Skills:</strong> {item.skills}</p><p><strong>Availability:</strong> {item.availability}</p>{item.experience && <p className="sm:col-span-2"><strong>Experience:</strong> {item.experience}</p>}</div>{item.status === "PENDING" && <form action={reviewVolunteerAction} className="mt-6 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-5"><input type="hidden" name="id" value={item.id} /><div className="min-w-52 flex-1"><label className="field-label" htmlFor={`note-${item.id}`}>Review note (optional)</label><input className="field-input" id={`note-${item.id}`} name="note" maxLength={1000} /></div><button type="submit" name="decision" value="APPROVED" className="btn-dark min-h-12 cursor-pointer">Approve</button><button type="submit" name="decision" value="REJECTED" className="min-h-12 cursor-pointer rounded-xl border border-red-200 px-5 text-sm font-bold text-red-700">Reject</button></form>}{item.reviewNote && <p className="mt-4 text-sm text-slate-600">Review note: {item.reviewNote}</p>}</article>) : <div className="surface-card text-sm text-slate-500">No applications yet.</div>}</div>
  </div></section>;
}
