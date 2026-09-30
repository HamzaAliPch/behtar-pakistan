"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { allocateFinanceCity, type FinanceCityResource } from "@/lib/finance-city";

export async function allocateFinanceCityAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  try { await allocateFinanceCity(actor, String(form.get("kind")) as FinanceCityResource, String(form.get("id") ?? ""), String(form.get("cityId") ?? "")); }
  catch { redirect("/admin/finance/allocations?error=invalid"); }
  revalidatePath("/funds"); revalidatePath("/admin/finance"); redirect("/admin/finance/allocations");
}
