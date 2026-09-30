import { privateStoragePath } from "@/lib/private-storage";
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { prisma } from "./prisma";
import { amountPkr, validateReceipt } from "./donations";
import { OperationError, requireAdmin, text, type Actor } from "./operations/common";

export const expenseReceiptDirectory = privateStoragePath("expense_receipts");

function safeSummary(value: string, min: number, max: number): string {
  const summary = text(value, min, max);
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(summary) || /\b\d{11,}\b/.test(summary)) throw new OperationError("invalid");
  return summary;
}

export async function proposeExpense(actor: Actor, input: { campaignId?: string; complaintId?: string; amount: string; purpose: string; documentation: string; receipt: File | null }) {
  requireAdmin(actor);
  const amountPkrValue = amountPkr(input.amount), purpose = safeSummary(input.purpose, 5, 200), documentation = safeSummary(input.documentation, 10, 1000);
  const campaign = input.campaignId ? await prisma.donationCampaign.findFirst({ where: { id: input.campaignId, approvedAt: { not: null }, status: { in: ["PUBLISHED", "CLOSED"] } }, select: { id: true, complaintId: true } }) : null;
  if (input.campaignId && !campaign) throw new OperationError("not_found");
  if (campaign?.complaintId && input.complaintId && campaign.complaintId !== input.complaintId) throw new OperationError("conflict");
  if (input.complaintId && !await prisma.complaint.findUnique({ where: { id: input.complaintId }, select: { id: true } })) throw new OperationError("not_found");
  const image = await validateReceipt(input.receipt);
  const receiptKey = image ? `${randomBytes(20).toString("hex")}.${image.extension}` : null;
  if (image && receiptKey) {
    await mkdir(expenseReceiptDirectory, { recursive: true });
    await writeFile(privateStoragePath("expense_receipts", receiptKey), image.bytes, { flag: "wx" });
  }
  try {
    return await prisma.$transaction(async tx => {
      const expense = await tx.donationExpense.create({ data: { campaignId: input.campaignId || null, complaintId: input.complaintId || null, amountPkr: amountPkrValue, purpose, documentation, spentAt: new Date(), status: "DRAFT", receiptKey, receiptMime: image?.mime, receiptSize: image?.bytes.length, recordedById: actor.id } });
      await tx.donationAudit.create({ data: { actorId: actor.id, action: "EXPENSE_PROPOSED", targetType: "DonationExpense", targetId: expense.id } });
      return expense;
    });
  } catch (error) {
    if (receiptKey) await unlink(privateStoragePath("expense_receipts", receiptKey)).catch(() => undefined);
    throw error;
  }
}

export async function reviewExpense(actor: Actor, id: string, decision: "APPROVED" | "CANCELLED") {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const expense = await tx.donationExpense.findUnique({ where: { id } });
    if (!expense) throw new OperationError("not_found");
    if (expense.status !== "DRAFT") throw new OperationError("conflict");
    const updated = await tx.donationExpense.update({ where: { id }, data: { status: decision, approvedAt: decision === "APPROVED" ? new Date() : null, approvedById: decision === "APPROVED" ? actor.id : null } });
    await tx.donationAudit.create({ data: { actorId: actor.id, action: `EXPENSE_${decision}`, targetType: "DonationExpense", targetId: id } });
    return updated;
  });
}

export async function markExpensePaid(actor: Actor, id: string, paidAt: string) {
  requireAdmin(actor);
  const date = new Date(paidAt);
  if (Number.isNaN(date.getTime()) || date > new Date() || date < new Date("2020-01-01")) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const expense = await tx.donationExpense.findUnique({ where: { id } });
    if (!expense) throw new OperationError("not_found");
    if (expense.status !== "APPROVED" || !expense.approvedAt) throw new OperationError("conflict");
    const updated = await tx.donationExpense.update({ where: { id }, data: { status: "PAID", paidAt: date, spentAt: date } });
    await tx.donationAudit.create({ data: { actorId: actor.id, action: "EXPENSE_PAID", targetType: "DonationExpense", targetId: id, details: date.toISOString() } });
    return updated;
  });
}

export async function publishPaidExpense(actor: Actor, id: string) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const expense = await tx.donationExpense.findUnique({ where: { id } });
    if (!expense) throw new OperationError("not_found");
    if (expense.status !== "PAID" || !expense.paidAt || expense.publishedAt) throw new OperationError("conflict");
    const updated = await tx.donationExpense.update({ where: { id }, data: { publishedAt: new Date() } });
    await tx.donationAudit.create({ data: { actorId: actor.id, action: "EXPENSE_PUBLISHED", targetType: "DonationExpense", targetId: id } });
    return updated;
  });
}

export async function proposeFinanceCorrection(actor: Actor, expenseId: string, delta: string, reasonInput: string) {
  requireAdmin(actor);
  if (!/^-?[1-9]\d{0,6}$/.test(delta)) throw new OperationError("invalid");
  const deltaPkr = Number(delta), reason = safeSummary(reasonInput, 20, 500);
  if (deltaPkr === 0 || Math.abs(deltaPkr) > 1_000_000) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const expense = await tx.donationExpense.findUnique({ where: { id: expenseId } });
    if (!expense) throw new OperationError("not_found");
    if (expense.status !== "PAID") throw new OperationError("conflict");
    const correction = await tx.financeCorrection.create({ data: { expenseId, deltaPkr, reason, proposedById: actor.id } });
    await tx.donationAudit.create({ data: { actorId: actor.id, action: "CORRECTION_PROPOSED", targetType: "FinanceCorrection", targetId: correction.id, details: `${deltaPkr}: ${reason}` } });
    return correction;
  });
}

export async function approveFinanceCorrection(actor: Actor, id: string) {
  requireAdmin(actor);
  return prisma.$transaction(async tx => {
    const correction = await tx.financeCorrection.findUnique({ where: { id }, include: { expense: true } });
    if (!correction) throw new OperationError("not_found");
    if (correction.approvedAt || correction.expense.status !== "PAID") throw new OperationError("conflict");
    const existing = await tx.financeCorrection.aggregate({ where: { expenseId: correction.expenseId, approvedAt: { not: null } }, _sum: { deltaPkr: true } });
    const corrected = correction.expense.amountPkr + (existing._sum.deltaPkr ?? 0) + correction.deltaPkr;
    if (corrected < 0 || corrected > 1_000_000) throw new OperationError("conflict");
    const updated = await tx.financeCorrection.update({ where: { id }, data: { approvedAt: new Date(), approvedById: actor.id } });
    await tx.donationAudit.create({ data: { actorId: actor.id, action: "CORRECTION_APPROVED", targetType: "FinanceCorrection", targetId: id, details: `${correction.deltaPkr}: ${correction.reason}` } });
    return updated;
  });
}
