
import { brand } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/permissions";
import { safeReturnPath } from "@/lib/auth/validation";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; loggedOut?: string; reset?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(roleHome(user.role));
  const { error, next, loggedOut, reset } = await searchParams;
  const returnPath = safeReturnPath(next);
  return <section className="inner-page"><div className="page-shell flex min-h-[68vh] items-center justify-center"><div className="surface-card w-full max-w-md"><div className="step-icon"><LockKeyhole size={24} /></div><p className="section-kicker mt-6">Welcome back</p><h1 className="page-heading mt-2">Log in</h1><p className="page-subtitle">Access your reports and follow their progress.</p>
    {error && <p className="form-error mt-6" role="alert">{error === "locked" ? "Too many attempts. Please try again in 15 minutes." : "Invalid email or password."}</p>}
    {loggedOut && <p className="mt-6 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">You have been logged out.</p>}{reset && <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Password updated. Please log in again.</p>}
    <LoginForm next={returnPath ?? ""} failed={Boolean(error)} /><Link href="/forgot-password" className="mt-3 inline-block text-sm font-bold text-emerald-700 underline">Forgot your password?</Link>
    <p className="mt-6 text-center text-sm text-slate-600">New to {brand.name}? <Link href="/register" className="font-bold text-emerald-700 underline">Create an account</Link></p>
  </div></div></section>;
}
