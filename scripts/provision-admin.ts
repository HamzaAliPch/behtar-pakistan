import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { normalizeEmail, validEmail, validPassword } from "../src/lib/auth/validation";
import { assertFriendTestIsolation } from "../src/lib/friend-test-safety";

if (process.env.FRIEND_TEST_MODE === "1") assertFriendTestIsolation();
const prisma = new PrismaClient();

async function main() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = (process.env.ADMIN_NAME ?? "Karachi Fix Admin").trim();
  if (!validEmail(email) || !validPassword(password) || name.length < 2 || name.length > 80) {
    throw new Error("Set ADMIN_EMAIL, ADMIN_PASSWORD (12–128 characters), and optionally ADMIN_NAME.");
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async tx => {
    if (await tx.user.count({ where: { role: "ADMIN" } })) {
      throw new Error("An administrator already exists. This one-time provisioning script will not create another.");
    }
    if (await tx.user.findUnique({ where: { email } })) {
      throw new Error("This email already belongs to an account. Use a different ADMIN_EMAIL.");
    }
    await tx.user.create({ data: { name, email, passwordHash, role: "ADMIN" } });
  });
  console.log(process.env.FRIEND_TEST_MODE === "1" ? "Initial test-only administrator created in isolated friend-test database." : `Initial administrator created: ${email}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
