import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { answerAssistant } from "../src/lib/assistant";
import { saveHelpArticle } from "../src/lib/help-articles";

test("assistant serves only approved active-city guidance and keeps private cases private", async () => {
  if (!process.env.DATABASE_URL?.includes("auth-test.db")) throw new Error("Use isolated auth-test.db");
  const db = new PrismaClient(), suffix = randomBytes(5).toString("hex"), articleIds: string[] = [];
  let userId = "", caseId = "";
  try {
    const admin = await db.user.create({ data: { name: "Help admin", email: `help-city-${suffix}@example.test`, passwordHash: "test-only", role: "ADMIN" } }); userId = admin.id;
    const lahore = await db.city.findUniqueOrThrow({ where: { slug: "lahore" }, select: { id: true } });
    const category = `RoadHelp${suffix}`;
    const karachi = await saveHelpArticle({ id: admin.id, role: "ADMIN" }, { cityId: "karachi", title: `Road guidance ${suffix}`, category, language: "en", content: "Verified Karachi road reporting guidance.", published: true }); articleIds.push(karachi.id);
    const inactive = await saveHelpArticle({ id: admin.id, role: "ADMIN" }, { cityId: lahore.id, title: `Lahore road guidance ${suffix}`, category, language: "en", content: "Not yet operational in Lahore.", published: true }); articleIds.push(inactive.id);
    const legacy = await saveHelpArticle({ id: admin.id, role: "ADMIN" }, { title: `Legacy road guidance ${suffix}`, category, language: "en", content: "Legacy Karachi guidance only.", published: true }); articleIds.push(legacy.id);
    const inKarachi = await answerAssistant(null, `Explain ${category}`, "en", "karachi");
    assert.equal(inKarachi.source, "local");
    assert.ok(inKarachi.articles?.some(item => item.title === karachi.title));
    assert.equal((await db.helpArticle.findUniqueOrThrow({ where: { id: legacy.id } })).cityId, null);
    assert.ok(!inKarachi.articles?.some(item => item.title === inactive.title));
    const inLahore = await answerAssistant(null, `Explain ${category}`, "en", "lahore");
    assert.match(inLahore.text, /not active|only active city/i);
    assert.ok(!inLahore.articles?.length);
    assert.ok(!inLahore.links.some(item => item.href.startsWith("/report")));
    await assert.rejects(answerAssistant(null, "How do I report?", "en", "unknown-test-city"));
    const complaint = await db.complaint.create({ data: { reference: `KFX-HELP-${suffix.toUpperCase()}`, title: "Private case title", description: "Private", category: "Roads", area: "Private" } }); caseId = complaint.id;
    const denied = await answerAssistant(null, `What is ${complaint.reference}?`, "en", "karachi");
    assert.doesNotMatch(denied.text, /Private case title/);
  } finally {
    await db.helpArticle.deleteMany({ where: { id: { in: articleIds } } });
    if (caseId) await db.complaint.delete({ where: { id: caseId } });
    await db.auditLog.deleteMany({ where: { actorId: userId } });
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }
});
