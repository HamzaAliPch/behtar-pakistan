import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { registerAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(roleHome(user.role));
  const { error } = await searchParams;
  const cities = await prisma.city.findMany({ select: { slug: true, name: true, status: true }, orderBy: { name: "asc" } });
  const message = error === "match" ? "Passwords do not match." : error === "duplicate" ? "This email is already registered. Try logging in." : "Enter a name, valid email, and a password of 12–128 characters.";
  return <section className="inner-page"><div className="page-shell flex items-center justify-center"><div className="surface-card w-full max-w-md"><div className="step-icon"><UserPlus size={24} /></div><p className="section-kicker mt-6">Join your community</p><h1 className="page-heading mt-2">Create an account</h1><p className="page-subtitle">Register as a citizen to submit and manage your own reports.</p>
    {error && <p className="form-error mt-6" role="alert">{message}</p>}
    <form action={registerAction} className="mt-7 space-y-5"><div><label className="field-label" htmlFor="name">Full name</label><input className="field-input" id="name" name="name" autoComplete="name" minLength={2} maxLength={80} required /></div><div><label className="field-label" htmlFor="email">Email address</label><input className="field-input" id="email" name="email" type="email" autoComplete="email" required /></div><div><label className="field-label" htmlFor="phone">Phone (optional, private)</label><input className="field-input" id="phone" name="phone" type="tel" autoComplete="tel" maxLength={25} placeholder="Only if you want to share it" /></div><div><label className="field-label" htmlFor="citySlug">Your city (optional)</label><select className="field-input" id="citySlug" name="citySlug" defaultValue=""><option value="">Prefer not to say</option>{cities.map(city => <option key={city.slug} value={city.slug}>{city.name}{city.status === "ACTIVE" ? "" : " · Coming Soon"}</option>)}</select><p className="mt-1 text-xs text-slate-500">Karachi is the only city accepting reports right now.</p></div><div><label className="field-label" htmlFor="password">Password</label><input className="field-input" id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /><p className="mt-1 text-xs text-slate-500">Use at least 12 characters.</p></div><div><label className="field-label" htmlFor="confirm">Confirm password</label><input className="field-input" id="confirm" name="confirm" type="password" autoComplete="new-password" required /></div><button className="btn-dark w-full cursor-pointer" type="submit">Create citizen account</button></form>
    <p className="mt-6 text-center text-sm text-slate-600">Already registered? <Link href="/login" className="font-bold text-emerald-700 underline">Log in</Link></p>
  </div></div></section>;
}
