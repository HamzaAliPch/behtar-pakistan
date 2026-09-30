"use server";

import { redirect } from "next/navigation";
import { authenticate, AuthError, registerCitizen } from "@/lib/auth/credentials";
import { roleHome } from "@/lib/auth/permissions";
import { safeReturnPath } from "@/lib/auth/validation";
import { createSession, destroySession } from "@/lib/auth/session";

export async function registerAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) redirect("/register?error=match");
  let user;
  try {
    user = await registerCitizen({ name, email, password, phone: String(formData.get("phone") ?? ""), citySlug: String(formData.get("citySlug") ?? "") });
  } catch (error) {
    if (error instanceof AuthError) redirect(`/register?error=${error.code}`);
    throw error;
  }
  await createSession(user.id);
  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeReturnPath(String(formData.get("next") ?? ""));
  let user;
  try {
    user = await authenticate(email, password);
  } catch (error) {
    if (error instanceof AuthError) redirect(`/login?error=${error.code}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    throw error;
  }
  await createSession(user.id);
  const allowedNext = user.role === "ADMIN" ? ["/admin"] : user.role === "CITY_MANAGER" ? ["/city"] : user.role === "VOLUNTEER" ? ["/volunteer"] : ["/dashboard", "/report"];
  redirect(next && allowedNext.includes(next) ? next : roleHome(user.role));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login?loggedOut=1");
}
