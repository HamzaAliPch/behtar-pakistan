import { testCookieName } from "./http-cookie";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { validateKarachiArea, KARACHI_AREAS } from "../src/lib/karachi-areas";
import { DISTRICTS } from "../src/lib/geo-constants";
import { addReportPhotos, removeReportPhoto } from "../src/lib/report-photos";
import { hashPassword } from "../src/lib/auth/password";
import { evidenceDirectory } from "../src/lib/operations/evidence";

const base = process.env.AUTH_TEST_BASE_URL;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64");
const photo = (name = "issue.png") => new File([png], name, { type: "image/png" });

test("citizen report wizard: locations, private photos, nearby privacy and repeat submission", { skip: !base }, async () => {
  if (!base || !process.env.DATABASE_URL?.includes("auth-test.db")) throw new Error("Use isolated auth-test.db for report tests.");
  const db = new PrismaClient();
  const suffix = randomBytes(5).toString("hex");
  const users: string[] = [], complaints: string[] = [], keys: string[] = [];
  async function cookie(userId: string) {
    const token = randomBytes(32).toString("hex");
    await db.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 600_000) } });
    return `${testCookieName}=${token}`;
  }
  try {
    assert.equal(DISTRICTS.length, 7);
    for (const district of DISTRICTS) assert.ok(KARACHI_AREAS[district].length > 0);
    assert.deepEqual(validateKarachiArea("East", "Gulistan-e-Johar", false), { district: "East", area: "Gulistan-e-Johar", source: "CATALOG" });
    assert.throws(() => validateKarachiArea("South", "Gulistan-e-Johar", false));
    assert.throws(() => validateKarachiArea("South", "Gulistan-e-Johar", true));
    assert.throws(() => validateKarachiArea("East", "Japan", true));
    assert.equal(validateKarachiArea("East", "My new Karachi locality", true).source, "MANUAL");
    const chosen = addReportPhotos([], [photo("one.png"), photo("two.png")]);
    assert.equal(chosen.files.length, 2);
    assert.deepEqual(removeReportPhoto(chosen.files, 0).map(file => file.name), ["two.png"]);
    assert.equal(addReportPhotos(chosen.files, [new File(["bad"], "bad.txt", { type: "text/plain" })]).errors.length, 1);
    assert.equal(addReportPhotos(chosen.files, [new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })]).errors.length, 1);
    assert.equal(addReportPhotos(Array.from({ length: 5 }, () => photo()), [photo()]).errors.length, 1);

    const passwordHash = await hashPassword(`report-${suffix}-password`);
    const [owner, other, admin] = await Promise.all(["CITIZEN", "CITIZEN", "ADMIN"].map((role, index) => db.user.create({ data: { name: `Report ${index}`, email: `report-${index}-${suffix}@example.test`, passwordHash, role: role as "CITIZEN" | "ADMIN" } })));
    users.push(owner.id, other.id, admin.id);
    const [ownerCookie, otherCookie, adminCookie] = await Promise.all([cookie(owner.id), cookie(other.id), cookie(admin.id)]);
    const privateCase = await db.complaint.create({ data: { reference: `KFX-RPR-${suffix.toUpperCase()}`, title: "Private doorstep detail", category: "Streetlights", description: "Secret private location details", district: "East", area: "Gulshan-e-Iqbal", status: "VERIFIED", userId: owner.id } });
    complaints.push(privateCase.id);
    const publicCase = await db.complaint.create({ data: { reference: `KFX-RPU-${suffix.toUpperCase()}`, title: "Private house 88", publicTitle: "Streetlight outage", publicArea: "Gulshan-e-Iqbal", publicVisible: true, category: "Streetlights", description: "Streetlight is out by a private home", district: "East", area: "Gulshan-e-Iqbal", status: "VERIFIED", userId: owner.id } });
    complaints.push(publicCase.id);
    const near = await fetch(`${base}/api/nearby?category=Streetlights&district=East&area=Gulshan-e-Iqbal`, { headers: { Cookie: ownerCookie } });
    assert.equal(near.status, 200);
    const nearbyText = await near.text();
    assert.match(nearbyText, /Streetlight outage/);
    assert.doesNotMatch(nearbyText, /Private doorstep|Private house 88|Secret private|private home/);
    assert.equal((await fetch(`${base}/api/nearby?category=Streetlights&district=East&area=Gulshan-e-Iqbal`)).status, 401);

    const submissionKey = randomUUID();
    function form(key: string, files: File[] = []) {
      const data = new FormData();
      for (const [name, value] of Object.entries({ submissionKey: key, title: "Broken light by road", category: "Streetlights", description: "The light has been broken for several nights.", district: "East", area: "Gulshan-e-Iqbal", manualArea: "0", landmark: "Community clinic", streetOrBlock: "Block 2", privateDirections: "Next to blue gate", latitude: "", longitude: "" })) data.set(name, value);
      for (const file of files) data.append("photos", file);
      return data;
    }
    const send = (body: FormData, cookieValue = ownerCookie) => fetch(`${base}/api/reports`, { method: "POST", headers: { Origin: base, Cookie: cookieValue }, body });
    assert.equal((await send(form(randomUUID()), otherCookie.replace("kfx_session", "not_a_session"))).status, 401);
    assert.equal((await send(form(randomUUID()), adminCookie)).status, 401);
    assert.equal((await send(form(randomUUID(), [new File(["not an image"], "fake.png", { type: "image/png" })]))).status, 400);
    assert.equal((await send(form(randomUUID(), Array.from({ length: 6 }, () => photo())))).status, 400);
    const accepted = await send(form(submissionKey, [photo("before-one.png"), photo("before-two.png")]));
    assert.equal(accepted.status, 201);
    const result = await accepted.json() as { id: string; reference: string; duplicate: boolean };
    complaints.push(result.id);
    assert.match(result.reference, /^KFX-/);
    assert.equal(result.duplicate, false);
    const saved = await db.complaint.findUniqueOrThrow({ where: { id: result.id }, include: { evidence: true } });
    keys.push(...saved.evidence.map(item => item.storageKey));
    assert.equal(saved.userId, owner.id);
    assert.equal(saved.areaSource, "CATALOG");
    assert.equal(saved.landmark, "Community clinic");
    assert.equal(saved.evidence.length, 2);
    assert.ok(saved.evidence.every(item => item.visibility === "OWNER"));
    const evidenceUrl = `${base}/api/evidence/${saved.evidence[0].id}`;
    assert.equal((await fetch(evidenceUrl, { headers: { Cookie: ownerCookie } })).status, 200);
    assert.equal((await fetch(evidenceUrl, { headers: { Cookie: adminCookie } })).status, 200);
    assert.equal((await fetch(evidenceUrl, { headers: { Cookie: otherCookie } })).status, 404);
    assert.equal((await fetch(evidenceUrl)).status, 404);
    const retry = await send(form(submissionKey));
    assert.equal(retry.status, 200);
    assert.equal((await retry.json() as { reference: string }).reference, result.reference);
    assert.equal(await db.complaint.count({ where: { submissionKey } }), 1);
    const manual = await send((() => { const data = form(randomUUID()); data.set("manualArea", "1"); data.set("area", "New Karachi lane nearby"); return data; })());
    assert.equal(manual.status, 201);
    const manualResult = await manual.json() as { id: string };
    complaints.push(manualResult.id);
    assert.equal((await db.complaint.findUniqueOrThrow({ where: { id: manualResult.id } })).areaSource, "MANUAL");
    assert.equal((await db.complaint.findUniqueOrThrow({ where: { id: manualResult.id } })).latitude, null);
  } finally {
    if (complaints.length) {
      await db.notificationDeliveryAttempt.deleteMany({ where: { outbox: { complaintId: { in: complaints } } } });
      await db.notificationOutbox.deleteMany({ where: { complaintId: { in: complaints } } });
      await db.complaintSlaSnapshot.deleteMany({ where: { complaintId: { in: complaints } } });
      await db.complaint.deleteMany({ where: { id: { in: complaints } } });
    }
    for (const key of keys) await unlink(path.join(evidenceDirectory, key)).catch(() => undefined);
    if (users.length) await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});
