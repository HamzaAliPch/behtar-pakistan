import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const secret = process.env.NOTIFICATION_WEBHOOK_SECRET;
  if (process.env.NOTIFICATION_WEBHOOK_ENABLED !== "1" || !secret || secret.length < 32) return new Response(null, { status: 503 });
  const timestamp = request.headers.get("x-behtar-timestamp") ?? "";
  const signature = request.headers.get("x-behtar-signature") ?? "";
  const seconds = Number(timestamp);
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - seconds) > 300 || !/^[a-f0-9]{64}$/i.test(signature)) return new Response(null, { status: 401 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > 4096) { await reader.cancel(); return new Response(null, { status: 413 }); }
    chunks.push(next.value);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return new Response(null, { status: 401 });
  let payload: { id?: string; outboxId?: string; status?: string };
  try { payload = JSON.parse(body); } catch { return new Response(null, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.id !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(payload.id) || typeof payload.outboxId !== "string" || !/^[a-z0-9]{10,50}$/.test(payload.outboxId) || !["DELIVERED", "FAILED"].includes(payload.status ?? "")) return new Response(null, { status: 400 });
  const outbox = await prisma.notificationOutbox.findUnique({ where: { id: payload.outboxId }, select: { status: true, channel: true } });
  if (!outbox || outbox.channel === "IN_APP" || outbox.status !== "AWAITING_WEBHOOK") return new Response(null, { status: 409 });
  await prisma.$transaction(async tx => {
    await tx.notificationWebhookEvent.create({ data: { id: payload.id!, outboxId: payload.outboxId!, status: payload.status! } });
    await tx.notificationOutbox.update({ where: { id: payload.outboxId }, data: { status: payload.status === "DELIVERED" ? "DELIVERED" : "BLOCKED", deliveredAt: payload.status === "DELIVERED" ? new Date() : null, lastErrorCode: payload.status === "FAILED" ? "provider_reported_failure" : null } });
  }).catch(error => { if ((error as { code?: string }).code !== "P2002") throw error; });
  return Response.json({ accepted: true });
}
