import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { listPublicProjects } from "../src/lib/public-projects";
import { listPublishedStories } from "../src/lib/completed-work-public";

test("public city filters include only active, approved city content", async () => {
  if (!process.env.DATABASE_URL?.includes("auth-test.db")) throw new Error("Use isolated auth-test.db");
  const db = new PrismaClient();
  const suffix = randomBytes(5).toString("hex");
  const cityId = `public-${suffix}`;
  const ngoIds: string[] = [], projectIds: string[] = [], caseIds: string[] = [];
  let userId = "";
  try {
    await db.city.create({ data: { id: cityId, slug: cityId, name: "Unserved test city", regionId: "sindh", status: "COMING_SOON" } });
    const ngo = await db.partnerNgo.create({ data: { name: `Test public NGO ${suffix}`, contactPerson: "Test", contactEmail: `ngo-${suffix}@example.test`, serviceAreas: "Test", expertise: "Test", status: "ACTIVE", verifiedAt: new Date() } }); ngoIds.push(ngo.id);
    const ngoInactive = await db.partnerNgo.create({ data: { name: `Test inactive NGO ${suffix}`, contactPerson: "Test", contactEmail: `ngo-inactive-${suffix}@example.test`, serviceAreas: "Test", expertise: "Test", status: "ACTIVE", verifiedAt: new Date(), cityId } }); ngoIds.push(ngoInactive.id);
    const user = await db.user.create({ data: { name: "Test admin", email: `public-${suffix}@example.test`, passwordHash: "test-only", role: "ADMIN" } }); userId = user.id;
    const karachi = await db.ngoProject.create({ data: { ngoId: ngo.id, title: `Karachi ${suffix}`, description: "Test", publicSummary: "Approved public work", publicApproved: true, status: "ACTIVE", createdById: user.id } }); projectIds.push(karachi.id);
    const inactive = await db.ngoProject.create({ data: { ngoId: ngoInactive.id, title: `Inactive ${suffix}`, description: "Test", publicSummary: "Approved public work", publicApproved: true, status: "ACTIVE", createdById: user.id } }); projectIds.push(inactive.id);
    assert.equal((await listPublicProjects()).some(item => item.id === karachi.id), true);
    assert.equal((await listPublicProjects()).some(item => item.id === inactive.id), false);
    assert.equal((await listPublicProjects(cityId)).length, 0);
    assert.equal((await listPublicProjects("karachi")).some(item => item.id === karachi.id), false);
    const complaint = await db.complaint.create({ data: { reference: `KFX-PUBLIC-${suffix.toUpperCase()}`, cityId, title: "Private original", description: "Private description", category: "Roads", area: "Private area", publicTitle: `Safe test ${suffix}`, publicArea: "Approximate area", publicLatitude: 24.9, publicLongitude: 67.1, publicVisible: true, publicApprovedAt: new Date(), status: "RESOLVED" } }); caseIds.push(complaint.id);
    const story = await db.completedWorkStory.create({ data: { complaintId: complaint.id, status: "PUBLISHED", contentApprovedAt: new Date(), publishedAt: new Date() } });
    assert.equal((await listPublishedStories()).some(item => item.id === story.id), false);
    assert.equal((await listPublishedStories(cityId)).length, 0);
    assert.equal((await listPublishedStories("karachi")).some(item => item.id === story.id), false);
    if (process.env.AUTH_TEST_BASE_URL) {
      const base = process.env.AUTH_TEST_BASE_URL;
      const map = await (await fetch(`${base}/api/map`)).text();
      assert.doesNotMatch(map, new RegExp(complaint.id));
      assert.doesNotMatch(map, /Private original|Private description|Private area/);
      assert.equal((await fetch(`${base}/api/map?city=${cityId}`)).status, 400);
      assert.equal((await fetch(`${base}/projects/${inactive.id}`)).status, 404);
      assert.equal((await fetch(`${base}/map/case/${complaint.id}`)).status, 404);
    }
  } finally {
    await db.completedWorkStory.deleteMany({ where: { complaintId: { in: caseIds } } });
    await db.ngoProject.deleteMany({ where: { id: { in: projectIds } } });
    await db.complaint.deleteMany({ where: { id: { in: caseIds } } });
    await db.partnerNgo.deleteMany({ where: { id: { in: ngoIds } } });
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.city.deleteMany({ where: { id: cityId } });
    await db.$disconnect();
  }
});
