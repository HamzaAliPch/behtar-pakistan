"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PublicMapApprovalError, setPublicVisibility } from "@/lib/geo";
import { activePublicCities, publicComplaintCityFilter } from "@/lib/public-cities";

export async function publicVisibilityAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const id = String(form.get("complaintId") ?? "");
  if (!/^[a-z0-9]{15,40}$/.test(id)) redirect("/admin");
  let error: string | null = null;
  try { await setPublicVisibility(actor, id, form.get("visible") === "1", String(form.get("publicTitle") ?? ""), String(form.get("publicArea") ?? "")); }
  catch (caught) { error = caught instanceof PublicMapApprovalError ? `map_${caught.code}` : "invalid"; }
  if (error) redirect(`/admin/cases/${id}?error=${error}`);
  revalidatePath("/map"); revalidatePath(`/admin/cases/${id}`); redirect(`/admin/cases/${id}`);
}
export async function followComplaintAction(form: FormData) {
  const actor = await requireRole(["CITIZEN", "VOLUNTEER"]);
  const id = String(form.get("complaintId") ?? "");
  if (!/^[a-z0-9]{15,40}$/.test(id)) redirect("/map");
  const cities = await activePublicCities();
  const complaint = await prisma.complaint.findFirst({ where: { id, publicVisible: true, ...publicComplaintCityFilter(null, cities.map(city => city.id)) }, select: { id: true } });
  if (!complaint) redirect("/map");
  const where = { userId_complaintId: { userId: actor.id, complaintId: id } };
  const existing = await prisma.complaintFollow.findUnique({ where });
  if (existing) await prisma.complaintFollow.delete({ where }); else await prisma.complaintFollow.create({ data: { userId: actor.id, complaintId: id } });
  revalidatePath(`/map/case/${id}`); redirect(`/map/case/${id}`);
}
