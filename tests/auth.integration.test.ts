import { testCookieName } from "./http-cookie";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const base = process.env.AUTH_TEST_BASE_URL;

test("registration, sessions, ownership, tracking, throttling, and admin authorization", { skip: !base }, async () => {
  if (!base) return;
  if (!process.env.DATABASE_URL?.includes("auth-test.db")) throw new Error("Integration tests require the isolated auth-test.db database.");
  const db = new PrismaClient();
  const suffix = randomBytes(6).toString("hex");
  const email1 = `citizen-one-${suffix}@example.test`;
  const email2 = `citizen-two-${suffix}@example.test`;
  const adminEmail = `admin-${suffix}@example.test`;
  const volunteerEmail = `volunteer-${suffix}@example.test`;
  const password = `secure-test-password-${suffix}`;
  let complaintId: string | undefined;

  async function get(path: string, cookie?: string) {
    return fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });
  }
  async function post(path: string, actionId: string, fields: Record<string, string>, cookie?: string) {
    const form = new FormData();
    form.set(actionId, "");
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return fetch(`${base}${path}`, { method: "POST", body: form, headers: { Origin: base!, ...(cookie ? { Cookie: cookie } : {}) }, redirect: "manual" });
  }
  async function actionId(path: string, cookie?: string, first = false) {
    const response = await get(path, cookie);
    assert.equal(response.status, 200, `Form page ${path} did not load`);
    const matches = [...(await response.text()).matchAll(/name="(\$ACTION_ID_[a-f0-9]+)"/g)];
    assert.ok(matches.length, `No server action found on ${path}`);
    return matches[first ? 0 : matches.length - 1][1];
  }
  function cookieFrom(response: Response) {
    const header = response.headers.get("set-cookie") ?? "";
    assert.match(header, new RegExp(`${testCookieName}=[a-f0-9]{64}`));
    assert.match(header, /httponly/i);
    assert.match(header, /samesite=lax/i);
    return header.split(";")[0];
  }
  async function register(name: string, email: string) {
    const id = await actionId("/register");
    const response = await post("/register", id, { name, email, password, confirm: password });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/dashboard");
    return cookieFrom(response);
  }

  try {
    const citizen1 = await register("Citizen One", email1);
    const citizen2 = await register("Citizen Two", email2);
    const registerId = await actionId("/register");
    const duplicate = await post("/register", registerId, { name: "Duplicate", email: email1, password, confirm: password });
    assert.match(duplicate.headers.get("location") ?? "", /error=duplicate/);
    const invalidRegistration = await post("/register", registerId, { name: "X", email: `bad-${suffix}@example.test`, password: "short", confirm: "short" });
    assert.match(invalidRegistration.headers.get("location") ?? "", /error=invalid/);
    const user1 = await db.user.findUniqueOrThrow({ where: { email: email1 } });
    const user2 = await db.user.findUniqueOrThrow({ where: { email: email2 } });
    assert.equal(user1.role, "CITIZEN");
    assert.notEqual(user1.passwordHash, password);
    assert.equal((await get("/dashboard")).status, 307);
    assert.equal((await get("/admin", citizen1)).headers.get("location"), "/dashboard");

    const reportId = await actionId("/report", citizen1);
    const title = `Private issue ${suffix}`;
    const description = `Private description for ${suffix} that must stay hidden.`;
    const invalidReport = await post("/report", reportId, { title, category: "Streetlights", area: "Clifton", description: "short" }, citizen1);
    assert.equal(invalidReport.headers.get("location"), "/report?error=invalid");
    const rejected = await post("/report", reportId, { title, category: "Streetlights", area: "Clifton", description });
    assert.equal(rejected.status, 303);
    assert.match(rejected.headers.get("location") ?? "", /^\/login/);
    const submitted = await post("/report", reportId, { title, category: "Streetlights", area: "Clifton", description, userId: user2.id }, citizen1);
    assert.equal(submitted.status, 303);
    const reference = new URL(submitted.headers.get("location")!, base).searchParams.get("ref")!;
    const complaint = await db.complaint.findUniqueOrThrow({ where: { reference } });
    complaintId = complaint.id;
    assert.equal(complaint.userId, user1.id);
    const sessionToken = citizen1.split("=")[1];
    const session = await db.session.findUniqueOrThrow({ where: { tokenHash: createHash("sha256").update(sessionToken).digest("hex") } });
    assert.notEqual(session.tokenHash, sessionToken);

    const ownerDashboard = await (await get("/dashboard", citizen1)).text();
    const otherDashboard = await (await get("/dashboard", citizen2)).text();
    assert.ok(ownerDashboard.includes(title));
    assert.ok(!otherDashboard.includes(title));
    const publicTrack = await (await get(`/track?ref=${reference}`)).text();
    const otherTrack = await (await get(`/track?ref=${reference}`, citizen2)).text();
    const ownerTrack = await (await get(`/track?ref=${reference}`, citizen1)).text();
    for (const html of [publicTrack, otherTrack]) {
      assert.ok(html.includes("Submitted"));
      assert.ok(!html.includes(title));
      assert.ok(!html.includes(description));
      assert.ok(!html.includes("Clifton"));
    }
    assert.ok(ownerTrack.includes(title));
    assert.ok(ownerTrack.includes(description));

    await db.user.create({ data: { name: "Test Admin", email: adminEmail, passwordHash: await hashPassword(password), role: "ADMIN" } });
    const volunteerUser = await db.user.create({ data: { name: "Test Volunteer", email: volunteerEmail, passwordHash: await hashPassword(password), role: "VOLUNTEER" } });
    await db.volunteerApplication.create({ data: { userId: volunteerUser.id, fullName: "Test Volunteer", district: "East", serviceArea: "Gulshan", contactPhone: "+923001234567", contactEmail: volunteerEmail, skills: "Field visits", availability: "Weekends", status: "APPROVED" } });
    const loginId = await actionId("/login");
    const adminLogin = await post("/login", loginId, { email: adminEmail, password, next: "" });
    assert.equal(adminLogin.headers.get("location"), "/admin");
    const adminCookie = cookieFrom(adminLogin);
    const adminPage = await (await get("/admin", adminCookie)).text();
    assert.ok(adminPage.includes(title));
    const adminCase = await (await get(`/admin/cases/${complaint.id}`, adminCookie)).text();
    assert.ok(adminCase.includes(email1));
    assert.equal((await get(`/admin/cases/${complaint.id}`, citizen2)).headers.get("location"), "/dashboard");
    assert.equal((await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } })).status, "SUBMITTED");
    const volunteerLogin = await post("/login", loginId, { email: volunteerEmail, password, next: "" });
    assert.equal(volunteerLogin.headers.get("location"), "/volunteer");
    const volunteerCookie = cookieFrom(volunteerLogin);
    assert.equal((await get("/volunteer", volunteerCookie)).status, 200);
    assert.ok(!(await (await get(`/track?ref=${reference}`, volunteerCookie)).text()).includes(title));

    for (let index = 0; index < 5; index++) await post("/login", loginId, { email: email2, password: "wrong password", next: "" });
    const locked = await post("/login", loginId, { email: email2, password, next: "" });
    assert.match(locked.headers.get("location") ?? "", /error=locked/);
    const token2 = citizen2.split("=")[1];
    await db.session.updateMany({ where: { tokenHash: createHash("sha256").update(token2).digest("hex") }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.match((await get("/dashboard", citizen2)).headers.get("location") ?? "", /^\/login/);
    const logoutId = await actionId("/dashboard", citizen1, true);
    const logout = await post("/dashboard", logoutId, {}, citizen1);
    assert.equal(logout.headers.get("location"), "/login?loggedOut=1");
    assert.match((await get("/dashboard", citizen1)).headers.get("location") ?? "", /^\/login/);
    assert.equal(await db.session.count({ where: { id: session.id } }), 0);
  } finally {
    if (complaintId) await db.complaint.deleteMany({ where: { id: complaintId } });
    await db.user.deleteMany({ where: { email: { in: [email1, email2, adminEmail, volunteerEmail] } } });
    await db.loginThrottle.deleteMany({ where: { email: { in: [email1, email2] } } });
    await db.$disconnect();
  }
});
