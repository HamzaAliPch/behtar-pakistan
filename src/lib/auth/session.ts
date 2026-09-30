import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { roleHome } from "./permissions";

const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-kfx_session" : "kfx_session";
const SESSION_AGE_SECONDS = 7 * 24 * 60 * 60;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_AGE_SECONDS * 1000);
  await prisma.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  }
  cookieStore.delete(COOKIE_NAME);
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: { expiresAt: true, user: { select: { id: true, name: true, email: true, role: true } } },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
});

export async function requireRole(allowed: Role[], returnTo?: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`);
  if (!allowed.includes(user.role)) redirect(roleHome(user.role));
  if (user.role === "VOLUNTEER") {
    const application = await prisma.volunteerApplication.findUnique({ where: { userId: user.id }, select: { status: true } });
    if (application?.status !== "APPROVED") redirect("/");
  }
  return user;
}
