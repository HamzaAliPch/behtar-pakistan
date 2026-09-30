import { randomBytes } from "node:crypto";
import type { Prisma, Role } from "@prisma/client";

export type Actor = { id: string; role: Role };
export type Tx = Prisma.TransactionClient;

export class OperationError extends Error {
  constructor(public code: "forbidden" | "invalid" | "not_found" | "conflict") { super(code); }
}

export function requireAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN") throw new OperationError("forbidden");
}

export function text(value: unknown, min: number, max: number): string {
  if (typeof value !== "string") throw new OperationError("invalid");
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new OperationError("invalid");
  return trimmed;
}

export function optionalText(value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  return text(value, 1, max);
}

export function code(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export async function audit(tx: Tx, actorId: string | null, action: string, targetType: string, targetId: string, details?: string) {
  await tx.auditLog.create({ data: { actorId, action, targetType, targetId, details } });
}

export async function event(tx: Tx, data: { complaintId: string; actorId?: string; kind: string; summary: string; visibility: "PUBLIC" | "OWNER" | "INTERNAL" | "TASK"; taskId?: string; referralId?: string; evidenceId?: string }) {
  return tx.caseEvent.create({ data });
}

export async function notify(tx: Tx, userId: string | null | undefined, title: string, message: string, href: string) {
  if (userId) await tx.notification.create({ data: { userId, title, message, href } });
}

export async function notifyAdmins(tx: Tx, title: string, message: string, href: string) {
  const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (admins.length) await tx.notification.createMany({ data: admins.map(admin => ({ userId: admin.id, title, message, href })) });
}
