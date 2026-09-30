import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { runNotificationWorker } from "../src/lib/notification-worker";

test("worker records observed runs, skips an active lease, and recovers an expired lease", { skip: !process.env.DATABASE_URL?.includes("auth-test.db") }, async () => {
  if (!process.env.DATABASE_URL?.includes("auth-test.db")) throw new Error("Use isolated auth-test.db");
  const now = new Date();
  const first = await runNotificationWorker(now);
  assert.equal(first.skipped, false);
  const state = await prisma.notificationWorkerState.findUniqueOrThrow({ where: { id: 1 } });
  assert.equal(state.lastSuccessAt?.getTime(), now.getTime());
  await prisma.notificationWorkerState.update({ where: { id: 1 }, data: { leaseToken: "[QA TEST] other worker", leaseUntil: new Date(now.getTime() + 60_000) } });
  const skipped = await runNotificationWorker(now);
  assert.deepEqual(skipped, { skipped: true, reason: "worker_already_running" });
  await prisma.notificationWorkerState.update({ where: { id: 1 }, data: { leaseUntil: new Date(now.getTime() - 1000) } });
  const recovered = await runNotificationWorker(now);
  assert.equal(recovered.skipped, false);
  assert.equal((await prisma.notificationWorkerState.findUniqueOrThrow({ where: { id: 1 } })).leaseToken, null);
});
