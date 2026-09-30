import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { categories } from "@/lib/complaints";
import { approveSlaPolicy, karachiTime, slaStages } from "@/lib/sla";
import { AdminNav } from "@/components/operations";

async function savePolicy(form: FormData) {
  "use server";
  const actor = await requireRole(["ADMIN"], "/admin/sla");
  try { await approveSlaPolicy(actor, String(form.get("cityId") ?? ""), String(form.get("category") ?? ""), Number(form.get("firstReviewHours")), Number(form.get("verificationHours")), Number(form.get("resolutionHours"))); }
  catch { redirect("/admin/sla?error=invalid"); }
  revalidatePath("/admin/sla"); redirect("/admin/sla?saved=1");
}

export default async function AdminSlaPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole(["ADMIN"], "/admin/sla");
  const [query, cities, policies, snapshots, deliveryGroups, blockedDeliveries, worker] = await Promise.all([
    searchParams,
    prisma.city.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.slaPolicy.findMany({ where: { active: true }, orderBy: [{ cityId: "asc" }, { category: "asc" }] }),
    prisma.complaintSlaSnapshot.findMany({ where: { complaint: { status: { notIn: ["RESOLVED", "REJECTED"] } } }, include: { complaint: { select: { id: true, reference: true } } }, take: 500 }),
    prisma.notificationOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.notificationOutbox.findMany({ where: { status: "BLOCKED" }, select: { id: true, complaintId: true, channel: true, kind: true, lastErrorCode: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.notificationWorkerState.findUnique({ where: { id: 1 } }),
  ]);
  const needingAttention = snapshots.flatMap(snapshot => {
    const next = slaStages(snapshot).find(stage => !stage.actual && (stage.state === "OVERDUE" || stage.state === "APPROACHING"));
    return next ? [{ complaint: snapshot.complaint, next }] : [];
  }).sort((a, b) => (a.next.target?.getTime() ?? 0) - (b.next.target?.getTime() ?? 0));
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">Transparent service goals</p><h1 className="page-heading mt-3">Case timeline targets</h1><p className="page-subtitle">Approved goals are shown to citizens. They are not guarantees. New policies apply only to reports submitted afterward; historical targets remain unchanged.</p><AdminNav />
    {query.saved && <p role="status" className="mt-5 text-emerald-800">Policy approved for future reports.</p>}{query.error && <p role="alert" className="form-error mt-5">Choose an active city and category, with whole-hour targets in increasing order.</p>}
    <div className="mt-8 grid gap-6 lg:grid-cols-2"><div className="surface-card"><h2 className="text-xl font-bold">Approve a policy</h2><form action={savePolicy} className="mt-4 space-y-4"><label className="block"><span className="field-label">City</span><select name="cityId" className="field-input" required>{cities.map(city => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label><label className="block"><span className="field-label">Category</span><select name="category" className="field-input" required>{["ALL", ...categories].map(category => <option key={category} value={category}>{category === "ALL" ? "All categories (fallback)" : category}</option>)}</select></label>{[["First review", "firstReviewHours"], ["Verification or assignment", "verificationHours"], ["Proposed resolution", "resolutionHours"]].map(([label, name]) => <label key={name} className="block"><span className="field-label">{label} · hours from submission</span><input name={name} type="number" min="1" max="8760" step="1" required className="field-input" /></label>)}<button type="submit" className="btn-dark">Approve targets</button></form></div><div className="surface-card"><h2 className="text-xl font-bold">Current approved policies</h2>{policies.length ? <ul className="mt-4 space-y-3 text-sm">{policies.map(policy => <li key={policy.id} className="border-b pb-3"><strong>{cities.find(city => city.id === policy.cityId)?.name ?? "City"} · {policy.category}</strong><span className="mt-1 block text-slate-600">Version {policy.version} · review {policy.firstReviewHours}h · verify/assign {policy.verificationHours}h · proposal {policy.resolutionHours}h</span><span className="text-xs text-slate-500">Approved {karachiTime(policy.approvedAt)}</span></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No policy approved. Citizen tracking says “Target not yet defined.”</p>}</div></div>
    <div className="surface-card mt-7"><h2 className="text-xl font-bold">Cases needing attention</h2><p className="mt-2 text-sm text-slate-600">Approaching means within 24 hours. Times shown in Pakistan Standard Time. Showing up to 500 active cases.</p>{needingAttention.length ? <ul className="mt-4 divide-y">{needingAttention.slice(0, 50).map(item => <li key={item.complaint.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><Link href={`/admin/cases/${item.complaint.id}`} className="font-bold text-emerald-800 underline">{item.complaint.reference}</Link><span>{item.next.label} · {item.next.state.toLowerCase()} · {item.next.target && karachiTime(item.next.target)}</span></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No approaching or overdue defined targets.</p>}</div>
    <div className="surface-card mt-7"><h2 className="text-xl font-bold">Reminder worker health</h2><p className="mt-2 text-sm text-slate-600">The worker requires a separate schedule. These are observed runs, not a promise of external delivery.</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="font-bold">Last successful run</dt><dd>{worker?.lastSuccessAt ? karachiTime(worker.lastSuccessAt) : "Never observed"}</dd></div><div><dt className="font-bold">Last run result</dt><dd>{worker?.lastErrorCode ? `Failed (${worker.lastErrorCode})` : worker?.lastFinishedAt ? `${worker.lastDelivered} delivered in-app or mock, ${worker.lastRetry} retry, ${worker.lastBlocked} blocked` : "Not run"}</dd></div><div><dt className="font-bold">Lease</dt><dd>{worker?.leaseUntil && worker.leaseUntil > new Date() ? "Running" : "Idle"}</dd></div></dl></div>
    <div className="surface-card mt-7"><h2 className="text-xl font-bold">Notification delivery audit</h2><p className="mt-2 text-sm text-slate-600">External channels are disabled until an authorized provider is configured. A queued or blocked row is never a successful send. Contacts and message contents are hidden here.</p><div className="mt-4 flex flex-wrap gap-3">{["PENDING", "RETRY", "BLOCKED", "DELIVERED", "CANCELLED"].map(status => <div key={status} className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><strong>{deliveryGroups.find(row => row.status === status)?._count._all ?? 0}</strong> {status.toLowerCase()}</div>)}</div>{blockedDeliveries.length > 0 && <ul className="mt-4 divide-y text-sm">{blockedDeliveries.map(row => <li key={row.id} className="flex flex-wrap gap-2 py-2"><span>{row.channel} · {row.kind.replaceAll("_", " ")} · {row.lastErrorCode ?? "delivery blocked"} · {karachiTime(row.updatedAt)}</span>{row.complaintId && <Link href={`/admin/cases/${row.complaintId}`} className="font-bold text-emerald-800 underline">Open case</Link>}</li>)}</ul>}</div>
  </div></section>;
}
