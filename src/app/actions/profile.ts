"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { saveCitizenProfile, CitizenProfileError } from "@/lib/citizen-profile";

export async function saveCitizenProfileAction(form: FormData) {
  const user = await requireRole(["CITIZEN", "VOLUNTEER"], "/profile");
  try {
    await saveCitizenProfile(user, { name: String(form.get("name") ?? ""), phone: String(form.get("phone") ?? ""), citySlug: String(form.get("citySlug") ?? ""), smsOptIn: form.get("smsOptIn") === "on", whatsappOptIn: form.get("whatsappOptIn") === "on" });
  } catch (error) {
    if (error instanceof CitizenProfileError) redirect("/profile?error=invalid");
    throw error;
  }
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  redirect("/profile?saved=1");
}
