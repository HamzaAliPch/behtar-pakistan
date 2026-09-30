"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { OperationError } from "@/lib/operations/common";
import { addNgoMilestone, completeNgoMilestone, createNgo, createNgoProject, linkNgoEvidence, linkNgoTask, recordNgoContribution, setNgoEvidencePublic, setNgoMilestonePublic, setNgoProjectPublic, transitionNgo, transitionNgoProject, updateNgo, verifyNgoContribution } from "@/lib/operations/ngos";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
async function run(path: string, work: () => Promise<unknown>): Promise<never> {
  try { await work(); }
  catch (error) { if (!(error instanceof OperationError)) console.error("NGO action failed", error); redirect(`${path}?error=${error instanceof OperationError ? error.code : "unexpected"}`); }
  revalidatePath(path); revalidatePath("/admin/ngos"); redirect(path);
}
const ngoPath = (form: FormData) => `/admin/ngos/${encodeURIComponent(value(form, "ngoId"))}`;

export async function createNgoAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run("/admin/ngos", () => createNgo(actor, { name: value(form, "name"), contactPerson: value(form, "contactPerson"), contactEmail: value(form, "contactEmail"), contactPhone: value(form, "contactPhone"), publicContact: value(form, "publicContact"), serviceAreas: value(form, "serviceAreas"), expertise: value(form, "expertise") }));
}
export async function updateNgoAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => updateNgo(actor, value(form, "ngoId"), { contactPerson: value(form, "contactPerson"), contactEmail: value(form, "contactEmail"), contactPhone: value(form, "contactPhone"), publicContact: value(form, "publicContact"), serviceAreas: value(form, "serviceAreas"), expertise: value(form, "expertise") }));
}
export async function transitionNgoAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => transitionNgo(actor, value(form, "ngoId"), value(form, "status"), value(form, "agreementNote"), value(form, "agreementConfirmed") === "on"));
}
export async function createNgoProjectAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => createNgoProject(actor, { ngoId: value(form, "ngoId"), title: value(form, "title"), description: value(form, "description"), complaintId: value(form, "complaintId"), campaignId: value(form, "campaignId") }));
}
export async function transitionNgoProjectAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => transitionNgoProject(actor, value(form, "projectId"), value(form, "status"), value(form, "publicSummary"), value(form, "publicApproved") === "on"));
}
export async function addNgoMilestoneAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => addNgoMilestone(actor, value(form, "projectId"), value(form, "title"), value(form, "dueAt")));
}
export async function completeNgoMilestoneAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => completeNgoMilestone(actor, value(form, "milestoneId"), value(form, "outcome")));
}
export async function linkNgoTaskAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => linkNgoTask(actor, value(form, "projectId"), value(form, "taskId")));
}
export async function linkNgoEvidenceAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => linkNgoEvidence(actor, value(form, "projectId"), value(form, "evidenceId")));
}
export async function recordNgoContributionAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => recordNgoContribution(actor, value(form, "projectId"), { kind: value(form, "kind"), amount: value(form, "amountPkr"), description: value(form, "description"), documentation: value(form, "documentation") }));
}
export async function verifyNgoContributionAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => verifyNgoContribution(actor, value(form, "contributionId")));
}
export async function setNgoProjectPublicAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => setNgoProjectPublic(actor, value(form, "projectId"), value(form, "approved") === "1", value(form, "publicSummary")));
}
export async function setNgoMilestonePublicAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => setNgoMilestonePublic(actor, value(form, "milestoneId"), value(form, "approved") === "1"));
}
export async function setNgoEvidencePublicAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return run(ngoPath(form), () => setNgoEvidencePublic(actor, value(form, "evidenceId"), value(form, "approved") === "1", value(form, "contentChecked") === "on"));
}
