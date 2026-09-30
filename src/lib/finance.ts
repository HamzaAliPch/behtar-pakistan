import { prisma } from "./prisma";
import type { DonationStatus } from "@prisma/client";

type Receipt = { id: string; amountPkr: number; campaignId: string | null; status: DonationStatus; verifiedAt: Date | null; updatedAt: Date };
type PaidExpense = { amountPkr: number; campaignId: string | null; paidAt: Date | null; publishedAt: Date | null; purpose: string; documentation: string; spentAt: Date; id: string };
type RefundEvent = { intentId: string; createdAt: Date };
type Campaign = { id: string; slug: string; title: string; description: string; goalPkr: number | null; status: string };
type Correction = { id: string; expenseId: string; deltaPkr: number; reason: string; approvedAt: Date | null };

const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const fundKey = (id: string | null) => id ?? "general";

export function calculateFunds(receipts: Receipt[], expenses: PaidExpense[], refundEvents: RefundEvent[], campaigns: Campaign[], corrections: Correction[] = []) {
  const grossByFund = new Map<string, number>();
  const refundsByFund = new Map<string, number>();
  const spentByFund = new Map<string, number>();
  const monthly = new Map<string, { received: number; refunded: number; spent: number }>();
  const add = (bucket: Map<string, number>, key: string, amount: number) => bucket.set(key, (bucket.get(key) ?? 0) + amount);
  const addMonth = (date: Date, field: "received" | "refunded" | "spent", amount: number) => {
    const key = monthKey(date), row = monthly.get(key) ?? { received: 0, refunded: 0, spent: 0 };
    row[field] += amount; monthly.set(key, row);
  };
  const refundDate = new Map(refundEvents.map(item => [item.intentId, item.createdAt]));
  let gross = 0, refunds = 0, spent = 0;
  for (const receipt of receipts) {
    if (!receipt.verifiedAt || !["VERIFIED", "REFUNDED"].includes(receipt.status) || !Number.isSafeInteger(receipt.amountPkr) || receipt.amountPkr <= 0) continue;
    gross += receipt.amountPkr;
    add(grossByFund, fundKey(receipt.campaignId), receipt.amountPkr);
    addMonth(receipt.verifiedAt, "received", receipt.amountPkr);
    if (receipt.status === "REFUNDED") {
      refunds += receipt.amountPkr;
      add(refundsByFund, fundKey(receipt.campaignId), receipt.amountPkr);
      addMonth(refundDate.get(receipt.id) ?? receipt.updatedAt, "refunded", receipt.amountPkr);
    }
  }
  for (const expense of expenses) {
    if (!expense.paidAt || !Number.isSafeInteger(expense.amountPkr) || expense.amountPkr <= 0) continue;
    spent += expense.amountPkr;
    add(spentByFund, fundKey(expense.campaignId), expense.amountPkr);
    addMonth(expense.paidAt, "spent", expense.amountPkr);
  }
  const paidExpenses = new Map(expenses.map(item => [item.id, item]));
  for (const correction of corrections) {
    const expense = paidExpenses.get(correction.expenseId);
    if (!expense || !correction.approvedAt) continue;
    spent += correction.deltaPkr;
    add(spentByFund, fundKey(expense.campaignId), correction.deltaPkr);
    addMonth(correction.approvedAt, "spent", correction.deltaPkr);
  }
  const balance = (key: string) => (grossByFund.get(key) ?? 0) - (refundsByFund.get(key) ?? 0) - (spentByFund.get(key) ?? 0);
  const approvedIds = new Set(campaigns.map(item => item.id));
  const allFundKeys = new Set([...grossByFund.keys(), ...spentByFund.keys(), ...refundsByFund.keys()]);
  const undisclosedRestrictedBalance = [...allFundKeys].filter(key => key !== "general" && !approvedIds.has(key)).reduce((sum, key) => sum + balance(key), 0);
  return {
    gross, refunds, verifiedNet: gross - refunds, spent, available: gross - refunds - spent,
    general: { received: grossByFund.get("general") ?? 0, refunded: refundsByFund.get("general") ?? 0, spent: spentByFund.get("general") ?? 0, balance: balance("general") },
    campaigns: campaigns.map(item => ({ ...item, received: grossByFund.get(item.id) ?? 0, refunded: refundsByFund.get(item.id) ?? 0, spent: spentByFund.get(item.id) ?? 0, balance: balance(item.id) })),
    undisclosedRestrictedBalance,
    monthly: [...monthly].sort(([a], [b]) => a.localeCompare(b)).map(([month, sums]) => ({ month, ...sums, net: sums.received - sums.refunded - sums.spent })),
    negativeFunds: [...allFundKeys].filter(key => balance(key) < 0),
  };
}

export async function getFinanceSnapshot(cityId?: string) {
  const receiptScope = cityId ? { OR: [{ campaignId: null, cityId }, { campaign: { cityId } }] } : {};
  const expenseScope = cityId ? { OR: [{ campaignId: null, cityId }, { campaign: { cityId } }] } : {};
  const [receipts, expenses, refundReviews, campaigns, corrections, latestReview] = await Promise.all([
    prisma.donationIntent.findMany({ where: { status: { in: ["VERIFIED", "REFUNDED"] }, verifiedAt: { not: null }, ...receiptScope }, select: { id: true, amountPkr: true, campaignId: true, cityId: true, status: true, verifiedAt: true, updatedAt: true } }),
    prisma.donationExpense.findMany({ where: { status: "PAID", paidAt: { not: null }, ...expenseScope }, select: { id: true, amountPkr: true, campaignId: true, cityId: true, paidAt: true, publishedAt: true, purpose: true, documentation: true, spentAt: true, campaign: { select: { title: true, approvedAt: true } } }, orderBy: { paidAt: "desc" } }),
    prisma.donationVerification.findMany({ where: { decision: "REFUNDED" }, select: { intentId: true, createdAt: true } }),
    prisma.donationCampaign.findMany({ where: { status: { in: ["PUBLISHED", "CLOSED"] }, approvedAt: { not: null }, ...(cityId && { cityId }) }, select: { id: true, slug: true, title: true, description: true, goalPkr: true, status: true }, orderBy: { createdAt: "desc" } }),
    prisma.financeCorrection.findMany({ where: { approvedAt: { not: null } }, select: { id: true, expenseId: true, deltaPkr: true, reason: true, approvedAt: true }, orderBy: { approvedAt: "desc" } }),
    prisma.donationVerification.findFirst({ where: { decision: { in: ["VERIFIED", "REFUNDED"] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const expenseIds = new Set(expenses.map(item => item.id));
  const scopedCorrections = corrections.filter(item => expenseIds.has(item.expenseId));
  const totals = calculateFunds(receipts, expenses, refundReviews, campaigns, scopedCorrections);
  const unallocated = calculateFunds(receipts.filter(item => !item.campaignId && !item.cityId), expenses.filter(item => !item.campaignId && !item.cityId), refundReviews, [], scopedCorrections);
  const lastUpdate = [!cityId ? latestReview?.createdAt : null, scopedCorrections[0]?.approvedAt, ...receipts.map(item => item.verifiedAt), ...expenses.map(item => item.paidAt)].filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return { ...totals, unallocatedGeneral: cityId ? null : unallocated.general, lastUpdate, publicExpenses: expenses.filter(item => item.publishedAt).slice(0, 100), publicCorrections: scopedCorrections.filter(item => expenses.some(expense => expense.id === item.expenseId && expense.publishedAt)).slice(0, 100) };
}
