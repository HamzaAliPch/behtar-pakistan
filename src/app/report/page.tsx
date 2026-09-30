import { getReportingCity } from "@/lib/location-catalog";
import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { categories } from "@/lib/complaints";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { event, notifyAdmins } from "@/lib/operations/common";
import { DISTRICTS, parseCoordinates } from "@/lib/geo";
import { ReportWizard } from "@/components/report-wizard";
import Link from "next/link";
import { AssistantChat } from "@/components/assistant-chat";

export const metadata: Metadata = { title: "Report an issue" };

async function submitReport(formData: FormData) {
  "use server";
  const user = await requireRole(["CITIZEN", "VOLUNTEER"], "/report");
  const city = await getReportingCity(String(formData.get("citySlug") || "karachi"));
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const district = String(formData.get("district") ?? "");
  let point: ReturnType<typeof parseCoordinates>;
  try { point = parseCoordinates(formData.get("latitude"), formData.get("longitude")); } catch { redirect("/report?error=invalid"); }
  if (title.length < 5 || title.length > 120 || !categories.some(item => item === category) || area.length < 2 || area.length > 80 || location.length > 160 || description.length < 10 || description.length > 2000 || (district && !DISTRICTS.includes(district as typeof DISTRICTS[number]))) {
    redirect("/report?error=invalid");
  }
  const reference = `KFX-${randomBytes(8).toString("hex").toUpperCase()}`;
  await prisma.$transaction(async tx => {
    const complaint = await tx.complaint.create({ data: { reference, cityId: city.id, locationNeedsReview: true, title, category, area, district: district || null, location: location || null, latitude: point?.latitude, longitude: point?.longitude, description, userId: user.id, status: "SUBMITTED" } });
    await event(tx, { complaintId: complaint.id, actorId: user.id, kind: "SUBMITTED", summary: "Complaint submitted", visibility: "PUBLIC" });
    await notifyAdmins(tx, "New complaint", `A citizen submitted ${reference}.`, `/admin/cases/${complaint.id}`);
  });
  redirect(`/track?ref=${reference}&submitted=1`);
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ error?: string; city?: string }> }) {
  await requireRole(["CITIZEN", "VOLUNTEER"], "/report");
  const { error, city: citySlug } = await searchParams;
  let city;
  try { city = await getReportingCity(citySlug || "karachi"); } catch { redirect("/cities"); }
  return <section className="inner-page"><div className="page-shell"><p className="section-kicker">{brand.activeCityName} · Citizen reporting</p><h1 className="page-heading mt-3">Report an issue</h1><p className="page-subtitle">Tell us what is happening and where. Your report will be saved locally and you will receive a reference to track it.</p>
    <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_280px]"><ReportWizard initialError={Boolean(error)} city={city} /><aside className="h-fit"><div className="surface-card"><div className="step-icon"><ClipboardList size={23} /></div><h2 className="mt-5 text-lg font-bold">What happens next?</h2><p className="mt-3 text-sm leading-7 text-slate-600">Your complaint starts with a “Submitted” status. Save the reference shown after submission to check its progress at any time.</p><p className="mt-5 rounded-xl bg-[#eef8f4] p-4 text-xs leading-6 text-[#246857]">Reports appear on the public map only after team verification and explicit approval. Exact locations stay private.</p><Link href="/help" className="mt-4 block text-sm font-bold text-emerald-700 underline">Full help page</Link></div><details className="mt-4"><summary className="cursor-pointer rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">Ask the reporting assistant</summary><AssistantChat citySlug={city.slug} /></details></aside></div>
    <form action={submitReport} className="hidden" aria-hidden="true"><input type="hidden" name="title" /></form>
  </div></section>;
}
