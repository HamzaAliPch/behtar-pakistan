
import { brand } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, ClipboardList, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { StatusBadge } from "@/components/operations";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireRole(["CITIZEN", "VOLUNTEER"], "/dashboard");
  const where = { userId: user.id };
  const [total, resolved, recent, unread] = await Promise.all([prisma.complaint.count({ where }), prisma.complaint.count({ where: { ...where, status: "RESOLVED" } }), prisma.complaint.findMany({ where, orderBy: { createdAt: "desc" }, take: 8 }), prisma.notification.count({ where: { userId: user.id, readAt: null } })]);
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">Your reports</p><h1 className="page-heading mt-3">Welcome, {user.name}</h1><p className="page-subtitle">Your personal complaint dashboard. Only reports from your account appear here.</p><div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-emerald-700"><Link href="/profile" className="underline">Your profile</Link>{user.role === "VOLUNTEER" ? <Link href="/volunteer" className="underline">Your volunteer tasks</Link> : <Link href="/volunteer/apply" className="underline">Apply to volunteer</Link>}<Link href="/notifications" className="underline">Notifications ({unread} unread)</Link><Link href="/help" className="underline">Ask {brand.name} assistant</Link></div>
    <div className="mt-10 grid gap-4 sm:grid-cols-3"><div className="surface-card"><ClipboardList size={22} className="text-emerald-600" /><p className="mt-5 text-4xl font-bold">{total}</p><p className="mt-1 text-sm text-slate-500">Total reports</p></div><div className="surface-card"><BarChart3 size={22} className="text-amber-500" /><p className="mt-5 text-4xl font-bold">{total - resolved}</p><p className="mt-1 text-sm text-slate-500">Open reports</p></div><div className="surface-card"><CheckCircle2 size={22} className="text-emerald-600" /><p className="mt-5 text-4xl font-bold">{resolved}</p><p className="mt-1 text-sm text-slate-500">Resolved reports</p></div></div>
    <div className="surface-card mt-8"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold">Recent reports</h2><p className="mt-1 text-sm text-slate-500">Your latest complaints</p></div><Link href="/report" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700">Report an issue <ArrowRight size={16} /></Link></div>{recent.length === 0 ? <div className="mt-9 rounded-xl bg-[#f5faf8] px-5 py-10 text-center"><p className="font-semibold">No reports yet</p><p className="mt-2 text-sm text-slate-500">The first report will appear here once submitted.</p></div> : <div className="mt-6 divide-y divide-slate-100">{recent.map(item => <Link href={`/track?ref=${item.reference}`} key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-[#f8fbfa]"><div><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.area} · {item.category} · {item.reference}</p></div><StatusBadge status={item.status} /></Link>)}</div>}</div>
  </div></section>;
}
