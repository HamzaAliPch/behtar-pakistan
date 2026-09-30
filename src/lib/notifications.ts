import { prisma } from "@/lib/prisma";
import type { Tx } from "@/lib/operations/common";

export type NoticeKind = "COMPLAINT_SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "TASK_PROGRESS" | "INFORMATION_REQUESTED" | "RESOLUTION_PROPOSED" | "RESOLUTION_REMINDER" | "RESOLVED" | "REOPENED";
const deliverable = ["PENDING", "RETRY"];
export function pakistanMobile(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (/^03\d{9}$/.test(digits)) return `+92${digits.slice(1)}`;
  if (/^923\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}
export function reminderHours(raw = process.env.RESOLUTION_REMINDER_HOURS): number[] {
  const values = (raw || "24,72").split(",").map(Number);
  return [...new Set(values.filter(value => Number.isInteger(value) && value >= 1 && value <= 168))].sort((a, b) => a - b).slice(0, 2);
}
export function externalTrackLink(href: string): string | null {
  const configured = process.env.NOTIFICATION_PUBLIC_ORIGIN || (process.env.FRIEND_TEST_MODE === "1" ? "http://127.0.0.1:3101" : process.env.AUTH_TEST_MODE === "1" ? "http://127.0.0.1:3100" : "");
  try {
    const base = new URL(configured);
    if (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost"].includes(base.hostname) && (process.env.FRIEND_TEST_MODE === "1" || process.env.AUTH_TEST_MODE === "1"))) return null;
    if (base.username || base.password || base.pathname !== "/") return null;
    const url = new URL(href, base);
    return url.origin === base.origin && url.pathname === "/track" ? url.toString() : null;
  } catch { return null; }
}
function key(value: string, channel: string) { return `${value}:${channel}`; }
async function createOutbox(tx: Tx, data: { userId: string; complaintId: string; channel: string; kind: NoticeKind; title: string; message: string; href: string; dedupeKey: string; dueAt?: Date }) {
  return tx.notificationOutbox.upsert({ where: { dedupeKey: data.dedupeKey }, create: data, update: {} });
}
async function optedChannels(tx: Tx, userId: string): Promise<string[]> {
  const profile = await tx.citizenProfile.findUnique({ where: { userId }, select: { phone: true, smsOptIn: true, whatsappOptIn: true } });
  if (!pakistanMobile(profile?.phone)) return [];
  return [profile?.smsOptIn && "SMS", profile?.whatsappOptIn && "WHATSAPP"].filter((item): item is string => Boolean(item));
}
export async function queueCitizenNotice(tx: Tx, input: { userId: string | null; complaintId: string; reference: string; kind: NoticeKind; title: string; eventKey: string }) {
  if (!input.userId) return;
  const href = `/track?ref=${encodeURIComponent(input.reference)}`;
  const message = input.kind === "RESOLUTION_PROPOSED" ? `Your case ${input.reference} has a proposed resolution. Sign in to review and confirm or dispute it.` : `Your case ${input.reference} has an update. Sign in to review it.`;
  const dedupeKey = `case:${input.eventKey}:${input.userId}`;
  await tx.notification.upsert({ where: { dedupeKey: key(dedupeKey, "IN_APP") }, create: { userId: input.userId, complaintId: input.complaintId, kind: input.kind, title: input.title, message, href, dedupeKey: key(dedupeKey, "IN_APP") }, update: {} });
  for (const channel of await optedChannels(tx, input.userId)) await createOutbox(tx, { userId: input.userId, complaintId: input.complaintId, channel, kind: input.kind, title: input.title, message, href, dedupeKey: key(dedupeKey, channel) });
}
export async function scheduleResolutionReminders(tx: Tx, input: { userId: string | null; complaintId: string; reference: string; proposalEventId: string; at?: Date }) {
  if (!input.userId) return;
  const at = input.at ?? new Date();
  const channels = ["IN_APP", ...await optedChannels(tx, input.userId)];
  for (const [index, hours] of reminderHours().entries()) for (const channel of channels) {
    const href = `/track?ref=${encodeURIComponent(input.reference)}`;
    await createOutbox(tx, { userId: input.userId, complaintId: input.complaintId, channel, kind: "RESOLUTION_REMINDER", title: "Please review your proposed resolution", message: `Your case ${input.reference} is waiting for your review. Sign in to confirm or dispute the proposal.`, href, dedupeKey: `reminder:${input.proposalEventId}:${index + 1}:${input.userId}:${channel}`, dueAt: new Date(at.getTime() + hours * 3_600_000) });
  }
}
export async function cancelResolutionReminders(tx: Tx, complaintId: string) {
  await tx.notificationOutbox.updateMany({ where: { complaintId, kind: "RESOLUTION_REMINDER", status: { in: [...deliverable, "PROCESSING"] } }, data: { status: "CANCELLED", lastErrorCode: "case_no_longer_waiting" } });
}

export type AdapterResult = { ok: true; providerMessageId: string } | { ok: false; code: string; retryable: boolean };
export interface MessageAdapter { send(input: { channel: "SMS" | "WHATSAPP"; to: string; body: string; attempt: number; idempotencyKey?: string }): Promise<AdapterResult> }
export function notificationProviderStatus(): "QA_MOCK" | "DISABLED" {
  return process.env.NOTIFICATION_PROVIDER_MODE === "mock" && (process.env.FRIEND_TEST_MODE === "1" || process.env.AUTH_TEST_MODE === "1") ? "QA_MOCK" : "DISABLED";
}
export function messageAdapter(): MessageAdapter {
  if (notificationProviderStatus() === "QA_MOCK") return { async send(input) {
    if (process.env.NOTIFICATION_MOCK_FAIL_ONCE === "1" && input.attempt === 1) return { ok: false, code: "mock_transient", retryable: true };
    return { ok: true, providerMessageId: `mock-${input.channel.toLowerCase()}-${input.attempt}` };
  } };
  return { async send() { return { ok: false, code: "provider_unconfigured", retryable: false }; } };
}
export async function processNotificationOutbox(now = new Date(), limit = 50) {
  if (process.env.FRIEND_TEST_MODE !== "1" && process.env.AUTH_TEST_MODE !== "1" && process.env.NOTIFICATION_WORKER_ENABLED !== "1") throw new Error("Notification worker is disabled.");
  // A process may stop after claiming a row. Reclaim stale leases without duplicating a delivered row.
  await prisma.notificationOutbox.updateMany({ where: { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - 15 * 60_000) } }, data: { status: "RETRY", lastErrorCode: "worker_interrupted" } });
  const rows = await prisma.notificationOutbox.findMany({ where: { status: { in: deliverable }, dueAt: { lte: now } }, orderBy: { dueAt: "asc" }, take: Math.min(Math.max(limit, 1), 50) });
  const result = { examined: rows.length, delivered: 0, retry: 0, blocked: 0, cancelled: 0 };
  for (const row of rows) {
    if (row.attempts >= row.maxAttempts) { await prisma.notificationOutbox.updateMany({ where: { id: row.id, status: { in: deliverable } }, data: { status: "BLOCKED", lastErrorCode: "retry_limit" } }); result.blocked++; continue; }
    const claim = await prisma.notificationOutbox.updateMany({ where: { id: row.id, status: { in: deliverable }, attempts: row.attempts }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
    if (!claim.count) continue;
    const attempt = row.attempts + 1;
    const complaint = row.complaintId ? await prisma.complaint.findUnique({ where: { id: row.complaintId }, select: { userId: true, status: true } }) : null;
    if (!complaint || complaint.userId !== row.userId || (row.kind === "RESOLUTION_REMINDER" && complaint.status !== "RESOLUTION_PROPOSED")) {
      await finish(row.id, attempt, "CANCELLED", "case_no_longer_waiting", undefined, now); result.cancelled++; continue;
    }
    if (row.channel === "IN_APP") {
      const created = await prisma.$transaction(async tx => {
        const current = await tx.notificationOutbox.findUnique({ where: { id: row.id }, select: { status: true } });
        if (current?.status !== "PROCESSING") return false;
        await tx.notification.upsert({ where: { dedupeKey: row.dedupeKey }, create: { userId: row.userId, complaintId: row.complaintId, kind: row.kind, title: row.title, message: row.message, href: row.href, dedupeKey: row.dedupeKey }, update: {} });
        await tx.notificationOutbox.update({ where: { id: row.id }, data: { status: "DELIVERED", deliveredAt: now, lastErrorCode: null } });
        await tx.notificationDeliveryAttempt.create({ data: { outboxId: row.id, attempt, status: "DELIVERED" } });
        return true;
      }); if (created) result.delivered++; else result.cancelled++; continue;
    }
    const profile = await prisma.citizenProfile.findUnique({ where: { userId: row.userId }, select: { phone: true, smsOptIn: true, whatsappOptIn: true } });
    const number = pakistanMobile(profile?.phone);
    if (!number || (row.channel === "SMS" && !profile?.smsOptIn) || (row.channel === "WHATSAPP" && !profile?.whatsappOptIn)) {
      await finish(row.id, attempt, "CANCELLED", "opted_out_or_invalid_contact", undefined, now); result.cancelled++; continue;
    }
    if ((await prisma.notificationOutbox.findUnique({ where: { id: row.id }, select: { status: true } }))?.status !== "PROCESSING") { result.cancelled++; continue; }
    const link = externalTrackLink(row.href);
    if (!link) { await finish(row.id, attempt, "BLOCKED", "public_origin_unconfigured", undefined, now); result.blocked++; continue; }
    const recentDeliveries = await prisma.notificationDeliveryAttempt.count({ where: { status: "DELIVERED", createdAt: { gte: new Date(now.getTime() - 3_600_000) }, outbox: { userId: row.userId, channel: row.channel } } });
    if (recentDeliveries >= 5) {
      const changed = await prisma.notificationOutbox.updateMany({ where: { id: row.id, status: "PROCESSING" }, data: { status: "RETRY", lastErrorCode: "channel_throttle", dueAt: new Date(now.getTime() + 3_600_000) } });
      if (changed.count) { await prisma.notificationDeliveryAttempt.create({ data: { outboxId: row.id, attempt, status: "RETRY", errorCode: "channel_throttle" } }); result.retry++; } else result.cancelled++;
      continue;
    }
    const response = await messageAdapter().send({ channel: row.channel as "SMS" | "WHATSAPP", to: number, body: `${row.message} ${link}`, attempt, idempotencyKey: row.dedupeKey });
    if (response.ok) { if (await finish(row.id, attempt, "DELIVERED", null, response.providerMessageId, now)) result.delivered++; else result.cancelled++; }
    else if (response.retryable && attempt < row.maxAttempts) {
      const updated = await prisma.notificationOutbox.updateMany({ where: { id: row.id, status: "PROCESSING" }, data: { status: "RETRY", lastErrorCode: response.code, dueAt: new Date(now.getTime() + Math.min(60, 2 ** attempt) * 60_000) } });
      if (updated.count) { await prisma.notificationDeliveryAttempt.create({ data: { outboxId: row.id, attempt, status: "RETRY", errorCode: response.code } }); result.retry++; } else result.cancelled++;
    } else { if (await finish(row.id, attempt, "BLOCKED", response.code, undefined, now)) result.blocked++; else result.cancelled++; }
  }
  return result;
}
async function finish(id: string, attempt: number, status: string, errorCode: string | null, providerMessageId?: string, now = new Date()) {
  return prisma.$transaction(async tx => {
    const updated = await tx.notificationOutbox.updateMany({ where: { id, status: "PROCESSING" }, data: { status, lastErrorCode: errorCode, deliveredAt: status === "DELIVERED" ? now : null, providerMessageId } });
    if (updated.count) await tx.notificationDeliveryAttempt.create({ data: { outboxId: id, attempt, status, errorCode } });
    return updated.count > 0;
  });
}
