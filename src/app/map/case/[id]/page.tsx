import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/operations";
import { getCurrentUser } from "@/lib/auth/session";
import { followComplaintAction } from "@/app/actions/map";
import { supportComplaintAction } from "@/app/actions/support";
import { activePublicCities, publicComplaintCityFilter } from "@/lib/public-cities";

export const dynamic = "force-dynamic";
export default async function PublicCasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ supportSaved?: string; supportError?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const cities = await activePublicCities();
  const item = await prisma.complaint.findFirst({ where: { id, publicVisible: true, ...publicComplaintCityFilter(null, cities.map(city => city.id)) }, select: {
    id: true, title: true, userId: true, publicTitle: true, category: true, publicArea: true, district: true, status: true,
    followers: { select: { userId: true } }, supporters: { where: { active: true }, select: { userId: true } },
  } });
  if (!item) notFound();
  const user = await getCurrentUser();
  const following = item.followers.some(follower => follower.userId === user?.id);
  const supporting = item.supporters.some(supporter => supporter.userId === user?.id);
  const eligibleUser = user?.role === "CITIZEN" || user?.role === "VOLUNTEER";
  const publicSupportCount = item.title.startsWith("[QA TEST]") ? null : item.supporters.length;
  return <section className="inner-page"><div className="page-shell"><Link href="/map" className="text-sm font-bold text-emerald-700 underline">← Back to map</Link><article className="surface-card mt-6"><p className="section-kicker">Approved public report</p><h1 className="page-heading mt-3">{item.publicTitle}</h1><div className="mt-5"><StatusBadge status={item.status} /></div><p className="mt-5 text-sm text-slate-600">{item.category} · {item.publicArea}{item.district ? ` · District ${item.district}` : ""}</p><p className="mt-3 text-xs text-slate-500">Private descriptions, exact coordinates, supporter identities and internal updates are not shown here.</p>
    {publicSupportCount !== null && <p className="mt-4 text-sm font-bold text-emerald-900">{publicSupportCount} {publicSupportCount === 1 ? "person" : "people"} affected too</p>}
    {query.supportSaved && <p role="status" className="mt-4 text-sm text-emerald-800">Your support preference was saved.</p>}{query.supportError && <p role="alert" className="form-error mt-4">Unable to save your support right now. Please try again later.</p>}
    {eligibleUser && <div className="mt-6 flex flex-wrap gap-3"><form action={followComplaintAction}><input type="hidden" name="complaintId" value={item.id} /><button className="min-h-12 rounded-xl border border-emerald-700 px-4 text-sm font-bold text-emerald-800" type="submit">{following ? "Stop following updates" : "Follow updates"}</button></form>{item.userId !== user?.id && item.status !== "REJECTED" && <form action={supportComplaintAction}><input type="hidden" name="complaintId" value={item.id} /><input type="hidden" name="active" value={supporting ? "0" : "1"} /><button className="btn-dark cursor-pointer" type="submit">{supporting ? "Remove my support" : "I'm affected too / Same issue"}</button></form>}</div>}
    {!user && <p className="mt-5 text-sm"><Link href={`/login?next=${encodeURIComponent(`/map/case/${id}`)}`} className="font-bold text-emerald-700 underline">Sign in</Link> to follow or support this report.</p>}
    <p className="mt-4 text-xs text-slate-500">Supporting a report never changes its priority. If you need your own case history or resolution review, <Link href="/report" className="font-bold underline">file a separate report</Link>.</p>
  </article></div></section>;
}
