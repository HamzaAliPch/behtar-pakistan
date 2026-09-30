import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "./password";
import { normalizeEmail, validEmail, validPassword } from "./validation";

const TOKEN_LIFETIME_MS = 20 * 60_000;
const REQUEST_WINDOW_MS = 60 * 60_000;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
type Delivery = (email: string, resetUrl: string) => Promise<void>;

function deliveryConfiguration(): { endpoint: string; origin: string; secret: string } | null {
  if (process.env.FRIEND_TEST_MODE === "1" || process.env.AUTH_TEST_MODE === "1") return null;
  try {
    const endpoint = new URL(process.env.PASSWORD_RESET_DELIVERY_URL ?? "");
    const origin = new URL(process.env.PASSWORD_RESET_PUBLIC_ORIGIN ?? "");
    const secret = process.env.PASSWORD_RESET_DELIVERY_SECRET ?? "";
    if (endpoint.protocol !== "https:" || origin.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash || origin.pathname !== "/" || origin.search || origin.hash || secret.length < 32) return null;
    return { endpoint: endpoint.toString(), origin: origin.origin, secret };
  } catch { return null; }
}

export function passwordRecoveryAvailable(): boolean { return deliveryConfiguration() !== null; }

function configuredDelivery(): { deliver: Delivery; origin: string } | null {
  const configuration = deliveryConfiguration();
  if (!configuration) return null;
  return { origin: configuration.origin, deliver: async (email, resetUrl) => {
    const response = await fetch(configuration.endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${configuration.secret}` }, body: JSON.stringify({ to: email, subject: "Reset your Behtar Pakistan password", text: `Use this single-use link within 20 minutes to reset your password: ${resetUrl}\nIf you did not request this, ignore this message.` }) });
    if (!response.ok) throw new Error("Password reset delivery unavailable");
  } };
}

export async function requestPasswordReset(emailInput: string, injected?: { deliver: Delivery; origin: string }, now = new Date()): Promise<{ available: boolean }> {
  const provider = injected ?? configuredDelivery();
  if (!provider) return { available: false };
  const email = normalizeEmail(emailInput);
  if (!validEmail(email)) return { available: true };
  const key = `email:${digest(email)}`;
  const allowed = await prisma.$transaction(async tx => {
    const globalKey = "reset:global";
    const current = await Promise.all([tx.passwordResetThrottle.findUnique({ where: { key } }), tx.passwordResetThrottle.findUnique({ where: { key: globalKey } })]);
    const limits = [{ key, row: current[0], max: 3 }, { key: globalKey, row: current[1], max: 100 }];
    const denied = limits.some(({ row, max }) => row && now.getTime() - row.updatedAt.getTime() < REQUEST_WINDOW_MS && row.requests >= max);
    if (denied) return false;
    for (const item of limits) {
      const requests = item.row && now.getTime() - item.row.updatedAt.getTime() < REQUEST_WINDOW_MS ? item.row.requests + 1 : 1;
      await tx.passwordResetThrottle.upsert({ where: { key: item.key }, create: { key: item.key, requests, updatedAt: now }, update: { requests, updatedAt: now } });
    }
    return true;
  });
  if (!allowed) return { available: true };
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!user || !["CITIZEN", "VOLUNTEER"].includes(user.role)) return { available: true };
  const token = randomBytes(32).toString("hex"), tokenHash = digest(token);
  await prisma.$transaction(async tx => {
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS) } });
  });
  try {
    const origin = new URL(provider.origin);
    if (origin.protocol !== "https:" && !(process.env.AUTH_TEST_MODE === "1" && origin.hostname === "127.0.0.1")) throw new Error("Invalid reset origin");
    const resetUrl = new URL("/reset-password", origin);
    resetUrl.searchParams.set("token", token);
    await provider.deliver(email, resetUrl.toString());
  } catch {
    await prisma.passwordResetToken.updateMany({ where: { tokenHash, usedAt: null }, data: { usedAt: now } });
  }
  return { available: true };
}

export async function consumePasswordReset(token: string, password: string, now = new Date()): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token) || !validPassword(password)) return false;
  // Random guesses must not trigger an expensive password hash. The transaction
  // below still claims the real token atomically after hashing.
  const candidate = await prisma.passwordResetToken.findUnique({ where: { tokenHash: digest(token) }, select: { usedAt: true, expiresAt: true } });
  if (!candidate || candidate.usedAt || candidate.expiresAt <= now) return false;
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async tx => {
    const record = await tx.passwordResetToken.findUnique({ where: { tokenHash: digest(token) }, include: { user: { select: { role: true } } } });
    if (!record || record.usedAt || record.expiresAt <= now || !["CITIZEN", "VOLUNTEER"].includes(record.user.role)) return false;
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (!claimed.count) return false;
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: record.userId } });
    await tx.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } });
    return true;
  });
}
