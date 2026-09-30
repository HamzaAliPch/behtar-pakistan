import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { processNotificationOutbox } from "@/lib/notifications";

const LEASE_MS = 20 * 60_000;

/** One durable lease for the entire outbox. Expired leases recover after a crash. */
export async function runNotificationWorker(now = new Date(), limit = 50) {
  if (process.env.FRIEND_TEST_MODE !== "1" && process.env.AUTH_TEST_MODE !== "1" && process.env.NOTIFICATION_WORKER_ENABLED !== "1") throw new Error("Notification worker is disabled.");
  const token = randomUUID();
  await prisma.notificationWorkerState.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const acquired = await prisma.notificationWorkerState.updateMany({
    where: { id: 1, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS), lastStartedAt: now, lastErrorCode: null, totalRuns: { increment: 1 } },
  });
  if (!acquired.count) return { skipped: true as const, reason: "worker_already_running" as const };
  try {
    const result = await processNotificationOutbox(now, limit);
    await prisma.notificationWorkerState.updateMany({ where: { id: 1, leaseToken: token }, data: {
      leaseToken: null, leaseUntil: null, lastFinishedAt: now, lastSuccessAt: now,
      lastExamined: result.examined, lastDelivered: result.delivered, lastRetry: result.retry,
      lastBlocked: result.blocked, lastCancelled: result.cancelled,
    } });
    return { skipped: false as const, ...result };
  } catch (error) {
    await prisma.notificationWorkerState.updateMany({ where: { id: 1, leaseToken: token }, data: {
      leaseToken: null, leaseUntil: null, lastFinishedAt: now, lastErrorCode: "worker_run_failed", totalFailures: { increment: 1 },
    } });
    throw error;
  }
}
