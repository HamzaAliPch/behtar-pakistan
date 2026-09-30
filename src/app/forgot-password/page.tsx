import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/password-recovery";
import { passwordRecoveryAvailable } from "@/lib/auth/password-recovery";

export const metadata: Metadata = { title: "Password recovery", robots: { index: false, follow: false } };
export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ requested?: string }> }) {
  const { requested } = await searchParams;
  const available = passwordRecoveryAvailable();
  return <section className="inner-page"><div className="page-shell"><div className="surface-card mx-auto max-w-lg"><h1 className="page-heading">Reset your password</h1>
    {available ? <><p className="mt-3 text-sm text-slate-600">Enter your citizen account email. If it is eligible, we will request a single-use reset link. The link expires after 20 minutes.</p>{requested && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm">If an eligible account exists and delivery succeeds, you may receive a reset message shortly. Check your inbox.</p>}<form action={requestPasswordResetAction} className="mt-5 space-y-3"><label htmlFor="reset-email" className="field-label">Email address</label><input id="reset-email" name="email" type="email" autoComplete="email" maxLength={254} required className="field-input" /><button className="btn-dark cursor-pointer">Request reset link</button></form></> : <p className="mt-4 text-sm text-slate-700">Self-service password recovery is temporarily unavailable because secure email delivery is not configured. Please <Link href="/help" className="font-bold text-emerald-700 underline">contact human support</Link> for account assistance. Never send your password to support.</p>}
    <Link href="/login" className="mt-6 inline-block text-sm font-bold text-emerald-700 underline">Back to login</Link>
  </div></div></section>;
}
