import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign out" };
export default async function LogoutPage() {
  const user = await getCurrentUser();
  return <section className="inner-page"><div className="page-shell"><div className="surface-card max-w-md"><h1 className="page-heading">Sign out</h1><p className="mt-4 text-sm leading-7 text-slate-600">{user ? "You are still signed in. Confirm below to end this session." : "You are already signed out."}</p>{user ? <form action={logoutAction} className="mt-6"><button type="submit" className="btn-dark cursor-pointer">Sign out securely</button></form> : <Link href="/login" className="btn-dark mt-6 inline-flex">Go to login</Link>}</div></div></section>;
}
