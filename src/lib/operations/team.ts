
import { brand } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { isKarachiDistrict } from "@/lib/karachi-areas";
import { audit, event, notify, OperationError, requireAdmin, text, type Actor } from "./common";

export async function updateTeamProfile(actor: Actor, applicationId: string, input: { district: string; serviceArea: string; availability: string; skills: string }) {
  requireAdmin(actor);
  if (!isKarachiDistrict(input.district)) throw new OperationError("invalid");
  const serviceArea = text(input.serviceArea, 2, 120), availability = text(input.availability, 3, 300), skills = text(input.skills, 3, 500);
  return prisma.$transaction(async tx => {
    const application = await tx.volunteerApplication.findUnique({ where: { id: applicationId } });
    if (!application) throw new OperationError("not_found");
    if (!["APPROVED", "INACTIVE"].includes(application.status)) throw new OperationError("conflict");
    const updated = await tx.volunteerApplication.update({ where: { id: applicationId }, data: { district: input.district, serviceArea, availability, skills } });
    await audit(tx, actor.id, "TEAM_PROFILE_UPDATED", "VolunteerApplication", applicationId, `${input.district}: ${serviceArea}`);
    await notify(tx, application.userId, "Team profile updated", `Your ${brand.name} team availability or service area was updated.`, "/volunteer");
    return updated;
  });
}

export async function setVolunteerActive(actor: Actor, applicationId: string, active: boolean) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const application = await tx.volunteerApplication.findUnique({ where: { id: applicationId }, include: { user: { select: { role: true } } } });
    if (!application) throw new OperationError("not_found");
    if (active ? application.status !== "INACTIVE" || application.user.role !== "CITIZEN" : application.status !== "APPROVED" || application.user.role !== "VOLUNTEER") throw new OperationError("conflict");
    let unassigned = 0;
    if (!active) {
      const tasks = await tx.task.findMany({ where: { assigneeId: application.userId, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, code: true, complaintId: true } });
      for (const task of tasks) {
        await tx.task.update({ where: { id: task.id }, data: { assigneeId: null } });
        await event(tx, { complaintId: task.complaintId, taskId: task.id, actorId: actor.id, kind: "TASK_UNASSIGNED", summary: `Task ${task.code} returned to the team queue`, visibility: "TASK" });
        await audit(tx, actor.id, "TASK_UNASSIGNED", "Task", task.id, "Volunteer deactivated");
      }
      unassigned = tasks.length;
    }
    await tx.volunteerApplication.update({ where: { id: applicationId }, data: { status: active ? "APPROVED" : "INACTIVE", reviewedById: actor.id, reviewedAt: new Date() } });
    await tx.user.update({ where: { id: application.userId }, data: { role: active ? "VOLUNTEER" : "CITIZEN" } });
    await audit(tx, actor.id, active ? "TEAM_MEMBER_REACTIVATED" : "TEAM_MEMBER_DEACTIVATED", "VolunteerApplication", applicationId, `Unassigned active tasks: ${unassigned}`);
    await notify(tx, application.userId, active ? "Volunteer access restored" : "Volunteer access paused", active ? "Your volunteer access is active again." : "Your volunteer access is paused. Current tasks returned to the team queue.", active ? "/volunteer" : "/dashboard");
    return { active, unassigned };
  });
}
