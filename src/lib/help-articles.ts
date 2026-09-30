import { prisma } from "@/lib/prisma";
import { LANGUAGES } from "./assistant";
import { OperationError } from "./operations/common";

export async function saveHelpArticle(actor: { id: string; role: string }, input: { id?: string; cityId?: string | null; title: string; category: string; language: string; content: string; published: boolean }) {
  if (actor.role !== "ADMIN") throw new OperationError("forbidden");
  const title = input.title.trim(), category = input.category.trim(), content = input.content.trim();
  if (title.length < 5 || title.length > 120 || category.length < 2 || category.length > 60 || content.length < 20 || content.length > 5000 || !LANGUAGES.includes(input.language as typeof LANGUAGES[number])) throw new OperationError("invalid");
  return prisma.$transaction(async tx => {
    if (input.cityId && !await tx.city.findUnique({ where: { id: input.cityId }, select: { id: true } })) throw new OperationError("invalid");
    const data = { title, category, content, language: input.language, published: input.published, editorId: actor.id, cityId: input.cityId ?? null };
    const article = input.id ? await tx.helpArticle.update({ where: { id: input.id }, data }) : await tx.helpArticle.create({ data });
    await tx.auditLog.create({ data: { actorId: actor.id, action: input.published ? "HELP_PUBLISHED" : "HELP_SAVED", targetType: "HelpArticle", targetId: article.id } });
    return article;
  });
}
