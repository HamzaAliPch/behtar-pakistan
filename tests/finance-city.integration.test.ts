import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { allocateFinanceCity } from "../src/lib/finance-city";
import { getFinanceSnapshot } from "../src/lib/finance";

test("city finance uses explicit allocation and preserves unallocated national totals", async () => {
  if (!process.env.DATABASE_URL?.includes("auth-test.db")) throw new Error("Use isolated auth-test.db");
  const db = new PrismaClient(), suffix = randomBytes(5).toString("hex");
  const ids = { users: [] as string[], intents: [] as string[], expenses: [] as string[], campaigns: [] as string[] };
  let walletId = "";
  try {
    const admin = await db.user.create({ data: { name: "Finance scope admin", email: `fin-scope-${suffix}@example.test`, passwordHash: "test-only", role: "ADMIN" } }); ids.users.push(admin.id);
    const citizen = await db.user.create({ data: { name: "Finance scope citizen", email: `fin-scope-citizen-${suffix}@example.test`, passwordHash: "test-only", role: "CITIZEN" } }); ids.users.push(citizen.id);
    const wallet = await db.walletAccount.create({ data: { method: "NAYAPAY", accountNumber: `test-${suffix}`, accountTitle: "Test wallet", instructions: "Test", enabled: false } }); walletId = wallet.id;
    const campaign = await db.donationCampaign.create({ data: { slug: `scope-${suffix}`, title: "Scoped project", description: "Test", status: "PUBLISHED", approvedAt: new Date() } }); ids.campaigns.push(campaign.id);
    const general = await db.donationIntent.create({ data: { code: `SCOPE-G-${suffix}`, walletId, amountPkr: 1000, transactionReference: `G-${suffix}`, status: "VERIFIED", verifiedAt: new Date() } }); ids.intents.push(general.id);
    const restricted = await db.donationIntent.create({ data: { code: `SCOPE-R-${suffix}`, walletId, amountPkr: 2000, transactionReference: `R-${suffix}`, campaignId: campaign.id, status: "VERIFIED", verifiedAt: new Date() } }); ids.intents.push(restricted.id);
    const pending = await db.donationIntent.create({ data: { code: `SCOPE-P-${suffix}`, walletId, amountPkr: 9000, transactionReference: `P-${suffix}`, status: "PENDING" } }); ids.intents.push(pending.id);
    const expense = await db.donationExpense.create({ data: { amountPkr: 300, purpose: "Documented test work", documentation: "Test", spentAt: new Date(), status: "PAID", paidAt: new Date(), recordedById: admin.id } }); ids.expenses.push(expense.id);
    const before = await getFinanceSnapshot("karachi");
    const nationwideBefore = await getFinanceSnapshot();
    assert.equal(nationwideBefore.available - before.available, 2700);
    await assert.rejects(allocateFinanceCity({ id: citizen.id, role: "CITIZEN" }, "CAMPAIGN", campaign.id, "karachi"), /forbidden/);
    await assert.rejects(allocateFinanceCity({ id: admin.id, role: "ADMIN" }, "RECEIPT", pending.id, "karachi"));
    await allocateFinanceCity({ id: admin.id, role: "ADMIN" }, "CAMPAIGN", campaign.id, "karachi");
    await allocateFinanceCity({ id: admin.id, role: "ADMIN" }, "RECEIPT", general.id, "karachi");
    await allocateFinanceCity({ id: admin.id, role: "ADMIN" }, "EXPENSE", expense.id, "karachi");
    await assert.rejects(allocateFinanceCity({ id: admin.id, role: "ADMIN" }, "CAMPAIGN", campaign.id, "karachi"));
    const after = await getFinanceSnapshot("karachi");
    assert.equal(after.available - before.available, 2700);
    assert.equal(after.general.balance - before.general.balance, 700);
    assert.equal(after.campaigns.find(item => item.id === campaign.id)?.balance, 2000);
    assert.equal((await getFinanceSnapshot()).available, nationwideBefore.available);
    assert.equal((await db.donationAudit.count({ where: { action: "FINANCE_CITY_ALLOCATED", actorId: admin.id } })), 3);
  } finally {
    await db.donationAudit.deleteMany({ where: { actorId: { in: ids.users } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: ids.users } } });
    await db.donationExpense.deleteMany({ where: { id: { in: ids.expenses } } });
    await db.donationIntent.deleteMany({ where: { id: { in: ids.intents } } });
    await db.donationCampaign.deleteMany({ where: { id: { in: ids.campaigns } } });
    if (walletId) await db.walletAccount.delete({ where: { id: walletId } });
    await db.user.deleteMany({ where: { id: { in: ids.users } } });
    await db.$disconnect();
  }
});
