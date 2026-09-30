
import { brand } from "@/lib/brand";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { AssistantChat } from "@/components/assistant-chat";
import { getCurrentUser } from "@/lib/auth/session";
import Link from "next/link";
import { notFound } from "next/navigation";
import { selectedPublicCity } from "@/lib/public-cities";

export const metadata: Metadata = { title: `${brand.name} help` };
export const dynamic = "force-dynamic";
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const user = await getCurrentUser();
  const [{ city: slug }, cities] = await Promise.all([searchParams, prisma.city.findMany({ select: { id: true, slug: true, name: true, status: true, districts: { select: { name: true } } }, orderBy: { name: "asc" } })]);
  const city = selectedPublicCity(slug ?? "karachi", cities.filter(item => item.status === "ACTIVE"));
  const selected = city ?? cities.find(item => item.slug === slug);
  if (!selected) notFound();
  const [articles, requests] = await Promise.all([prisma.helpArticle.findMany({ where: { published: true, ...(selected.status === "ACTIVE" ? { OR: [{ cityId: selected.id }, ...(selected.slug === "karachi" ? [{ cityId: null }] : [])] } : { cityId: selected.id }) }, select: { id: true, title: true, category: true, language: true, content: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 40 }), (user?.role === "CITIZEN" || user?.role === "VOLUNTEER") ? prisma.supportRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }) : Promise.resolve([])]);
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">Guidance and support</p><h1 className="page-heading mt-3">How can we help?</h1><p className="page-subtitle">Ask in English, Urdu or Roman Urdu. The local assistant works without an AI account. Case decisions always remain with authorized people.</p><nav aria-label="Choose help city" className="mt-5 flex flex-wrap gap-2">{cities.map(item => <Link key={item.id} href={`/help?city=${encodeURIComponent(item.slug)}`} aria-current={selected.id === item.id ? "page" : undefined} className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-bold text-emerald-900">{item.name}{item.status !== "ACTIVE" ? " · Coming Soon" : ""}</Link>)}</nav><AssistantChat citySlug={selected.slug} />{(user?.role === "CITIZEN" || user?.role === "VOLUNTEER") && <div className="surface-card mt-8"><h2 className="text-xl font-bold">Your human support requests</h2>{requests.length ? <div className="mt-4 space-y-3">{requests.map(item => <div key={item.id} className="rounded-xl border border-slate-100 p-4"><p className="font-semibold">{item.question}</p><p className="mt-2 text-xs text-slate-500">{item.status} · {item.createdAt.toLocaleString("en-PK")}</p>{item.response && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm">{item.response}</p>}</div>)}</div> : <p className="mt-3 text-sm text-slate-600">No requests sent yet.</p>}</div>}<div className="mt-10"><h2 className="text-2xl font-bold">Published help articles</h2>{articles.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2">{articles.map(article => <article key={article.id} className="surface-card"><p className="text-xs font-bold text-emerald-700">{article.category} · {article.language}</p><h3 className="mt-2 text-lg font-bold">{article.title}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{article.content}</p><p className="mt-4 text-xs text-slate-500">Updated {article.updatedAt.toLocaleDateString("en-PK")}</p></article>)}</div> : <p className="mt-5 text-sm text-slate-600">No team-approved help articles have been published yet. The assistant can still explain {brand.name} workflows.</p>}</div></div></section>;
}
