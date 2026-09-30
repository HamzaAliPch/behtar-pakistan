"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { managerCity } from "@/lib/operations/city-access";
import { OperationError } from "@/lib/operations/common";
import { reviewComplaint } from "@/lib/operations/action-center";
import { addCaseNote, transitionComplaint } from "@/lib/operations/cases";
import { createTask, updateTaskStatus } from "@/lib/operations/tasks";
import { createReferralDraft, updateReferral } from "@/lib/operations/referrals";
import { publishEvidence, uploadEvidence } from "@/lib/operations/evidence";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");

export async function cityCaseAction(form: FormData) {
  const actor = await requireRole(["CITY_MANAGER"], "/city");
  const slug = value(form, "citySlug"), complaintId = value(form, "complaintId");
  if (!/^[a-z-]{2,40}$/.test(slug) || !/^[a-z0-9]{10,50}$/.test(complaintId)) redirect("/city");
  const path = `/city/${slug}/cases/${complaintId}`;
  try {
    const city = await managerCity(actor, slug);
    const complaint = await prisma.complaint.findFirst({ where: { id: complaintId, cityId: city.id }, select: { id: true } });
    if (!complaint) throw new OperationError("not_found");
    const operation = value(form, "operation");
    if (operation === "review") await reviewComplaint(actor, complaintId, value(form, "decision") as "VERIFY" | "REQUEST_INFO" | "REJECT", value(form, "reason"));
    else if (operation === "status") await transitionComplaint(actor, complaintId, value(form, "status"), value(form, "reason"));
    else if (operation === "note") await addCaseNote(actor, complaintId, value(form, "note"));
    else if (operation === "task") await createTask(actor, { complaintId, assigneeId: value(form, "assigneeId"), type: value(form, "type"), priority: value(form, "priority"), deadline: value(form, "deadline"), instructions: value(form, "instructions") });
    else if (operation === "taskStatus") {
      const task = await prisma.task.findFirst({ where: { id: value(form, "taskId"), complaintId, complaint: { cityId: city.id } }, select: { id: true } });
      if (!task) throw new OperationError("not_found");
      await updateTaskStatus(actor, task.id, value(form, "status"), value(form, "note"));
    } else if (operation === "referral") await createReferralDraft(actor, complaintId, value(form, "departmentId"));
    else if (operation === "referralStatus") {
      const referral = await prisma.referral.findFirst({ where: { id: value(form, "referralId"), complaintId, complaint: { cityId: city.id } }, select: { id: true } });
      if (!referral) throw new OperationError("not_found");
      await updateReferral(actor, referral.id, { status: value(form, "status"), submissionMethod: value(form, "submissionMethod"), submittedAt: value(form, "submittedAt"), officialReference: value(form, "officialReference"), followUpAt: value(form, "followUpAt"), response: value(form, "response") });
    } else if (operation === "evidence") await uploadEvidence(actor, { complaintId, stage: value(form, "stage"), visibility: value(form, "visibility"), note: value(form, "note"), file: form.get("file") as File });
    else if (operation === "shareEvidence") {
      const evidence = await prisma.evidence.findFirst({ where: { id: value(form, "evidenceId"), complaintId, complaint: { cityId: city.id } }, select: { id: true } });
      if (!evidence) throw new OperationError("not_found");
      await publishEvidence(actor, evidence.id);
    } else throw new OperationError("invalid");
  } catch (error) {
    if (!(error instanceof OperationError)) console.error("City case action failed", error);
    const code = error instanceof OperationError ? error.code : "invalid";
    redirect(`${path}?error=${code}`);
  }
  revalidatePath(path); revalidatePath(`/city/${slug}`);
  redirect(path);
}
