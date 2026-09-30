import { testCookieName } from "./http-cookie";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { calculateFunds } from "../src/lib/finance";
import { configureWallet, reviewDonation, saveCampaign, submitDonation } from "../src/lib/donations";
import { approveFinanceCorrection, markExpensePaid, proposeExpense, proposeFinanceCorrection, publishPaidExpense, reviewExpense, expenseReceiptDirectory } from "../src/lib/finance-operations";

const base = process.env.AUTH_TEST_BASE_URL;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64");

test("finance totals and approval preserve restricted funds and exclude unverified claims", { skip: !base }, async () => {
  if (!base || !process.env.DATABASE_URL?.includes("auth-test.db")) throw new Error("Finance tests require isolated auth-test.db");
  const db = new PrismaClient();
  const suffix = randomBytes(5).toString("hex");
  const userIds: string[] = [], donationIds: string[] = [], expenseIds: string[] = [], correctionIds: string[] = [], receiptKeys: string[] = [];
  let walletId = "", campaignId = "";
  try {
    const passwordHash = await hashPassword(`finance-${suffix}-password`);
    const admin = await db.user.create({ data: { name: "Finance Admin", email: `finance-admin-${suffix}@example.test`, passwordHash, role: "ADMIN" } });
    const citizen = await db.user.create({ data: { name: "Finance Citizen", email: `finance-citizen-${suffix}@example.test`, passwordHash, role: "CITIZEN" } });
    userIds.push(admin.id, citizen.id);
    const adminActor = { id: admin.id, role: admin.role }, citizenActor = { id: citizen.id, role: citizen.role };
    const token = randomBytes(32).toString("hex");
    await db.session.create({ data: { userId: admin.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
    const adminCookie = `${testCookieName}=${token}`;
    assert.equal((await fetch(`${base}/funds`)).status, 200);
    assert.equal((await fetch(`${base}/admin/finance`, { redirect: "manual" })).status, 307);
    assert.equal((await fetch(`${base}/admin/finance`, { headers: { Cookie: adminCookie } })).status, 200);
    await assert.rejects(() => proposeExpense(citizenActor, { amount: "500", purpose: "Road supplies", documentation: "Invoice for test materials", receipt: null }));
    const wallet = await configureWallet(adminActor, { method: "EASYPAISA", accountNumber: "03460000000", accountTitle: "Finance Test Wallet", instructions: "Check the transfer against the receiving account before approving.", enabled: true, confirmed: true });
    walletId = wallet.id;
    const campaign = await saveCampaign(adminActor, { slug: `finance-${suffix}`, title: "Road safety project", description: "A documented community project for safety improvements.", verificationNote: "Reviewed legitimacy of the project and its public description.", status: "PUBLISHED" });
    campaignId = campaign.id;
    const make = async (amount: string, campaignIdValue: string | undefined, ref: string) => {
      const intent = await submitDonation({ walletId, campaignId: campaignIdValue, amount, transactionReference: ref, donorName: "Private Donor Name", donorEmail: "donor-private@example.test", receipt: null });
      donationIds.push(intent.id); return intent;
    };
    const general = await make("1000", undefined, `GEN${suffix}`);
    const refunded = await make("200", undefined, `REF${suffix}`);
    const restricted = await make("2000", campaignId, `CAM${suffix}`);
    await make("9000", campaignId, `PEN${suffix}`);
    for (const item of [general, refunded, restricted]) await reviewDonation(adminActor, item.id, "VERIFIED", "Confirmed funds in the actual receiving wallet ledger.", true);
    await reviewDonation(adminActor, refunded.id, "REFUNDED", "Confirmed actual refund in receiving wallet ledger.", true);
    const draft = await proposeExpense(adminActor, { campaignId, amount: "300", purpose: "Safety signs", documentation: "Invoice 123 for approved project materials", receipt: new File([png], "invoice.png", { type: "image/png" }) });
    expenseIds.push(draft.id);
    if (draft.receiptKey) receiptKeys.push(draft.receiptKey);
    assert.equal(draft.status, "DRAFT");
    assert.equal((await db.donationExpense.findUniqueOrThrow({ where: { id: draft.id } })).paidAt, null);
    await assert.rejects(() => reviewExpense(citizenActor, draft.id, "APPROVED"));
    await reviewExpense(adminActor, draft.id, "APPROVED");
    await assert.rejects(() => markExpensePaid(citizenActor, draft.id, new Date().toISOString()));
    await markExpensePaid(adminActor, draft.id, new Date().toISOString());
    await publishPaidExpense(adminActor, draft.id);
    const correction = await proposeFinanceCorrection(adminActor, draft.id, "-100", "Corrected duplicate line in the paid supplier invoice.");
    correctionIds.push(correction.id);
    await assert.rejects(() => approveFinanceCorrection(citizenActor, correction.id));
    await approveFinanceCorrection(adminActor, correction.id);
    const snapshot = calculateFunds(
      await db.donationIntent.findMany({ where: { id: { in: donationIds } }, select: { id: true, amountPkr: true, campaignId: true, status: true, verifiedAt: true, updatedAt: true } }),
      await db.donationExpense.findMany({ where: { id: draft.id }, select: { id: true, amountPkr: true, campaignId: true, paidAt: true, publishedAt: true, purpose: true, documentation: true, spentAt: true } }),
      await db.donationVerification.findMany({ where: { intentId: refunded.id, decision: "REFUNDED" }, select: { intentId: true, createdAt: true } }),
      [{ id: campaign.id, slug: campaign.slug, title: campaign.title, description: campaign.description, goalPkr: campaign.goalPkr, status: campaign.status }],
      [await db.financeCorrection.findUniqueOrThrow({ where: { id: correction.id }, select: { id: true, expenseId: true, deltaPkr: true, reason: true, approvedAt: true } })],
    );
    assert.equal(snapshot.gross, 3200);
    assert.equal(snapshot.refunds, 200);
    assert.equal(snapshot.spent, 200);
    assert.equal(snapshot.available, 2800);
    assert.equal(snapshot.general.balance, 1000);
    assert.equal(snapshot.campaigns[0].balance, 1800);
    const publicPage = await (await fetch(`${base}/funds`)).text();
    assert.match(publicPage, /Safety signs|Road safety project/);
    assert.doesNotMatch(publicPage, /Private Donor Name|donor-private@example.test|GEN/);
    assert.equal((await fetch(`${base}/api/finance/receipts/${draft.id}`)).status, 404);
    assert.equal((await fetch(`${base}/api/finance/receipts/${draft.id}`, { headers: { Cookie: adminCookie } })).status, 200);
    assert.equal((await fetch(`${base}/funds/report.csv`)).headers.get("content-type")?.includes("text/csv"), true);
  } finally {
    if (correctionIds.length) await db.financeCorrection.deleteMany({ where: { id: { in: correctionIds } } });
    if (expenseIds.length) await db.donationExpense.deleteMany({ where: { id: { in: expenseIds } } });
    for (const key of receiptKeys) await unlink(path.join(expenseReceiptDirectory, key)).catch(() => undefined);
    if (donationIds.length) { await db.donationVerification.deleteMany({ where: { intentId: { in: donationIds } } }); await db.donationIntent.deleteMany({ where: { id: { in: donationIds } } }); }
    if (campaignId) await db.donationCampaign.delete({ where: { id: campaignId } });
    if (walletId) await db.walletAccount.delete({ where: { id: walletId } });
    await db.donationAudit.deleteMany({ where: { actorId: { in: userIds } } });
    if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
});
