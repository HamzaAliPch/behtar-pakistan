import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { publicDonationsEnabled } from "../src/lib/donation-availability";
import { proxy } from "../src/proxy";

test("donation collection requires explicit launch and is always off in friend mode", () => {
  const old = { friend: process.env.FRIEND_TEST_MODE, enabled: process.env.PUBLIC_DONATIONS_ENABLED };
  try {
    delete process.env.FRIEND_TEST_MODE;
    delete process.env.PUBLIC_DONATIONS_ENABLED;
    assert.equal(publicDonationsEnabled(), false);
    process.env.PUBLIC_DONATIONS_ENABLED = "1";
    assert.equal(publicDonationsEnabled(), true);
    process.env.FRIEND_TEST_MODE = "1";
    assert.equal(publicDonationsEnabled(), false);
  } finally {
    if (old.friend === undefined) delete process.env.FRIEND_TEST_MODE; else process.env.FRIEND_TEST_MODE = old.friend;
    if (old.enabled === undefined) delete process.env.PUBLIC_DONATIONS_ENABLED; else process.env.PUBLIC_DONATIONS_ENABLED = old.enabled;
  }
});

test("test hostname cannot reach the non-isolated application", () => {
  const previous = process.env.FRIEND_TEST_MODE;
  try {
    delete process.env.FRIEND_TEST_MODE;
    const response = proxy(new NextRequest("http://127.0.0.1:3000/", { headers: { host: "test.socialautomation.my.id" } }));
    assert.equal(response.status, 421);
  } finally {
    if (previous === undefined) delete process.env.FRIEND_TEST_MODE; else process.env.FRIEND_TEST_MODE = previous;
  }
});
