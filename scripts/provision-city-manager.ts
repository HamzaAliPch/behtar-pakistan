import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { normalizeEmail, validEmail, validPassword } from "../src/lib/auth/validation";

const prisma = new PrismaClient();
async function main() {
  const email = normalizeEmail(process.env.CITY_MANAGER_EMAIL ?? "");
  const password = process.env.CITY_MANAGER_PASSWORD ?? "";
  const name = (process.env.CITY_MANAGER_NAME ?? "").trim();
  const slug = (process.env.CITY_MANAGER_CITY ?? "").trim().toLowerCase();
  if (!validEmail(email) || !validPassword(password) || name.length < 2 || name.length > 80 || !/^[a-z-]{2,40}$/.test(slug)) throw new Error("Set CITY_MANAGER_EMAIL, CITY_MANAGER_PASSWORD, CITY_MANAGER_NAME and CITY_MANAGER_CITY. Never put the password in source files.");
  const city = await prisma.city.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!city || city.status !== "ACTIVE") throw new Error("Choose an existing active city.");
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async tx => {
    if (await tx.user.findUnique({ where: { email } })) throw new Error("Email already belongs to an account. Existing roles are never changed by this script.");
    const user = await tx.user.create({ data: { name, email, passwordHash, role: "CITY_MANAGER" } });
    await tx.cityMembership.create({ data: { userId: user.id, cityId: city.id } });
    await tx.auditLog.create({ data: { actorId: user.id, action: "CITY_MANAGER_PROVISIONED", targetType: "City", targetId: city.id } });
  });
  console.log(`City manager created for ${slug}: ${email}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
