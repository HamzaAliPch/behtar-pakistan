import { privateStoragePath } from "@/lib/private-storage";
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DonationStatus, WalletMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicDonationsEnabled } from "@/lib/donation-availability";
import { code, notify, OperationError, requireAdmin, text, type Actor, type Tx } from "@/lib/operations/common";

export const walletNames: Record<WalletMethod, string> = { EASYPAISA: "Easypaisa", JAZZCASH: "JazzCash", SADAPAY: "SadaPay", NAYAPAY: "NayaPay" };
export const suggestedAmounts = [500, 1000, 2500, 5000];
export const donationReceiptDirectory = privateStoragePath("donation_receipts");
const maxReceiptBytes = 3 * 1024 * 1024;

function optional(value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  return text(value, 1, max);
}
export function amountPkr(value: unknown): number {
  const raw = String(value ?? "");
  if (!/^[1-9]\d{0,6}$/.test(raw)) throw new OperationError("invalid");
  const amount = Number(raw);
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 1_000_000) throw new OperationError("invalid");
  return amount;
}
async function donationAudit(tx: Tx, actorId: string | null, action: string, targetType: string, targetId: string, details?: string) {
  await tx.donationAudit.create({ data: { actorId, action, targetType, targetId, details } });
}

export async function configureWallet(actor: Actor, input: { method: string; accountNumber: string; accountTitle: string; instructions: string; enabled: boolean; confirmed: boolean }) {
  requireAdmin(actor);
  if (!Object.values(WalletMethod).includes(input.method as WalletMethod)) throw new OperationError("invalid");
  const accountNumber = text(input.accountNumber, 10, 34).replaceAll(" ", "");
  const accountTitle = text(input.accountTitle, 3, 100);
  const instructions = text(input.instructions, 15, 1000);
  if (!/^[+A-Za-z0-9-]{10,34}$/.test(accountNumber) || (input.enabled && !input.confirmed)) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const item = await tx.walletAccount.upsert({ where: { method: input.method as WalletMethod }, create: { method: input.method as WalletMethod, accountNumber, accountTitle, instructions, enabled: input.enabled, verifiedAt: input.enabled ? new Date() : null, verifiedById: input.enabled ? actor.id : null }, update: { accountNumber, accountTitle, instructions, enabled: input.enabled, verifiedAt: input.enabled ? new Date() : null, verifiedById: input.enabled ? actor.id : null } });
    await donationAudit(tx, actor.id, input.enabled ? "WALLET_ENABLED" : "WALLET_DISABLED", "WalletAccount", item.id, input.method);
    return item;
  });
}

export async function saveCampaign(actor: Actor, input: { id?: string; slug: string; title: string; description: string; goalPkr?: string; complaintId?: string; verificationNote?: string; status: string }) {
  requireAdmin(actor);
  const slug = text(input.slug, 3, 70).toLowerCase(), title = text(input.title, 5, 120), description = text(input.description, 30, 3000);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !["DRAFT", "PUBLISHED", "CLOSED"].includes(input.status)) throw new OperationError("invalid");
  const goalPkr = input.goalPkr?.trim() ? amountPkr(input.goalPkr) : null;
  const note = optional(input.verificationNote, 1000);
  if (input.status === "PUBLISHED" && (!note || note.length < 20)) throw new OperationError("invalid");
  if (input.complaintId) {
    const complaint = await prisma.complaint.findUnique({ where: { id: input.complaintId }, select: { status: true, events: { where: { kind: "VERIFIED" }, select: { id: true }, take: 1 } } });
    if (!complaint || !complaint.events.length || complaint.status === "REJECTED") throw new OperationError("conflict");
  }
  return prisma.$transaction(async tx => {
    const existing = input.id ? await tx.donationCampaign.findUnique({ where: { id: input.id } }) : null;
    if (input.id && !existing) throw new OperationError("not_found");
    if (input.status === "CLOSED" && !existing?.approvedAt) throw new OperationError("conflict");
    if (input.status === "DRAFT" && existing?.approvedAt) throw new OperationError("conflict");
    const data = { slug, title, description, goalPkr, complaintId: input.complaintId || null, verificationNote: note, status: input.status, approvedAt: input.status === "PUBLISHED" ? new Date() : existing?.approvedAt ?? null, approvedById: input.status === "PUBLISHED" ? actor.id : existing?.approvedById ?? null };
    const campaign = input.id ? await tx.donationCampaign.update({ where: { id: input.id }, data }) : await tx.donationCampaign.create({ data });
    await donationAudit(tx, actor.id, "CAMPAIGN_SAVED", "DonationCampaign", campaign.id, input.status);
    return campaign;
  });
}

export async function validateReceipt(file: File | null): Promise<{ bytes: Buffer; mime: string; extension: string } | null> {
  if (!file || file.size === 0) return null;
  if (!(file instanceof File) || file.size > maxReceiptBytes) throw new OperationError("invalid");
  const bytes = Buffer.from(await file.arrayBuffer());
  let mime = "", extension = "";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) { mime = "image/jpeg"; extension = "jpg"; }
  else if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { mime = "image/png"; extension = "png"; }
  else if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") { mime = "image/webp"; extension = "webp"; }
  if (!mime || file.type !== mime) throw new OperationError("invalid");
  return { bytes, mime, extension };
}

