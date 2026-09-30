import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { assertFriendTestIsolation } from "../src/lib/friend-test-safety";
import { privateStoragePath } from "../src/lib/private-storage";
import { proxy } from "../src/proxy";
import { submitDonation } from "../src/lib/donations";

test("friend mode rejects main paths, unexpected hosts and donation claims", async () => {
  const old = { mode: process.env.FRIEND_TEST_MODE, db: process.env.DATABASE_URL, root: process.env.PRIVATE_UPLOAD_ROOT };
  const friendRoot = path.resolve(process.cwd(), "runtime", "friend-test", "uploads");
  try {
    process.env.FRIEND_TEST_MODE = "1";
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.PRIVATE_UPLOAD_ROOT = friendRoot;
    assert.throws(assertFriendTestIsolation, /database path/);
    process.env.DATABASE_URL = "file:./friend-test.db";
    process.env.PRIVATE_UPLOAD_ROOT = path.resolve(process.cwd(), "private_uploads");
    assert.throws(assertFriendTestIsolation, /upload path/);
    process.env.PRIVATE_UPLOAD_ROOT = friendRoot;
    assert.doesNotThrow(assertFriendTestIsolation);
    assert.throws(() => privateStoragePath("..", "dev.db"), /Invalid private storage path/);
    const unknown = proxy(new NextRequest("http://127.0.0.1:3101/", { headers: { host: "socialautomation.my.id" } }));
    assert.equal(unknown.status, 421);
    const badOrigin = proxy(new NextRequest("http://127.0.0.1:3101/api/reports", { method: "POST", headers: { host: "test.socialautomation.my.id", origin: "https://socialautomation.my.id" } }));
    assert.equal(badOrigin.status, 403);
    const absentOrigin = proxy(new NextRequest("http://127.0.0.1:3101/api/reports", { method: "POST", headers: { host: "test.socialautomation.my.id" } }));
    assert.equal(absentOrigin.status, 403);
    await assert.rejects(submitDonation({ walletId: "anything", amount: "500", transactionReference: "TEST-123456", receipt: null }), /forbidden/);
  } finally {
    for (const [key, value] of [["FRIEND_TEST_MODE", old.mode], ["DATABASE_URL", old.db], ["PRIVATE_UPLOAD_ROOT", old.root]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
