import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AdminNav } from "@/components/operations";

export const metadata: Metadata = { title: "Completed work moderation" };
export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  await requireRole(["ADMIN"]);
  const complaints = await prisma.complaint.findMany({ where: { OR: [{ status: "RESOLVED" }, { completedWorkStory: { isNot: null } }] }, select: { id: true, reference: true, title: true, status: true, district: true, completedWorkStory: { select: { status: true, holdReason: true, updatedAt: true } }, evidence: { where: { stage: { in: ["BEFORE", "AFTER"] }, mimeType: { startsWith: "image/" } }, select: { stage: true, publicApprovedAt: true } } }, orderBy: { updatedAt: "desc" } });
  const published = complaints.filter(item => item.completedWorkStory?.status === "PUBLISHED").length;
  const withdrawn = complaints.filter(item => item.completedWorkStory?.status === "WITHDRAWN").length;
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">Public story review</p><h1 className="page-heading mt-3">Completed Work / Success Stories</h1><p className="page-subtitle">Publication happens automatically when a resolved case passes every check. Approval here never confirms a citizen resolution.</p><AdminNav /><div className="mt-7 grid gap-4 sm:grid-cols-3"><div className="surface-card"><p className="text-3xl font-bold">{published}</p><p className="text-sm">Published</p></div><div className="surface-card"><p className="text-3xl font-bold">{complaints.length - published - withdrawn}</p><p className="text-sm">Awaiting review or verification</p></div><div className="surface-card"><p className="text-3xl font-bold">{withdrawn}</p><p className="text-sm">Withdrawn or reopened</p></div></div><div className="mt-7 space-y-3">{complaints.map(item => { const missingBefore = !item.evidence.some(file => file.stage === "BEFORE"), missingAfter = !item.evidence.some(file => file.stage === "AFTER"), pendingApproval = item.evidence.some(file => !file.publicApprovedAt); return <Link key={item.id} href={`/admin/projects/${item.id}`} className="surface-card block hover:border-emerald-300"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">{item.reference} · {item.title}</h2><strong className="text-sm text-emerald-800">{item.completedWorkStory?.status ?? "NOT PREPARED"}</strong></div><p className="mt-2 text-sm text-slate-600">{item.status} · {item.district ?? "District not recorded"}</p><p className="mt-2 text-xs text-amber-800">{item.completedWorkStory?.holdReason ?? [missingBefore && "Missing BEFORE photo", missingAfter && "Missing AFTER photo", pendingApproval && "Public photo approval needed", item.status !== "RESOLVED" && "Resolution verification pending"].filter(Boolean).join("; ")}</p></Link>; })}{!complaints.length && <p className="surface-card text-sm text-slate-600">No completed-work candidates yet.</p>}</div></div></section>;
}
