"use client";

import { useActionState, useState } from "react";
import { approveStoryContentState, type StorySummaryState } from "@/app/actions/completed-work";

export function StorySummaryForm({ complaintId, initialProblem, initialWork, approvedAt }: { complaintId: string; initialProblem: string; initialWork: string; approvedAt: string | null }) {
  const [state, action, pending] = useActionState<StorySummaryState, FormData>(approveStoryContentState, { approvedAt, problem: initialProblem, work: initialWork, error: null });
  const [problem, setProblem] = useState(initialProblem);
  const [work, setWork] = useState(initialWork);
  const approved = Boolean(state.approvedAt) && state.problem === problem && state.work === work;
  return <form action={action} className="mt-4 space-y-3">
    <input type="hidden" name="complaintId" value={complaintId} />
    <label className="block"><span className="field-label">Public problem summary</span><textarea name="problemSummary" value={problem} onChange={event => setProblem(event.target.value)} minLength={20} maxLength={1000} className="field-input min-h-24" required /></label>
    <label className="block"><span className="field-label">Work actually performed</span><textarea name="workSummary" value={work} onChange={event => setWork(event.target.value)} minLength={20} maxLength={1000} className="field-input min-h-24" required /></label>
    {state.error && <p role="alert" className="form-error">{state.error} Your draft remains in the form.</p>}
    <p role="status" aria-live="polite" className={`rounded-lg p-3 text-sm font-semibold ${approved ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{approved ? "Summaries approved and saved." : state.approvedAt ? "These edits require reapproval before they can appear publicly." : "Summaries are awaiting admin approval."}</p>
    <button type="submit" disabled={pending} className="btn-dark cursor-pointer disabled:opacity-60">{pending ? "Approving…" : approved ? "Approve public summaries again" : "Approve public summaries"}</button>
  </form>;
}
