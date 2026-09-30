import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { canViewComplaint, roleHome } from "../src/lib/auth/permissions";
import { normalizeEmail, safeReturnPath, validEmail, validPassword } from "../src/lib/auth/validation";

test("passwords use salted scrypt hashes and reject wrong passwords", async () => {
  const first = await hashPassword("a long test password 123");
  const second = await hashPassword("a long test password 123");
  assert.notEqual(first, second);
  assert.ok(first.startsWith("scrypt$"));
  assert.ok(!first.includes("a long test password 123"));
  assert.equal(await verifyPassword("a long test password 123", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
  assert.equal(await verifyPassword("anything", "invalid"), false);
  assert.equal(await verifyPassword("anything", null), false);
});

test("registration values and return paths are validated", () => {
  assert.equal(normalizeEmail("  USER@Example.com "), "user@example.com");
  assert.equal(validEmail("user@example.com"), true);
  assert.equal(validEmail("not-an-email"), false);
  assert.equal(validPassword("short"), false);
  assert.equal(validPassword("twelvechars!"), true);
  assert.equal(safeReturnPath("/dashboard"), "/dashboard");
  assert.equal(safeReturnPath("//evil.example"), null);
  assert.equal(safeReturnPath("/\\evil.example"), null);
  assert.equal(safeReturnPath("https://evil.example"), null);
});

test("only an owner or admin can see private complaint details", () => {
  assert.equal(canViewComplaint(null, "owner"), false);
  assert.equal(canViewComplaint({ id: "other", role: "CITIZEN" }, "owner"), false);
  assert.equal(canViewComplaint({ id: "owner", role: "CITIZEN" }, "owner"), true);
  assert.equal(canViewComplaint({ id: "volunteer", role: "VOLUNTEER" }, "owner"), false);
  assert.equal(canViewComplaint({ id: "admin", role: "ADMIN" }, "owner"), true);
  assert.equal(canViewComplaint({ id: "owner", role: "CITIZEN" }, null), false);
  assert.equal(roleHome("ADMIN"), "/admin");
});
