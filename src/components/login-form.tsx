"use client";

import { useEffect, useRef } from "react";
import { loginAction } from "@/app/actions/auth";

export function LoginForm({ next, failed }: { next: string; failed: boolean }) {
  const password = useRef<HTMLInputElement>(null);
  useEffect(() => { if (failed && password.current) password.current.value = ""; }, [failed]);
  return <form action={loginAction} className="mt-7 space-y-5"><input type="hidden" name="next" value={next} /><div><label className="field-label" htmlFor="email">Email address</label><input className="field-input" id="email" name="email" type="email" autoComplete="email" required /></div><div><label className="field-label" htmlFor="password">Password</label><input ref={password} className="field-input" id="password" name="password" type="password" autoComplete="current-password" required /></div><button className="btn-dark w-full cursor-pointer" type="submit">Log in</button></form>;
}
