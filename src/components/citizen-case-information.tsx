
import { brand } from "@/lib/brand";
import { citizenCaseInformationAction } from "@/app/actions/operations";

export function CitizenCaseInformation({ complaintId, reference }: { complaintId: string; reference: string }) {
  return <div className="surface-card"><h2 className="text-xl font-bold">More information needed</h2><p className="mt-2 text-sm leading-6 text-slate-600">Read the team&apos;s request in the activity timeline, then reply here. Only you and the {brand.name} team can see your answer.</p><form action={citizenCaseInformationAction} className="mt-4 space-y-3"><input type="hidden" name="complaintId" value={complaintId} /><input type="hidden" name="reference" value={reference} /><label className="field-label" htmlFor="case-answer">Your answer</label><textarea id="case-answer" name="answer" className="field-input min-h-28" minLength={10} maxLength={2000} required /><button type="submit" className="btn-dark cursor-pointer">Send information to the team</button></form></div>;
}
