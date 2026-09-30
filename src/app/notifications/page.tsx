import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { markNotificationReadAction } from "@/app/actions/operations";
import { formatPakistanDateTime } from "@/lib/pakistan-time";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireRole(["ADMIN", "CITY_MANAGER", "CITIZEN", "VOLUNTEER"], "/notifications");
  const notifications = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">Updates for you</p><h1 className="page-heading mt-3">Notifications</h1><p className="page-subtitle">Task assignments, case changes, resolution proposals and volunteer decisions appear here.</p><div className="mt-8 space-y-3">{notifications.length ? notifications.map(item => <article key={item.id} className={`surface-card flex flex-wrap items-center justify-between gap-4 ${item.readAt ? "opacity-75" : "border-emerald-300"}`}><div><p className="font-bold">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.message}</p><p className="mt-2 text-xs text-slate-400"><time dateTime={item.createdAt.toISOString()}>{formatPakistanDateTime(item.createdAt)}</time></p></div><div className="flex gap-3 text-sm font-bold"><Link href={item.href} className="text-emerald-700 underline">Open</Link>{!item.readAt && <form action={markNotificationReadAction}><input type="hidden" name="notificationId" value={item.id} /><button className="cursor-pointer text-slate-600 underline" type="submit">Mark read</button></form>}</div></article>) : <div className="surface-card text-sm text-slate-500">No notifications yet.</div>}</div></div></section>;
}
