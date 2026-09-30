import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { POST } from "../src/app/api/notifications/webhook/route";

test("webhook rejects unsigned calls and duplicate delivery confirmations", { skip: !process.env.DATABASE_URL?.includes("auth-test.db") }, async () => {
  const db = new PrismaClient(), suffix = randomBytes(6).toString("hex"), secret = randomBytes(32).toString("hex");
  const oldEnabled = process.env.NOTIFICATION_WEBHOOK_ENABLED, oldSecret = process.env.NOTIFICATION_WEBHOOK_SECRET;
  let id: string | undefined;
  try {
    process.env.NOTIFICATION_WEBHOOK_ENABLED = "0";
    assert.equal((await POST(new Request("http://localhost/api/notifications/webhook", { method: "POST", body: "{}" }))).status, 503);
    process.env.NOTIFICATION_WEBHOOK_ENABLED = "1"; process.env.NOTIFICATION_WEBHOOK_SECRET = secret;
    const row = await db.notificationOutbox.create({ data: { userId: `[QA TEST] ${suffix}`, channel: "SMS", kind: "TASK_PROGRESS", title: "[QA TEST]", message: "[QA TEST]", href: "/track", dedupeKey: `qa-webhook-${suffix}`, status: "AWAITING_WEBHOOK" } }); id = row.id;
    const payload = JSON.stringify({ id: `event-${suffix}`, outboxId: row.id, status: "DELIVERED" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const request = (signature: string) => new Request("http://localhost/api/notifications/webhook", { method: "POST", body: payload, headers: { "x-behtar-timestamp": timestamp, "x-behtar-signature": signature } });
    assert.equal((await POST(request("0".repeat(64)))).status, 401);
    assert.equal((await db.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).status, "AWAITING_WEBHOOK");
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    assert.equal((await POST(request(signature))).status, 200);
    assert.equal((await POST(request(signature))).status, 409);
    assert.equal((await db.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).status, "DELIVERED");
    assert.equal(await db.notificationWebhookEvent.count({ where: { outboxId: row.id } }), 1);
  } finally {
    process.env.NOTIFICATION_WEBHOOK_ENABLED = oldEnabled; process.env.NOTIFICATION_WEBHOOK_SECRET = oldSecret;
    if (id) { await db.notificationWebhookEvent.deleteMany({ where: { outboxId: id } }); await db.notificationOutbox.delete({ where: { id } }); }
    await db.$disconnect();
  }
});
