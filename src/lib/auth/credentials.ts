import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "./password";
import { normalizeEmail, validEmail, validPassword } from "./validation";
import { cleanCitizenPhone, profileCityId } from "@/lib/citizen-profile";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export class AuthError extends Error {
  constructor(public code: "invalid" | "duplicate" | "locked") { super(code); }
}

export async function registerCitizen(input: { name: string; email: string; password: string; phone?: string; citySlug?: string }) {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (name.length < 2 || name.length > 80 || !validEmail(email) || !validPassword(input.password)) throw new AuthError("invalid");
  let phone: string | null, cityId: string | null;
  try { phone = cleanCitizenPhone(input.phone ?? ""); cityId = await profileCityId(input.citySlug ?? ""); }
  catch { throw new AuthError("invalid"); }
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async tx => {
      const user = await tx.user.create({ data: { name, email, passwordHash, role: "CITIZEN" }, select: { id: true, name: true, email: true, role: true } });
      if (phone || cityId) await tx.citizenProfile.create({ data: { userId: user.id, phone, cityId } });
      return user;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AuthError("duplicate");
    throw error;
  }
}

export async function authenticate(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  if (!validEmail(email) || !password || password.length > 128) throw new AuthError("invalid");
  const now = new Date();
  const throttle = await prisma.loginThrottle.findUnique({ where: { email } });
  if (throttle?.lockedUntil && throttle.lockedUntil > now) throw new AuthError("locked");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, role: true, passwordHash: true } });
  const valid = await verifyPassword(password, user?.passwordHash);
  if (!user || !valid) {
    const recent = throttle && now.getTime() - throttle.updatedAt.getTime() < WINDOW_MS;
    const failures = recent ? throttle.failures + 1 : 1;
    await prisma.loginThrottle.upsert({ where: { email }, create: { email, failures, lockedUntil: failures >= MAX_FAILURES ? new Date(now.getTime() + WINDOW_MS) : null }, update: { failures, lockedUntil: failures >= MAX_FAILURES ? new Date(now.getTime() + WINDOW_MS) : null } });
    throw new AuthError(failures >= MAX_FAILURES ? "locked" : "invalid");
  }
  await prisma.loginThrottle.deleteMany({ where: { email } });
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
