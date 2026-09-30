
import { brand } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { complaintStatuses, label } from "@/lib/workflow";
import { AdminNav, StatusBadge } from "@/components/operations";
import { getFinanceSnapshot } from "@/lib/finance";
import { slaStages } from "@/lib/sla";

export const metadata: Metadata = { title: "Operations dashboard" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireRole(["ADMIN"], "/admin");
  const now = new Date();
  const [statusGroups, pendingVolunteers, activeTasks, overdueTasks, referralFollowUps, awaitingVerification, reopenedCases, recent, finance, activeTeam, activeNgoProjects, pendingDonations, pendingExpenses, storyDrafts, storyWithdrawn, storyReview, slaSnapshots, pendingLinks] = await Promise.all([
    prisma.complaint.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.volunteerApplication.count({ where: { status: "PENDING" } }),
    prisma.task.count({ where: { status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
    prisma.task.count({ where: { status: { notIn: ["COMPLETED", "CANCELLED"] }, deadline: { lt: now } } }),
    prisma.referral.count({ where: { status: { notIn: ["DRAFT", "CLOSED"] }, followUpAt: { lte: now } } }),
    prisma.complaint.count({ where: { status: "RESOLUTION_PROPOSED" } }),
    prisma.complaint.count({ where: { status: "REOPENED" } }),
    prisma.complaint.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { user: { select: { name: true } } } }),
    getFinanceSnapshot(),
    prisma.user.count({ where: { role: "VOLUNTEER", volunteerApplication: { status: "APPROVED" } } }),
    prisma.ngoProject.count({ where: { status: "ACTIVE", ngo: { status: "ACTIVE" } } }),
    prisma.donationIntent.count({ where: { status: "PENDING" } }),
    prisma.donationExpense.count({ where: { status: { in: ["DRAFT", "APPROVED"] } } }),
    prisma.completedWorkStory.count({ where: { status: "DRAFT" } }),
    prisma.completedWorkStory.count({ where: { status: "WITHDRAWN" } }),
    prisma.completedWorkStory.findMany({ where: { status: { in: ["DRAFT", "WITHDRAWN"] } }, select: { id: true, complaintId: true, status: true, holdReason: true, complaint: { select: { reference: true } } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.complaintSlaSnapshot.findMany({ where: { complaint: { status: { notIn: ["RESOLVED", "REJECTED"] } } } }),
    prisma.caseLink.count({ where: { status: "SUGGESTED" } }),
  ]);
  const counts = new Map(statusGroups.map(item => [item.status, item._count._all]));
  const totalCases = statusGroups.reduce((sum, item) => sum + item._count._all, 0);
  const resolvedCases = counts.get("RESOLVED") ?? 0;
  const activeCases = totalCases - resolvedCases - (counts.get("REJECTED") ?? 0);
  const overdueSla = slaSnapshots.filter(snapshot => slaStages(snapshot, now).some(stage => stage.state === "OVERDUE")).length;
  const approachingSla = slaSnapshots.filter(snapshot => { const stages = slaStages(snapshot, now); return !stages.some(stage => stage.state === "OVERDUE") && stages.some(stage => stage.state === "APPROACHING"); }).length;
  const metricCards = [["Overdue case targets", overdueSla, "/admin/sla"], ["Approaching case targets", approachingSla, "/admin/sla"], ["Related case suggestions", pendingLinks, "/admin/duplicates"], ["Total complaints", totalCases, "/admin"], ["Active complaints", activeCases, "/admin"], ["Resolved complaints", resolvedCases, "/admin"], ["Completed stories awaiting review", storyDrafts, "/admin/projects"], ["Withdrawn or reopened stories", storyWithdrawn, "/admin/projects"], ["Verified donations received (PKR)", finance.verifiedNet, "/admin/finance"], ["Funds spent (PKR)", finance.spent, "/admin/finance"], ["Available fund balance (PKR)", finance.available, "/admin/finance"], ["Active team members", activeTeam, "/admin/team"], ["Active NGO projects", activeNgoProjects, "/admin/ngos"], ["Pending financial reviews", pendingDonations + pendingExpenses, "/admin/finance"], ["Pending volunteers", pendingVolunteers, "/admin/volunteers"], ["Active tasks", activeTasks, "/admin/tasks"], ["Overdue tasks", overdueTasks, "/admin/tasks?overdue=1"], ["Referral follow-ups", referralFollowUps, "/admin/referrals?followup=1"], ["Awaiting citizen verification", awaitingVerification, "/admin"], ["Reopened cases", reopenedCases, "/admin"]] as const;
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">{brand.name} operations</p><h1 className="page-heading mt-3">Admin dashboard</h1><p className="page-subtitle">Live counts from the local database. Open a case to verify, assign, refer or review its resolution.</p><AdminNav />
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{metricCards.map(([title, count, href]) => <Link href={href} key={title} className="surface-card hover:border-emerald-300"><p className="text-3xl font-bold">{count.toLocaleString("en-PK")}</p><p className="mt-2 text-sm font-semibold text-slate-600">{title}</p></Link>)}</div>
    <div className="surface-card mt-8"><h2 className="text-xl font-bold">Operations workspaces</h2><div className="mt-4 flex flex-wrap gap-3">{[["Related case review", "/admin/duplicates"], ["Funds and finance", "/admin/finance"], ["Team and field work", "/admin/team"], ["NGO projects", "/admin/ngos"], ["Completed work review", "/admin/projects"], ["Contacts and outreach", "/admin/contacts"], ["Evidence library", "/admin/evidence"]].map(([title, href]) => <Link key={href} href={href} className="rounded-xl border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-800 hover:bg-emerald-50">{title} →</Link>)}</div></div>
    {storyReview.length > 0 && <div className="surface-card mt-8"><h2 className="text-xl font-bold">Completed work awaiting publication</h2><div className="mt-4 divide-y">{storyReview.map(item => <Link key={item.id} href={`/admin/projects/${item.complaintId}`} className="block py-3 text-sm hover:text-emerald-800"><strong>{item.complaint.reference} · {item.status}</strong><span className="mt-1 block text-slate-600">{item.holdReason ?? "Admin review required"}</span></Link>)}</div><Link href="/admin/projects" className="mt-3 inline-block text-sm font-bold text-emerald-700 underline">Review all stories</Link></div>}
    <div className="surface-card mt-8"><h2 className="text-xl font-bold">Complaint statuses</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{complaintStatuses.map(status => <div key={status} className="rounded-xl bg-[#f5faf8] p-4"><p className="text-2xl font-bold">{counts.get(status) ?? 0}</p><p className="mt-1 text-xs font-semibold text-slate-600">{label(status)}</p></div>)}</div></div>
    <div className="surface-card mt-8"><h2 className="text-xl font-bold">Recent complaints</h2>{recent.length ? <div className="mt-4 divide-y divide-slate-100">{recent.map(item => <Link key={item.id} href={`/admin/cases/${item.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-[#f7faf9]"><div><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.reference} · {item.area} · {item.user?.name ?? "Legacy case"}</p></div><StatusBadge status={item.status} /></Link>)}</div> : <p className="mt-5 text-sm text-slate-500">No complaints yet.</p>}</div>
  </div></section>;
}
