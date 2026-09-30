import { runNotificationWorker } from "../src/lib/notification-worker";
import { prisma } from "../src/lib/prisma";

const intervalMinutes = Number(process.env.NOTIFICATION_WORKER_INTERVAL_MINUTES ?? "5");
if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60) throw new Error("Worker interval must be 1–60 minutes.");
if (process.env.FRIEND_TEST_MODE !== "1" && process.env.AUTH_TEST_MODE !== "1" && process.env.NOTIFICATION_WORKER_ENABLED !== "1") throw new Error("Notification worker is disabled.");

let stopping = false;
async function tick() {
  if (stopping) return;
  try {
    const result = await runNotificationWorker();
    // Aggregate counts only; never print recipients, messages or tokens.
    process.stdout.write(`Notification worker run: ${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`Notification worker run failed: ${error instanceof Error ? error.name : "unknown"}\n`);
  }
}
const timer = setInterval(() => { void tick(); }, intervalMinutes * 60_000);
process.on("SIGINT", () => { stopping = true; clearInterval(timer); void prisma.$disconnect(); });
process.on("SIGTERM", () => { stopping = true; clearInterval(timer); void prisma.$disconnect(); });
void tick();
