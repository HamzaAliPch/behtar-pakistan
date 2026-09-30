import { runNotificationWorker } from "../src/lib/notification-worker";
import { prisma } from "../src/lib/prisma";

async function main() {
  if (process.env.FRIEND_TEST_MODE !== "1" && process.env.AUTH_TEST_MODE !== "1" && process.env.NOTIFICATION_WORKER_ENABLED !== "1") throw new Error("Worker disabled. Set NOTIFICATION_WORKER_ENABLED=1 only after reviewing the environment.");
  const result = await runNotificationWorker();
  // Aggregate counts only. No contacts, messages, credentials or case details.
  process.stdout.write(`Notification worker: ${JSON.stringify(result)}\n`);
}
main().catch(error => { process.stderr.write(`Notification worker failed: ${error instanceof Error ? error.name : "unknown"}\n`); process.exitCode = 1; }).finally(() => prisma.$disconnect());
