import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleTrackingEvents } from "../src/lib/public-timeline";

test("public tracking hides actor identity and owner-only events", () => {
  const events = [
    { visibility: "PUBLIC", actor: { name: "Private Citizen" }, summary: "Report received" },
    { visibility: "OWNER", actor: { name: "Case worker" }, summary: "Private response" },
    { visibility: "INTERNAL", actor: { name: "Admin" }, summary: "Internal note" },
  ];
  const publicEvents = visibleTrackingEvents(events, null, false);
  assert.deepEqual(publicEvents, [{ visibility: "PUBLIC", actor: null, summary: "Report received" }]);
  assert.equal(visibleTrackingEvents(events, { role: "CITIZEN" }, true).length, 2);
  assert.equal(visibleTrackingEvents(events, { role: "ADMIN" }, false).length, 3);
});
