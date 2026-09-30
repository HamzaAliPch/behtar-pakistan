import { prisma } from "@/lib/prisma";
import { canTransitionTask, isOneOf, priorities, taskTypes, taskStatuses } from "@/lib/workflow";
import { Actor, audit, code, event, notify, notifyAdmins, OperationError, optionalText, text, Tx } from "./common";
import { assertCityAccess, requireCaseOperator } from "./city-access";
import { parseTaskDeadline } from "./task-deadline";
import { queueCitizenNotice } from "@/lib/notifications";
import { recordSlaMilestone } from "@/lib/sla";

async function validAssignee(tx: Tx, userId: string | null, actor: Actor, cityId: string | null) {
  if (!userId) return null;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, volunteerApplication: { select: { status: true, cityId: true } }, cityMemberships: { select: { cityId: true } } } });
  if (!user || (user.role !== "ADMIN" && user.role !== "CITY_MANAGER" && !(user.role === "VOLUNTEER" && user.volunteerApplication?.status === "APPROVED"))) throw new OperationError("invalid");
  if (actor.role === "CITY_MANAGER" && (!cityId || (user.role === "VOLUNTEER" ? user.volunteerApplication?.cityId !== cityId : user.role !== "CITY_MANAGER" || !user.cityMemberships.some(item => item.cityId === cityId)))) throw new OperationError("forbidden");
  return user;
}

export async function createTask(actor: Actor, input: { complaintId: string; assigneeId?: string; partnerName?: string; type: string; priority: string; deadline: string; instructions: string }) {
  requireCaseOperator(actor);
  if (!isOneOf(input.type, taskTypes) || !isOneOf(input.priority, priorities)) throw new OperationError("invalid");
  const deadline = parseTaskDeadline(input.deadline);
  if (!deadline) throw new OperationError("invalid");
  const instructions = text(input.instructions, 10, 3000);
  const assigneeId = optionalText(input.assigneeId, 100);
  const partnerName = optionalText(input.partnerName, 120);
  return prisma.$transaction(async tx => {
    const complaint = await tx.complaint.findUnique({ where: { id: input.complaintId } });
    if (!complaint) throw new OperationError("not_found");
    await assertCityAccess(tx, actor, complaint.cityId);
    const verified = await tx.caseEvent.count({ where: { complaintId: complaint.id, kind: "VERIFIED" } });
    if (!verified) throw new OperationError("conflict");
    const assignee = await validAssignee(tx, assigneeId, actor, complaint.cityId);
    const task = await tx.task.create({ data: { code: code("TASK"), complaintId: complaint.id, assigneeId, partnerName, type: input.type, priority: input.priority, deadline, instructions, status: assigneeId ? "ASSIGNED" : "TODO", createdById: actor.id } });
    await event(tx, { complaintId: complaint.id, taskId: task.id, actorId: actor.id, kind: "TASK_CREATED", summary: `Task ${task.code} created`, visibility: "OWNER" });
    await audit(tx, actor.id, "TASK_CREATED", "Task", task.id, task.code);
    await notify(tx, assigneeId, "New task assigned", `Task ${task.code} is assigned to you.`, assignee?.role === "ADMIN" ? "/admin/tasks" : assignee?.role === "CITY_MANAGER" ? "/city" : "/volunteer");
    if (assigneeId && complaint.status === "VERIFIED") {
      await tx.complaint.update({ where: { id: complaint.id }, data: { status: "ASSIGNED" } });
      const assignedEvent = await event(tx, { complaintId: complaint.id, actorId: actor.id, kind: "COMPLAINT_STATUS", summary: "Complaint assigned for action", visibility: "OWNER" });
      await recordSlaMilestone(tx, complaint.id, "ASSIGNED", assignedEvent.createdAt);
      await queueCitizenNotice(tx, { userId: complaint.userId, complaintId: complaint.id, reference: complaint.reference, kind: "TASK_PROGRESS", title: "Case assigned for action", eventKey: assignedEvent.id });
    }
    return task;
  });
}

export async function assignTask(actor: Actor, taskId: string, assigneeId: string | null, partnerName?: string) {
  requireCaseOperator(actor);
  const cleanAssignee = optionalText(assigneeId, 100);
  const cleanPartner = optionalText(partnerName, 120);
  return prisma.$transaction(async tx => {
    const task = await tx.task.findUnique({ where: { id: taskId }, include: { complaint: true } });
    if (!task) throw new OperationError("not_found");
    await assertCityAccess(tx, actor, task.complaint.cityId);
    if (["COMPLETED", "CANCELLED"].includes(task.status)) throw new OperationError("conflict");
    const assignee = await validAssignee(tx, cleanAssignee, actor, task.complaint.cityId);
    const updated = await tx.task.update({ where: { id: task.id }, data: { assigneeId: cleanAssignee, partnerName: cleanPartner, status: cleanAssignee && task.status === "TODO" ? "ASSIGNED" : task.status } });
    await event(tx, { complaintId: task.complaintId, taskId: task.id, actorId: actor.id, kind: "TASK_ASSIGNED", summary: cleanAssignee ? `Task ${task.code} assigned` : `Task ${task.code} unassigned`, visibility: "OWNER" });
    await audit(tx, actor.id, "TASK_ASSIGNED", "Task", task.id, cleanAssignee ?? "unassigned");
    await notify(tx, cleanAssignee, "Task assignment", `Task ${task.code} is assigned to you.`, assignee?.role === "ADMIN" ? "/admin/tasks" : assignee?.role === "CITY_MANAGER" ? "/city" : "/volunteer");
    if (cleanAssignee && task.complaint.status === "VERIFIED") {
      await tx.complaint.update({ where: { id: task.complaintId }, data: { status: "ASSIGNED" } });
      const assignedEvent = await event(tx, { complaintId: task.complaintId, actorId: actor.id, kind: "COMPLAINT_STATUS", summary: "Complaint assigned for action", visibility: "OWNER" });
      await recordSlaMilestone(tx, task.complaintId, "ASSIGNED", assignedEvent.createdAt);
      await queueCitizenNotice(tx, { userId: task.complaint.userId, complaintId: task.complaintId, reference: task.complaint.reference, kind: "TASK_PROGRESS", title: "Case assigned for action", eventKey: assignedEvent.id });
    }
    return updated;
  });
}

