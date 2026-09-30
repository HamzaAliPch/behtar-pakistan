import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AdminNav, ErrorNotice } from "@/components/operations";
import { answerSupportAction } from "@/app/actions/support";

export const dynamic = "force-dynamic";
export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole(["ADMIN"]);
  const [{ error }, items] = await Promise.all([searchParams, prisma.supportRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true, email: true } } } })]);
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">Human help</p><h1 className="page-heading mt-3">Support requests</h1><p className="page-subtitle">Reply to citizens in the app. Requests and replies are private to the team and requester.</p><AdminNav /><ErrorNotice error={error} /><div className="mt-7 space-y-4">{items.length ? items.map(item => <article key={item.id} className="surface-card"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">{item.user.name} · {item.user.email}</h2><span className="text-xs font-bold text-emerald-700">{item.status}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.question}</p><p className="mt-2 text-xs text-slate-500">{item.language} · {item.createdAt.toLocaleString("en-PK")}</p>{item.status === "OPEN" ? <form action={answerSupportAction} className="mt-5 space-y-3"><input type="hidden" name="id" value={item.id} /><label className="field-label" htmlFor={`reply-${item.id}`}>Reply</label><textarea id={`reply-${item.id}`} name="response" className="field-input min-h-24" minLength={10} maxLength={3000} required /><button type="submit" className="btn-dark cursor-pointer">Send reply</button></form> : <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm">{item.response}</p>}</article>) : <p className="surface-card text-sm text-slate-600">No support requests yet.</p>}</div></div></section>;
}
