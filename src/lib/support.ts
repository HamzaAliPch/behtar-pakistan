
import { brand } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { LANGUAGES } from "./assistant";
import { audit, notify, notifyAdmins, OperationError } from "./operations/common";

export async function requestHumanSupport(actor: { id: string; role: string }, question: string, language: string) {
  if (actor.role !== "CITIZEN" && actor.role !== "VOLUNTEER") throw new OperationError("forbidden");
  const clean = question.trim();
  if (clean.length < 10 || clean.length > 800 || !LANGUAGES.includes(language as typeof LANGUAGES[number])) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const openCount = await tx.supportRequest.count({ where: { userId: actor.id, status: "OPEN" } });
    if (openCount >= 3) throw new OperationError("conflict");
    const item = await tx.supportRequest.create({ data: { userId: actor.id, question: clean, language } });
    await notifyAdmins(tx, "Human support requested", "A citizen has requested help.", "/admin/support");
    return item;
  });
}

export async function answerSupportRequest(actor: { id: string; role: string }, id: string, response: string) {
  if (actor.role !== "ADMIN") throw new OperationError("forbidden");
  const clean = response.trim();
  if (clean.length < 10 || clean.length > 3000) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    const item = await tx.supportRequest.findUnique({ where: { id } });
    if (!item) throw new OperationError("not_found");
    if (item.status !== "OPEN") throw new OperationError("conflict");
    const updated = await tx.supportRequest.update({ where: { id }, data: { status: "ANSWERED", response: clean, responderId: actor.id } });
    await audit(tx, actor.id, "SUPPORT_ANSWERED", "SupportRequest", id);
    await notify(tx, item.userId, `${brand.name} support replied`, "Your support request has a reply.", "/help");
    return updated;
  });
}