export async function updateTaskStatus(actor: Actor, taskId: string, nextStatus: string, note?: string) {
  if (!isOneOf(nextStatus, taskStatuses)) throw new OperationError("invalid");
  const cleanNote = optionalText(note, 1000);
  return prisma.$transaction(async tx => {
    const task = await tx.task.findUnique({ where: { id: taskId }, include: { complaint: { select: { cityId: true } } } });
    if (!task) throw new OperationError("not_found");
    const admin = actor.role === "ADMIN" || actor.role === "CITY_MANAGER";
    if (admin) await assertCityAccess(tx, actor, task.complaint.cityId);
    if (!admin) {
      const approval = actor.role === "VOLUNTEER" ? await tx.volunteerApplication.findUnique({ where: { userId: actor.id }, select: { status: true } }) : null;
      if (task.assigneeId !== actor.id || approval?.status !== "APPROVED") throw new OperationError("forbidden");
      if (!["IN_PROGRESS", "BLOCKED", "SUBMITTED_FOR_REVIEW"].includes(nextStatus)) throw new OperationError("forbidden");
    }
    if (!canTransitionTask(task.status, nextStatus)) throw new OperationError("conflict");
    if (nextStatus === "ASSIGNED" && !task.assigneeId) throw new OperationError("invalid");
    if (nextStatus === "BLOCKED" && !cleanNote) throw new OperationError("invalid");
    await tx.task.update({ where: { id: task.id }, data: { status: nextStatus } });
    await event(tx, { complaintId: task.complaintId, taskId: task.id, actorId: actor.id, kind: "TASK_STATUS", summary: `Task ${task.code}: ${nextStatus}${cleanNote ? ` — ${cleanNote}` : ""}`, visibility: "TASK" });
    if (["IN_PROGRESS", "BLOCKED", "SUBMITTED_FOR_REVIEW", "COMPLETED"].includes(nextStatus)) {
      const complaint = await tx.complaint.findUniqueOrThrow({ where: { id: task.complaintId }, select: { userId: true, reference: true } });
      const progress: Record<string, string> = { IN_PROGRESS: "Field work is in progress.", BLOCKED: "Field work is paused; the team is reviewing the blocker.", SUBMITTED_FOR_REVIEW: "Field work has been submitted for team review.", COMPLETED: "A field task is complete. The case still needs resolution review." };
      const progressEvent = await event(tx, { complaintId: task.complaintId, actorId: actor.id, kind: "FIELD_PROGRESS", summary: progress[nextStatus], visibility: "OWNER" });
      await queueCitizenNotice(tx, { userId: complaint.userId, complaintId: task.complaintId, reference: complaint.reference, kind: "TASK_PROGRESS", title: "Field work progress updated", eventKey: progressEvent.id });
    }
    if (admin) await audit(tx, actor.id, "TASK_STATUS", "Task", task.id, nextStatus);
    if (nextStatus === "SUBMITTED_FOR_REVIEW" || nextStatus === "BLOCKED") await notifyAdmins(tx, "Task needs attention", `${task.code} is ${nextStatus.toLowerCase().replaceAll("_", " ")}.`, `/admin/tasks?task=${task.id}`);
    if (admin) await notify(tx, task.assigneeId, "Task status updated", `${task.code} is now ${nextStatus.toLowerCase().replaceAll("_", " ")}.`, "/volunteer");
  });
}

export async function addTaskNote(actor: Actor, taskId: string, note: string) {
  const message = text(note, 3, 1000);
  return prisma.$transaction(async tx => {
    const task = await tx.task.findUnique({ where: { id: taskId }, include: { complaint: { select: { cityId: true } } } });
    if (!task) throw new OperationError("not_found");
    if (actor.role === "CITY_MANAGER") await assertCityAccess(tx, actor, task.complaint.cityId);
    if (actor.role !== "ADMIN" && actor.role !== "CITY_MANAGER") {
      const approval = actor.role === "VOLUNTEER" ? await tx.volunteerApplication.findUnique({ where: { userId: actor.id }, select: { status: true } }) : null;
      if (task.assigneeId !== actor.id || approval?.status !== "APPROVED") throw new OperationError("forbidden");
    }
    await event(tx, { complaintId: task.complaintId, taskId: task.id, actorId: actor.id, kind: "TASK_NOTE", summary: message, visibility: "TASK" });
    if (actor.role === "ADMIN" || actor.role === "CITY_MANAGER") await audit(tx, actor.id, "TASK_NOTE", "Task", task.id);
    else await notifyAdmins(tx, "Task note added", `A volunteer added a note to ${task.code}.`, `/admin/tasks?task=${task.id}`);
  });
}
