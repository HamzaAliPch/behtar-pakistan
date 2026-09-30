import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { allocateFinanceCityAction } from "@/app/actions/finance-city";

export const dynamic = "force-dynamic";
export default async function FinanceCityAllocationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole(["ADMIN"]);
  const [{ error }, cities, campaigns, receipts, expenses, recent] = await Promise.all([
    searchParams,
    prisma.city.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.donationCampaign.findMany({ where: { cityId: null }, select: { id: true, title: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.donationIntent.findMany({ where: { cityId: null, campaignId: null, verifiedAt: { not: null }, status: { in: ["VERIFIED", "REFUNDED"] } }, select: { id: true, code: true, amountPkr: true }, orderBy: { verifiedAt: "desc" }, take: 50 }),
    prisma.donationExpense.findMany({ where: { cityId: null, campaignId: null, status: "PAID", paidAt: { not: null } }, select: { id: true, purpose: true, amountPkr: true }, orderBy: { paidAt: "desc" }, take: 50 }),
    prisma.donationAudit.findMany({ where: { action: "FINANCE_CITY_ALLOCATED" }, select: { id: true, targetType: true, targetId: true, details: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const rows = [
    ...campaigns.map(item => ({ kind: "CAMPAIGN", id: item.id, label: item.title })),
    ...receipts.map(item => ({ kind: "RECEIPT", id: item.id, label: `${item.code} · PKR ${item.amountPkr.toLocaleString("en-PK")}` })),
    ...expenses.map(item => ({ kind: "EXPENSE", id: item.id, label: `${item.purpose} · PKR ${item.amountPkr.toLocaleString("en-PK")}` })),
  ];
  return <section className="inner-page"><div className="page-shell"><Link href="/admin/finance" className="text-sm font-bold text-emerald-800 underline">← Finance</Link><h1 className="page-heading mt-3">City fund allocations</h1><p className="page-subtitle">Historical funds remain unallocated until reviewed. A campaign allocation applies to its linked receipts and expenses. This action is audited and cannot be changed here after saving.</p>{error && <p className="form-error mt-4" role="alert">Allocation could not be saved. Check that the record is still unallocated and the city is active.</p>}<div className="mt-8 space-y-4">{rows.map(row => <form key={row.id} action={allocateFinanceCityAction} className="surface-card flex flex-wrap items-center gap-4"><input type="hidden" name="kind" value={row.kind} /><input type="hidden" name="id" value={row.id} /><div className="min-w-52 flex-1"><p className="text-xs font-bold text-emerald-800">{row.kind}</p><strong>{row.label}</strong></div><label className="text-sm font-semibold">Assign city<select name="cityId" required className="field-input mt-1"><option value="">Choose active city</option>{cities.map(city => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label><button className="btn-dark cursor-pointer" type="submit">Record allocation</button></form>)}{!rows.length && <p className="surface-card text-sm">No unallocated financial records in this review window.</p>}</div><h2 className="mt-10 text-xl font-bold">Recent allocation audit</h2><ul className="mt-4 space-y-2 text-sm">{recent.map(item => <li key={item.id}>{item.createdAt.toLocaleString("en-PK")} · {item.targetType} · {item.targetId} · {item.details}</li>)}</ul></div></section>;
}
