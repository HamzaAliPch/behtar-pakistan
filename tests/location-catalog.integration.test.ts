import { testCookieName } from "./http-cookie";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { getReportingCity } from "../src/lib/location-catalog";
import { validateCatalogArea } from "../src/lib/location-validation";
import { saveCatalogLocation } from "../src/lib/operations/locations";

const base = process.env.AUTH_TEST_BASE_URL;
test("city catalog preserves Karachi reporting and rejects inactive cities and unauthorized edits", { skip: !base }, async () => {
  if (!process.env.DATABASE_URL?.includes("auth-test.db")) throw new Error("Use isolated auth-test.db");
  const db = new PrismaClient();
  const suffix = randomBytes(5).toString("hex");
  const userIds: string[] = [], caseIds: string[] = [], localityIds: string[] = [];
  try {
    assert.equal(await db.administrativeRegion.count(), 7);
    const city = await getReportingCity();
    assert.equal(city.districts.length, 7);
    const mapped = validateCatalogArea(city, "East", "Gulshan-e-Iqbal", false);
    assert.equal(mapped.locationNeedsReview, false);
    assert.ok(mapped.localityId);
    assert.throws(() => validateCatalogArea(city, "South", "Gulshan-e-Iqbal", true));
    assert.equal(validateCatalogArea(city, "East", "New community area", true).locationNeedsReview, true);
    for (const slug of ["lahore", "islamabad", "peshawar", "quetta", "multan", "unknown"]) await assert.rejects(getReportingCity(slug));
    const citizen = await db.user.create({ data: { name: "Catalog test", email: `catalog-${suffix}@example.test`, passwordHash: "not-a-login-hash", role: "CITIZEN" } }); userIds.push(citizen.id);
    const admin = await db.user.create({ data: { name: "Catalog admin", email: `catalog-admin-${suffix}@example.test`, passwordHash: "not-a-login-hash", role: "ADMIN" } }); userIds.push(admin.id);
    const input = { districtId: mapped.districtRecordId, name: `Test locality ${suffix}`, kind: "LOCALITY", sourceUrl: "https://commissionerkarachi.gos.pk/area-map", active: true };
    await assert.rejects(saveCatalogLocation(citizen, input), /Forbidden/);
    const added = await saveCatalogLocation(admin, input); localityIds.push(added.id);
    assert.equal(validateCatalogArea(await getReportingCity(), "East", added.name, false).localityId, added.id);
    const token = randomBytes(32).toString("hex");
    await db.session.create({ data: { userId: citizen.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 600000) } });
    async function report(slug?: string) {
      const form = new FormData();
      for (const [key, value] of Object.entries({ title: "Street light needs attention", description: "The street light has stopped working near our lane.", category: "Streetlights", district: "East", area: added.name, submissionKey: randomUUID(), ...(slug ? { citySlug: slug } : {}) })) form.set(key, value);
      return fetch(`${base}/api/reports`, { method: "POST", headers: { Cookie: `${testCookieName}=${token}` }, body: form });
    }
    for (const slug of ["lahore", "unknown"]) { const response = await report(slug); assert.equal(response.status, 400); }
    const success = await report(); // Legacy client without city remains Karachi.
    assert.equal(success.status, 201, await success.clone().text());
    const result = await success.json(); caseIds.push(result.id);
    const saved = await db.complaint.findUniqueOrThrow({ where: { id: result.id } });
    assert.equal(saved.cityId, "karachi"); assert.equal(saved.localityId, added.id); assert.equal(saved.locationNeedsReview, false);
    assert.equal(saved.latitude, null); assert.ok(saved.reference.startsWith("KFX-"));
    await saveCatalogLocation(admin, { ...input, id: added.id, active: false });
    const updatedCatalog = await getReportingCity();
    assert.throws(() => validateCatalogArea(updatedCatalog, "East", added.name, false));
    const denied = await fetch(`${base}/admin/locations`, { headers: { Cookie: `${testCookieName}=${token}` }, redirect: "manual" });
    assert.equal(denied.status, 307);
    const publicPage = await fetch(`${base}/cities`); assert.equal(publicPage.status, 200); assert.ok((await publicPage.text()).includes("Coming soon"));
  } finally {
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.notificationDeliveryAttempt.deleteMany({ where: { outbox: { complaintId: { in: caseIds } } } });
    await db.notificationOutbox.deleteMany({ where: { complaintId: { in: caseIds } } });
    await db.complaintSlaSnapshot.deleteMany({ where: { complaintId: { in: caseIds } } });
    await db.caseEvent.deleteMany({ where: { complaintId: { in: caseIds } } });
    await db.complaint.deleteMany({ where: { id: { in: caseIds } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await db.locality.deleteMany({ where: { id: { in: localityIds } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } }); await db.$disconnect();
  }
});
