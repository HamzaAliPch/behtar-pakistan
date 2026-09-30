import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { assertFriendTestIsolation, friendTestRoot } from "../src/lib/friend-test-safety";

assertFriendTestIsolation();
if (process.env.FRIEND_TEST_MODE !== "1") throw new Error("Friend test mode is required");
const db = new PrismaClient();
const email = "friend.citizen@behtar.invalid";
const credentialsPath = path.join(friendTestRoot, "credentials.txt");

async function main() {
  const [users, complaints, payments, sessions, evidence] = await Promise.all([
    db.user.count(), db.complaint.count(), db.donationIntent.count(), db.session.count(), db.evidence.count(),
  ]);
  if (users || complaints || payments || sessions || evidence) {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (users === 1 && existing?.role === "CITIZEN" && complaints === 1 && payments === 0 && evidence === 0) {
      await readFile(credentialsPath);
      console.log("Friend test sample data already exists; no records changed.");
      return;
    }
    throw new Error("Friend test database is not empty or contains unexpected records; refusing to seed");
  }
  const password = randomBytes(24).toString("base64url");
  const reference = `KFX-TEST-${randomBytes(5).toString("hex").toUpperCase()}`;
  await mkdir(friendTestRoot, { recursive: true });
  await writeFile(credentialsPath, `TEST-ONLY CITIZEN ACCOUNT\nEmail: ${email}\nPassword: ${password}\nSample reference: ${reference}\n`, { flag: "wx", mode: 0o600 });
  try {
    await db.$transaction(async tx => {
      const citizen = await tx.user.create({ data: { email, name: "Friend Test Citizen", passwordHash: await hashPassword(password), role: "CITIZEN" } });
      const caseRow = await tx.complaint.create({ data: { reference, userId: citizen.id, cityId: "karachi", districtRecordId: "karachi-east", localityId: "karachi-east-1", title: "TEST DATA: fictional street drain issue", description: "This is a fictional sample report for testing. It is not a real civic complaint.", category: "Water & drainage", district: "East", area: "Gulshan-e-Iqbal", areaSource: "CATALOG", status: "SUBMITTED" } });
      await tx.caseEvent.create({ data: { complaintId: caseRow.id, actorId: citizen.id, kind: "SUBMITTED", summary: "Fictional sample complaint submitted", visibility: "PUBLIC" } });
    });
  } catch (error) {
    await unlink(credentialsPath).catch(() => undefined);
    throw error;
  }
  console.log("Created one test-only citizen and one clearly marked fictional complaint. No administrator, wallet, donation or evidence was seeded.");
  console.log(`Test credentials saved locally outside the web root: ${credentialsPath}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
