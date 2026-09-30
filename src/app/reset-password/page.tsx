import type { Metadata } from "next";
import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/password-recovery";
import { passwordRecoveryAvailable } from "@/lib/auth/password-recovery";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const available = passwordRecoveryAvailable();
  const validShape = typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
  return <section className="inner-page"><div className="page-shell"><div className="surface-card mx-auto max-w-lg"><h1 className="page-heading">Set a new password</h1>
    {!available || !validShape ? <p role="alert" className="mt-4 text-sm text-slate-700">This reset link is unavailable or invalid. <Link href="/forgot-password" className="font-bold text-emerald-700 underline">Request a new link</Link> or contact human support.</p> : <><p className="mt-3 text-sm text-slate-600">Choose a new password of 12–128 characters. This link works once.</p>{error && <p role="alert" className="form-error mt-4">{error === "match" ? "Passwords do not match." : "The link has expired or was already used. Request a new one."}</p>}<form action={resetPasswordAction} className="mt-5 space-y-3"><input type="hidden" name="token" value={token} /><label className="field-label" htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="field-input" /><label className="field-label" htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="field-input" /><button className="btn-dark cursor-pointer">Save new password</button></form></>}
  </div></div></section>;
}
