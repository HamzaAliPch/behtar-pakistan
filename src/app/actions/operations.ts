"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { OperationError } from "@/lib/operations/common";
import { applyToVolunteer, reviewVolunteer } from "@/lib/operations/volunteers";
import { addTaskNote, assignTask, createTask, updateTaskStatus } from "@/lib/operations/tasks";
import { createDepartment, createReferralDraft, updateDepartment, updateReferral } from "@/lib/operations/referrals";
import { addCaseNote, citizenResolution, transitionComplaint } from "@/lib/operations/cases";
import { provideCaseInformation, reviewComplaint, type ReviewDecision } from "@/lib/operations/action-center";
import { publishEvidence, uploadEvidence } from "@/lib/operations/evidence";

function value(form: FormData, key: string): string { return String(form.get(key) ?? ""); }
function errorPath(path: string, error: unknown): never {
  const code = error instanceof OperationError ? error.code : "unexpected";
  if (!(error instanceof OperationError)) console.error("Operations action failed", error);
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${code}`);
}
async function finish(work: () => Promise<unknown>, path: string): Promise<never> {
  try { await work(); } catch (error) { errorPath(path, error); }
  revalidatePath(path.split("?")[0]);
  redirect(path);
}

export async function applyVolunteerAction(form: FormData) {
  const actor = await requireRole(["CITIZEN"], "/volunteer/apply");
  return finish(() => applyToVolunteer(actor, { fullName: value(form, "fullName"), district: value(form, "district"), serviceArea: value(form, "serviceArea"), contactPhone: value(form, "contactPhone"), contactEmail: value(form, "contactEmail"), skills: value(form, "skills"), availability: value(form, "availability"), experience: value(form, "experience") }), "/volunteer/apply");
}
export async function reviewVolunteerAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return finish(() => reviewVolunteer(actor, value(form, "id"), value(form, "decision") as "APPROVED" | "REJECTED", value(form, "note")), "/admin/volunteers");
}
export async function createTaskAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const complaintId = value(form, "complaintId");
  const selectedAction = value(form, "type") === "PARTNER_NGO" ? "ngo" : "team";
  return finish(() => createTask(actor, { complaintId, assigneeId: value(form, "assigneeId"), partnerName: value(form, "partnerName"), type: value(form, "type"), priority: value(form, "priority"), deadline: value(form, "deadline"), instructions: value(form, "instructions") }), `/admin/cases/${encodeURIComponent(complaintId)}?action=${selectedAction}`);
}
export async function assignTaskAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return finish(() => assignTask(actor, value(form, "taskId"), value(form, "assigneeId"), value(form, "partnerName")), "/admin/tasks");
}
export async function taskStatusAction(form: FormData) {
  const actor = await requireRole(["ADMIN", "VOLUNTEER"]);
  const path = actor.role === "ADMIN" ? "/admin/tasks" : `/volunteer/tasks/${encodeURIComponent(value(form, "taskId"))}`;
  return finish(() => updateTaskStatus(actor, value(form, "taskId"), value(form, "status"), value(form, "note")), path);
}
export async function taskNoteAction(form: FormData) {
  const actor = await requireRole(["ADMIN", "VOLUNTEER"]);
  const path = actor.role === "ADMIN" ? "/admin/tasks" : `/volunteer/tasks/${encodeURIComponent(value(form, "taskId"))}`;
  return finish(() => addTaskNote(actor, value(form, "taskId"), value(form, "note")), path);
}
export async function createDepartmentAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return finish(() => createDepartment(actor, { name: value(form, "name"), jurisdiction: value(form, "jurisdiction"), serviceAreas: value(form, "serviceAreas"), contactDetails: value(form, "contactDetails") }), "/admin/departments");
}
export async function updateDepartmentAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return finish(() => updateDepartment(actor, value(form, "departmentId"), { jurisdiction: value(form, "jurisdiction"), serviceAreas: value(form, "serviceAreas"), contactDetails: value(form, "contactDetails"), active: value(form, "active") === "1" }), "/admin/departments");
}
export async function createReferralDraftAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const complaintId = value(form, "complaintId");
  return finish(() => createReferralDraft(actor, complaintId, value(form, "departmentId")), `/admin/cases/${encodeURIComponent(complaintId)}`);
}
export async function updateReferralAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  return finish(() => updateReferral(actor, value(form, "referralId"), { status: value(form, "status"), submissionMethod: value(form, "submissionMethod"), submittedAt: value(form, "submittedAt"), officialReference: value(form, "officialReference"), followUpAt: value(form, "followUpAt"), response: value(form, "response") }), "/admin/referrals");
}
export async function complaintStatusAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const complaintId = value(form, "complaintId");
  return finish(() => transitionComplaint(actor, complaintId, value(form, "status"), value(form, "reason")), `/admin/cases/${encodeURIComponent(complaintId)}`);
}
export async function guidedReviewAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const complaintId = value(form, "complaintId");
  return finish(() => reviewComplaint(actor, complaintId, value(form, "decision") as ReviewDecision, value(form, "reason")), `/admin/cases/${encodeURIComponent(complaintId)}`);
}
export async function citizenCaseInformationAction(form: FormData) {
  const actor = await requireRole(["CITIZEN", "VOLUNTEER", "ADMIN", "CITY_MANAGER"]);
  const complaintId = value(form, "complaintId");
  const reference = value(form, "reference");
  return finish(() => provideCaseInformation(actor, complaintId, value(form, "answer")), `/track?ref=${encodeURIComponent(reference)}`);
}
export async function citizenResolutionAction(form: FormData) {
  const actor = await requireRole(["CITIZEN", "VOLUNTEER", "ADMIN", "CITY_MANAGER"]);
  const complaintId = value(form, "complaintId");
  const reference = value(form, "reference");
  const decision = value(form, "decision") as "CONFIRM" | "DISPUTE" | "REOPEN";
  return finish(() => citizenResolution(actor, complaintId, decision, value(form, "reason")), `/track?ref=${encodeURIComponent(reference)}&result=${decision.toLowerCase()}`);
}
export async function caseNoteAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const complaintId = value(form, "complaintId");
  return finish(() => addCaseNote(actor, complaintId, value(form, "note")), `/admin/cases/${encodeURIComponent(complaintId)}`);
}
export async function uploadEvidenceAction(form: FormData) {
  const actor = await requireRole(["ADMIN", "VOLUNTEER"]);
  const complaintId = value(form, "complaintId");
  const taskId = value(form, "taskId");
  const path = actor.role === "ADMIN" ? `/admin/cases/${encodeURIComponent(complaintId)}` : `/volunteer/tasks/${encodeURIComponent(taskId)}`;
  const file = form.get("file");
  return finish(() => uploadEvidence(actor, { complaintId, taskId: taskId || undefined, ngoProjectId: value(form, "ngoProjectId"), stage: value(form, "stage"), visibility: value(form, "visibility"), note: value(form, "note"), file: file as File }), path);
}
export async function publishEvidenceAction(form: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const complaintId = value(form, "complaintId");
  return finish(() => publishEvidence(actor, value(form, "evidenceId")), `/admin/cases/${encodeURIComponent(complaintId)}`);
}
export async function markNotificationReadAction(form: FormData) {
  const user = await requireRole(["ADMIN", "CITY_MANAGER", "CITIZEN", "VOLUNTEER"]);
  await prisma.notification.updateMany({ where: { id: value(form, "notificationId"), userId: user.id }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
  redirect("/notifications");
}
