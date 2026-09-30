import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { label } from "@/lib/workflow";
import { StatusBadge } from "@/components/operations";

export const metadata: Metadata = { title: "Volunteer dashboard" };
export const dynamic = "force-dynamic";

export default async function VolunteerPage() {
  const user = await requireRole(["VOLUNTEER"], "/volunteer");
  const tasks = await prisma.task.findMany({ where: { assigneeId: user.id }, orderBy: { deadline: "asc" }, include: { complaint: { select: { title: true, area: true, location: true } } } });
  const active = tasks.filter(item => !["COMPLETED", "CANCELLED"].includes(item.status));
  const overdue = active.filter(item => item.deadline < new Date());
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">Field team</p><h1 className="page-heading mt-3">Welcome, {user.name}</h1><p className="page-subtitle">Only tasks assigned to you appear here. Open a task for instructions, permitted location details, field notes and photo evidence.</p><Link href="/dashboard" className="mt-4 inline-block text-sm font-bold text-emerald-700 underline">View your citizen reports</Link><div className="mt-8 grid gap-4 sm:grid-cols-3"><div className="surface-card"><p className="text-3xl font-bold">{active.length}</p><p className="mt-1 text-sm text-slate-500">Active tasks</p></div><div className="surface-card"><p className="text-3xl font-bold">{overdue.length}</p><p className="mt-1 text-sm text-slate-500">Overdue tasks</p></div><div className="surface-card"><p className="text-3xl font-bold">{tasks.length - active.length}</p><p className="mt-1 text-sm text-slate-500">Finished tasks</p></div></div><div className="mt-8 space-y-4">{tasks.length ? tasks.map(task => { const late = task.deadline < new Date() && !["COMPLETED", "CANCELLED"].includes(task.status); return <Link key={task.id} href={`/volunteer/tasks/${task.id}`} className="surface-card block hover:border-emerald-300"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">{task.code}</p><h2 className="mt-1 text-lg font-bold">{label(task.type)} · {task.complaint.title}</h2><p className="mt-2 text-sm text-slate-600">{task.complaint.area}{task.complaint.location ? ` · ${task.complaint.location}` : ""}</p><p className={late ? "mt-2 text-sm font-bold text-red-700" : "mt-2 text-sm text-slate-500"}>Due {task.deadline.toLocaleString("en-PK")}{late ? " · OVERDUE" : ""}</p></div><StatusBadge status={task.status} /></div></Link>; }) : <div className="surface-card text-sm text-slate-500">No tasks have been assigned to you yet.</div>}</div></div></section>;
}
