"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { allowRequest } from "@/lib/rate-limit";
import { setComplaintSupport } from "@/lib/duplicates";
import { answerSupportRequest } from "@/lib/support";

export async function supportComplaintAction(form: FormData) {
  const actor = await requireRole(["CITIZEN", "VOLUNTEER"]);
  const id = String(form.get("complaintId") ?? "");
  if (!/^[a-z0-9]{15,40}$/.test(id)) redirect("/map");
  if (!allowRequest(`support:${actor.id}`, 20, 60_000)) redirect(`/map/case/${id}?supportError=rate`);
  try { await setComplaintSupport(actor, id, form.get("active") === "1"); }
  catch { redirect(`/map/case/${id}?supportError=invalid`); }
  revalidatePath(`/map/case/${id}`);
  redirect(`/map/case/${id}?supportSaved=1`);
}

export async function answerSupportAction(form: FormData) {
  const actor = await requireRole(["ADMIN"], "/admin/support");
  const id = String(form.get("id") ?? "");
  if (!/^[a-z0-9]{15,40}$/.test(id)) redirect("/admin/support?error=invalid");
  try { await answerSupportRequest(actor, id, String(form.get("response") ?? "")); }
  catch { redirect("/admin/support?error=invalid"); }
  revalidatePath("/admin/support");
  redirect("/admin/support");
}
