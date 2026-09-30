import { prisma } from "@/lib/prisma";
import { normalizeEmail, validEmail } from "@/lib/auth/validation";
import { Actor, audit, notify, notifyAdmins, OperationError, optionalText, requireAdmin, text } from "./common";

export async function applyToVolunteer(actor: Actor, input: { fullName: string; district: string; serviceArea: string; contactPhone: string; contactEmail: string; skills: string; availability: string; experience?: string }) {
  if (actor.role !== "CITIZEN") throw new OperationError("forbidden");
  const email = normalizeEmail(input.contactEmail);
  if (!validEmail(email) || !/^[+\d()\s-]{7,25}$/.test(input.contactPhone.trim())) throw new OperationError("invalid");
  const data = {
    fullName: text(input.fullName, 2, 80), district: text(input.district, 2, 80),
    serviceArea: text(input.serviceArea, 2, 120), contactPhone: input.contactPhone.trim(),
    contactEmail: email, skills: text(input.skills, 3, 500), availability: text(input.availability, 3, 300),
    experience: optionalText(input.experience, 1000),
  };
  return prisma.$transaction(async tx => {
    const existing = await tx.volunteerApplication.findUnique({ where: { userId: actor.id } });
    if (existing && existing.status !== "REJECTED") throw new OperationError("conflict");
    const application = existing
      ? await tx.volunteerApplication.update({ where: { id: existing.id }, data: { ...data, status: "PENDING", reviewNote: null, reviewedById: null, reviewedAt: null } })
      : await tx.volunteerApplication.create({ data: { ...data, userId: actor.id } });
    await notifyAdmins(tx, "Volunteer application", "A citizen has applied to volunteer.", "/admin/volunteers");
    return application;
  });
}

export async function reviewVolunteer(actor: Actor, applicationId: string, decision: "APPROVED" | "REJECTED", note?: string) {
  requireAdmin(actor);
  if (!applicationId || !["APPROVED", "REJECTED"].includes(decision)) throw new OperationError("invalid");
  const reviewNote = optionalText(note, 1000);
  return prisma.$transaction(async tx => {
    const application = await tx.volunteerApplication.findUnique({ where: { id: applicationId } });
    if (!application) throw new OperationError("not_found");
    if (application.status !== "PENDING") throw new OperationError("conflict");
    const applicant = await tx.user.findUnique({ where: { id: application.userId }, select: { role: true } });
    if (applicant?.role !== "CITIZEN") throw new OperationError("conflict");
    await tx.volunteerApplication.update({ where: { id: applicationId }, data: { status: decision, reviewNote, reviewedById: actor.id, reviewedAt: new Date() } });
    if (decision === "APPROVED") await tx.user.update({ where: { id: application.userId }, data: { role: "VOLUNTEER" } });
    await audit(tx, actor.id, `VOLUNTEER_${decision}`, "VolunteerApplication", applicationId, reviewNote ?? undefined);
    await notify(tx, application.userId, "Volunteer application update", decision === "APPROVED" ? "Your volunteer application was approved." : "Your volunteer application was not approved.", decision === "APPROVED" ? "/volunteer" : "/volunteer/apply");
  });
}
