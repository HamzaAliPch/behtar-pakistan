"use server";

import { redirect } from "next/navigation";
import { consumePasswordReset, requestPasswordReset } from "@/lib/auth/password-recovery";

export async function requestPasswordResetAction(form: FormData) {
  await requestPasswordReset(String(form.get("email") ?? "").slice(0, 254));
  redirect("/forgot-password?requested=1");
}

export async function resetPasswordAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password !== confirm) redirect(`/reset-password?token=${encodeURIComponent(token)}&error=match`);
  const success = await consumePasswordReset(token, password);
  if (!success) redirect("/reset-password?error=invalid");
  redirect("/login?reset=1");
}
