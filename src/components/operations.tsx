
import { brand } from "@/lib/brand";
import Image from "next/image";
import Link from "next/link";
import type { Evidence } from "@prisma/client";
import { label } from "@/lib/workflow";
import { publishEvidenceAction } from "@/app/actions/operations";
import { formatPakistanDateTime } from "@/lib/pakistan-time";

export function AdminNav() {
  const links = [["/admin", "Overview"], ["/admin/sla", "Case targets"], ["/admin/duplicates", "Related cases"], ["/admin/locations", "Cities & areas"], ["/admin/city-scopes", "City access"], ["/admin/finance", "Finance"], ["/admin/team", "Team"], ["/admin/ngos", "NGOs"], ["/admin/projects", "Completed Work"], ["/admin/contacts", "Contacts"], ["/admin/evidence", "Evidence"], ["/admin/volunteers", "Volunteers"], ["/admin/tasks", "Tasks"], ["/admin/departments", "Departments"], ["/admin/referrals", "Referrals"], ["/admin/donations", "Donations"], ["/admin/help", "Help articles"], ["/admin/support", "Support"]];
  return <nav aria-label="Admin operations" className="mt-7 flex flex-wrap gap-2">{links.map(([href, title]) => <Link key={href} href={href} className="rounded-lg border border-[#d9e9e4] bg-white px-4 py-2 text-sm font-semibold text-[#205063] hover:border-emerald-500 hover:text-emerald-700">{title}</Link>)}</nav>;
}

export function ErrorNotice({ error }: { error?: string }) {
  if (!error) return null;
  const messages: Record<string, string> = { invalid: "Please check the fields and try again.", map_location_required: "A recorded map pin is required before this case can be approved for the public map. Do not guess a location; the report and any separately approved completed-work story remain valid without one.", map_invalid_location: "The recorded pin is outside the supported Karachi map area. Review the location before public map approval.", map_status_required: "Verify this case before approving it for the public map.", forbidden: "You do not have permission to do that.", not_found: "The requested record was not found.", conflict: "This action is not allowed in the current state.", unexpected: "Something went wrong. Please try again." };
  return <p className="form-error mt-6" role="alert">{messages[error] ?? messages.unexpected}</p>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === "RESOLVED" || status === "COMPLETED" || status === "APPROVED" || status === "CLOSED" ? "bg-emerald-100 text-emerald-800" : status === "BLOCKED" || status === "REJECTED" || status === "CANCELLED" ? "bg-red-100 text-red-800" : status === "OVERDUE" || status === "FOLLOW_UP_REQUIRED" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800";
  return <span className={`status-pill ${tone}`}>{label(status)}</span>;
}

export type TimelineEntry = { id: string; kind: string; summary: string; visibility: string; createdAt: Date; actor: { name: string } | null };
export function Timeline({ events }: { events: TimelineEntry[] }) {
  return events.length ? <ol className="space-y-0" aria-label="Case activity, newest first">{events.map(item => <li key={item.id} className="relative border-l-2 border-emerald-100 pb-6 pl-6 last:pb-0"><span aria-hidden="true" className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-emerald-500" /><p className="text-sm font-semibold text-ink">{item.summary}</p><p className="mt-1 text-xs text-slate-500"><time dateTime={item.createdAt.toISOString()}>{formatPakistanDateTime(item.createdAt)}</time> · {item.actor?.name ?? `${brand.name}`}</p></li>)}</ol> : <p className="text-sm text-slate-500">No activity yet.</p>;
}

export function EvidenceCards({ evidence, complaintId, admin = false }: { evidence: Evidence[]; complaintId: string; admin?: boolean }) {
  if (!evidence.length) return <p className="text-sm text-slate-500">No photos uploaded yet.</p>;
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{evidence.map(item => <div key={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">{item.mimeType.startsWith("video/") ? <video controls preload="metadata" src={`/api/evidence/${item.id}`} className="h-44 w-full bg-black object-contain" aria-label={`${label(item.stage)} field video`} /> : <Image unoptimized src={`/api/evidence/${item.id}`} alt={`${label(item.stage)} field evidence`} width={600} height={380} className="h-44 w-full object-cover" />}<div className="p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-emerald-700">{label(item.stage)}</span><span className="text-xs text-slate-400">{item.createdAt.toLocaleDateString("en-PK")}</span></div>{item.note && <p className="mt-2 text-sm text-slate-600">{item.note}</p>}{admin && item.visibility !== "OWNER" && <form action={publishEvidenceAction} className="mt-3"><input type="hidden" name="evidenceId" value={item.id} /><input type="hidden" name="complaintId" value={complaintId} /><button className="text-xs font-bold text-emerald-700 underline" type="submit">Share with citizen</button></form>}{admin && item.visibility === "OWNER" && <p className="mt-2 text-xs text-emerald-700">Shared with citizen</p>}</div></div>)}</div>;
}
