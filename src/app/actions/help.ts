"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { saveHelpArticle } from "@/lib/help-articles";

export async function saveHelpArticleAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await saveHelpArticle(actor, { id: String(form.get("id") ?? "") || undefined, cityId: String(form.get("cityId") ?? "") || null, title: String(form.get("title") ?? ""), category: String(form.get("category") ?? ""), language: String(form.get("language") ?? ""), content: String(form.get("content") ?? ""), published: form.get("published") === "1" }); }
  catch { redirect("/admin/help?error=invalid"); }
  revalidatePath("/help"); revalidatePath("/admin/help"); redirect("/admin/help");
}
