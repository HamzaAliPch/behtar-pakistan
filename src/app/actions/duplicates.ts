"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { reviewCaseLink } from "@/lib/duplicates";

export async function reviewCaseLinkAction(form: FormData) {
  const actor = await requireRole(["ADMIN"], "/admin/duplicates");
  const id = String(form.get("linkId") ?? "");
  const decision = String(form.get("decision") ?? "");
  if (!/^[a-z0-9]{15,40}$/.test(id) || !["LINKED", "REJECTED", "UNLINKED"].includes(decision)) redirect("/admin/duplicates?error=invalid");
  try { await reviewCaseLink(actor, id, decision as "LINKED" | "REJECTED" | "UNLINKED", String(form.get("reason") ?? "")); }
  catch { redirect("/admin/duplicates?error=invalid"); }
  revalidatePath("/admin/duplicates");
  redirect("/admin/duplicates?saved=1");
}
