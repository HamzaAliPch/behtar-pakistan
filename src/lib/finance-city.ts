import { prisma } from "@/lib/prisma";
import { OperationError, requireAdmin, type Actor } from "@/lib/operations/common";

export type FinanceCityResource = "CAMPAIGN" | "RECEIPT" | "EXPENSE";

export async function allocateFinanceCity(actor: Actor, kind: FinanceCityResource, id: string, cityId: string) {
  requireAdmin(actor);
  if (!["CAMPAIGN", "RECEIPT", "EXPENSE"].includes(kind) || !id || !cityId) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const city = await tx.city.findUnique({ where: { id: cityId }, select: { status: true } });
    if (city?.status !== "ACTIVE") throw new OperationError("invalid");
    if (kind === "CAMPAIGN") {
      const row = await tx.donationCampaign.findUnique({ where: { id }, select: { cityId: true } });
      if (!row || row.cityId) throw new OperationError("invalid");
      await tx.donationCampaign.update({ where: { id }, data: { cityId } });
    } else if (kind === "RECEIPT") {
      const row = await tx.donationIntent.findUnique({ where: { id }, select: { cityId: true, campaignId: true, status: true, verifiedAt: true } });
      if (!row || row.campaignId || row.cityId || !row.verifiedAt || !["VERIFIED", "REFUNDED"].includes(row.status)) throw new OperationError("invalid");
      await tx.donationIntent.update({ where: { id }, data: { cityId } });
    } else {
      const row = await tx.donationExpense.findUnique({ where: { id }, select: { cityId: true, campaignId: true, status: true, paidAt: true } });
      if (!row || row.campaignId || row.cityId || row.status !== "PAID" || !row.paidAt) throw new OperationError("invalid");
      await tx.donationExpense.update({ where: { id }, data: { cityId } });
    }
    await tx.donationAudit.create({ data: { actorId: actor.id, action: "FINANCE_CITY_ALLOCATED", targetType: kind, targetId: id, details: JSON.stringify({ from: null, to: cityId }) } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "FINANCE_CITY_ALLOCATED", targetType: kind, targetId: id, details: cityId } });
  });
}
