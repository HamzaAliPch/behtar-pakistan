"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { approveStoryContent, approveStoryEvidence, approveStoryPublicDetails, moderateStory } from "@/lib/operations/completed-work";
import { OperationError } from "@/lib/operations/common";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
async function run(complaintId: string, work: () => Promise<unknown>): Promise<never> {
  const target = `/admin/projects/${encodeURIComponent(complaintId)}`;
  try { await work(); }
  catch (error) { if (!(error instanceof OperationError)) console.error("Completed work action failed", error); redirect(`${target}?error=${error instanceof OperationError ? error.code : "unexpected"}`); }
  revalidatePath("/projects"); revalidatePath("/admin/projects"); revalidatePath(target); redirect(target);
}

export async function approveStoryContentAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const complaintId = value(form, "complaintId");
  return run(complaintId, () => approveStoryContent(actor, complaintId, value(form, "problemSummary"), value(form, "workSummary")));
}
export type StorySummaryState = { approvedAt: string | null; problem: string; work: string; error: string | null };
export async function approveStoryContentState(_previous: StorySummaryState, form: FormData): Promise<StorySummaryState> {
  const actor = await requireRole(["ADMIN"]);
  const complaintId = value(form, "complaintId");
  const problem = value(form, "problemSummary"), work = value(form, "workSummary");
  try {
    const story = await approveStoryContent(actor, complaintId, problem, work);
    revalidatePath("/projects"); revalidatePath("/admin/projects"); revalidatePath(`/admin/projects/${encodeURIComponent(complaintId)}`);
    return { approvedAt: story?.contentApprovedAt?.toISOString() ?? new Date().toISOString(), problem, work, error: null };
  } catch (error) {
    if (!(error instanceof OperationError)) console.error("Story summary approval failed", error);
    return { approvedAt: null, problem, work, error: error instanceof OperationError && error.code === "invalid" ? "Use 20–1,000 characters in each summary and remove names, contact details or precise addresses." : "The summaries could not be approved. Please try again." };
  }
}
export async function approveStoryPublicDetailsAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const complaintId = value(form, "complaintId");
  return run(complaintId, () => approveStoryPublicDetails(actor, complaintId, value(form, "publicTitle"), value(form, "publicArea")));
}
export async function approveStoryEvidenceAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(value(form, "complaintId"), () => approveStoryEvidence(actor, value(form, "evidenceId"), value(form, "approved") === "1", value(form, "contentChecked") === "on"));
}
export async function moderateStoryAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const complaintId = value(form, "complaintId");
  return run(complaintId, () => moderateStory(actor, complaintId, value(form, "withdraw") === "1"));
}