export async function submitDonation(input: { campaignId?: string; walletId: string; amount: string; transactionReference: string; donorName?: string; donorEmail?: string; donorPhone?: string; receipt: File | null; donorUserId?: string | null }) {
  if (!publicDonationsEnabled()) throw new OperationError("forbidden");
  const amount = amountPkr(input.amount);
  const transactionReference = text(input.transactionReference, 6, 100).toUpperCase();
  if (!/^[A-Z0-9/_-]{6,100}$/.test(transactionReference)) throw new OperationError("invalid");
  const donorName = optional(input.donorName, 100), donorEmail = optional(input.donorEmail, 150), donorPhone = optional(input.donorPhone, 30);
  if (donorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail)) throw new OperationError("invalid");
  if (donorPhone && !/^\+?[0-9 -]{7,30}$/.test(donorPhone)) throw new OperationError("invalid");
  const wallet = await prisma.walletAccount.findFirst({ where: { id: input.walletId, enabled: true, verifiedAt: { not: null } } });
  if (!wallet) throw new OperationError("not_found");
  if (input.campaignId) {
    const campaign = await prisma.donationCampaign.findFirst({ where: { id: input.campaignId, status: "PUBLISHED", approvedAt: { not: null } }, select: { id: true } });
    if (!campaign) throw new OperationError("not_found");
  }
  const image = await validateReceipt(input.receipt);
  const receiptKey = image ? `${randomBytes(20).toString("hex")}.${image.extension}` : null;
  if (image && receiptKey) { await mkdir(donationReceiptDirectory, { recursive: true }); await writeFile(path.join(donationReceiptDirectory, receiptKey), image.bytes, { flag: "wx" }); }
  try {
    return await prisma.$transaction(async tx => {
      const intent = await tx.donationIntent.create({ data: { code: code("DON"), campaignId: input.campaignId || null, walletId: wallet.id, donorUserId: input.donorUserId || null, amountPkr: amount, transactionReference, donorName, donorEmail, donorPhone, receiptKey, receiptMime: image?.mime, receiptSize: image?.bytes.length, status: "PENDING" } });
      await donationAudit(tx, input.donorUserId || null, "DONATION_SUBMITTED", "DonationIntent", intent.id);
      return intent;
    });
  } catch (error) {
    if (receiptKey) await unlink(path.join(donationReceiptDirectory, receiptKey)).catch(() => undefined);
    throw error;
  }
}

export async function reviewDonation(actor: Actor, id: string, decision: string, accountCheckNote: string, independentlyChecked: boolean) {
  requireAdmin(actor);
  if (!Object.values(DonationStatus).includes(decision as DonationStatus) || decision === "PENDING" || !independentlyChecked) throw new OperationError("invalid");
  const note = text(accountCheckNote, 20, 1000);
  return prisma.$transaction(async tx => {
    const intent = await tx.donationIntent.findUnique({ where: { id } });
    if (!intent) throw new OperationError("not_found");
    if (!(intent.status === "PENDING" && ["VERIFIED", "REJECTED"].includes(decision)) && !(intent.status === "VERIFIED" && decision === "REFUNDED")) throw new OperationError("conflict");
    const updated = await tx.donationIntent.update({ where: { id }, data: { status: decision as DonationStatus, verifiedAt: decision === "VERIFIED" ? new Date() : intent.verifiedAt } });
    await tx.donationVerification.create({ data: { intentId: id, reviewerId: actor.id, decision: decision as DonationStatus, accountCheckNote: note } });
    await donationAudit(tx, actor.id, `DONATION_${decision}`, "DonationIntent", id, note);
    await notify(tx, intent.donorUserId, "Donation review updated", `Your donation submission ${intent.code} is ${decision.toLowerCase()}.`, "/donate");
    return updated;
  });
}

export async function recordExpense(actor: Actor, input: { campaignId?: string; amount: string; purpose: string; documentation: string; spentAt: string; publish: boolean }) {
  requireAdmin(actor);
  const amount = amountPkr(input.amount), purpose = text(input.purpose, 5, 200), documentation = text(input.documentation, 10, 1000);
  if (input.publish && (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(`${purpose} ${documentation}`) || /\b\d{11,}\b/.test(`${purpose} ${documentation}`))) throw new OperationError("invalid");
  const spentAt = new Date(input.spentAt);
  if (Number.isNaN(spentAt.getTime()) || spentAt > new Date() || spentAt < new Date("2020-01-01")) throw new OperationError("invalid");
  if (input.campaignId) {
    const campaign = await prisma.donationCampaign.findUnique({ where: { id: input.campaignId }, select: { id: true, status: true } });
    if (!campaign) throw new OperationError("not_found");
    if (input.publish && !["PUBLISHED", "CLOSED"].includes(campaign.status)) throw new OperationError("conflict");
  }
  return prisma.$transaction(async tx => {
    const expense = await tx.donationExpense.create({ data: { campaignId: input.campaignId || null, amountPkr: amount, purpose, documentation, spentAt, status: "PAID", approvedAt: new Date(), approvedById: actor.id, paidAt: spentAt, publishedAt: input.publish ? new Date() : null, recordedById: actor.id } });
    await donationAudit(tx, actor.id, input.publish ? "EXPENSE_PUBLISHED" : "EXPENSE_RECORDED", "DonationExpense", expense.id);
    return expense;
  });
}
