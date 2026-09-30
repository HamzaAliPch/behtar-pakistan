import assert from "node:assert/strict";
import { test } from "node:test";
import { canViewComplaint, isComplaintOwner } from "../src/lib/auth/permissions";
import { canReadEvidence } from "../src/lib/operations/evidence";
import { parseTaskDeadline } from "../src/lib/operations/task-deadline";

test("complaint ownership follows submitter identity across role changes", () => {
  const id = "submitter";
  for (const role of ["CITIZEN", "VOLUNTEER", "ADMIN", "CITY_MANAGER"] as const) {
    assert.equal(isComplaintOwner({ id, role }, id), true);
    assert.equal(canViewComplaint({ id, role }, id), true);
    assert.equal(isComplaintOwner({ id: "other", role }, id), false);
  }
  assert.equal(canViewComplaint({ id: "other", role: "VOLUNTEER" }, id), false);
  assert.equal(canViewComplaint(null, id), false);
  assert.equal(canViewComplaint({ id, role: "VOLUNTEER" }, null), false);
});

test("owner-visible evidence stays with the submitter after a role change", async () => {
  const evidence = { visibility: "OWNER", complaint: { userId: "submitter", cityId: null }, task: null };
  assert.equal(await canReadEvidence({ id: "submitter", role: "VOLUNTEER" }, evidence), true);
  assert.equal(await canReadEvidence({ id: "submitter", role: "CITY_MANAGER" }, evidence), true);
  assert.equal(await canReadEvidence({ id: "other", role: "CITIZEN" }, evidence), false);
  assert.equal(await canReadEvidence(null, evidence), false);
});

test("guided task deadline accepts typed local time and rejects invalid or past dates", () => {
  const now = new Date(2026, 8, 27, 12, 0);
  assert.ok(parseTaskDeadline("2026-09-29 18:00", now));
  assert.ok(parseTaskDeadline("2026-09-29T18:00", now));
  assert.ok(parseTaskDeadline("2026-09-29T18:00:00.000Z", now));
  for (const value of ["", "tomorrow", "2026-09-31 18:00", "2026-09-29 25:00", "2026-09-27 10:00"]) {
    assert.equal(parseTaskDeadline(value, now), null, value);
  }
});
