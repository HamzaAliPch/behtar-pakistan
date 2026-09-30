"use client";

import { useFormStatus } from "react-dom";

export function ResolutionDecisionButtons() {
  const { pending, data } = useFormStatus();
  const choice = data?.get("decision");
  return <div className="flex flex-wrap gap-3">
    <button type="submit" name="decision" value="CONFIRM" disabled={pending} className="btn-dark cursor-pointer disabled:opacity-60">{pending && choice === "CONFIRM" ? "Recording confirmation…" : "Confirm resolution"}</button>
    <button type="submit" name="decision" value="DISPUTE" disabled={pending} className="min-h-12 cursor-pointer rounded-xl border border-amber-300 px-5 text-sm font-bold text-amber-800 disabled:opacity-60">{pending && choice === "DISPUTE" ? "Recording dispute…" : "Dispute with reason"}</button>
  </div>;
}
