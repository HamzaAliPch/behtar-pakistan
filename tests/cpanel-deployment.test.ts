import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertProductionIsolation } from "../src/lib/production-safety";

test("production startup rejects default, public and test data paths", () => {
  const original = Object.fromEntries(["BEHTAR_PRODUCTION", "NODE_ENV", "FRIEND_TEST_MODE", "AUTH_TEST_MODE", "CPANEL_LOCAL_SMOKE", "DATABASE_URL", "PRIVATE_UPLOAD_ROOT", "PUBLIC_DONATIONS_ENABLED", "NOTIFICATION_PROVIDER_MODE", "NOTIFICATION_WEBHOOK_ENABLED"].map(key => [key, process.env[key]]));
  const privateRoot = mkdtempSync(path.join(os.tmpdir(), "behtar-cpanel-"));
  const uploads = path.join(privateRoot, "uploads");
  mkdirSync(uploads);
  const url = (filename: string) => `file:${path.join(privateRoot, filename).replaceAll("\\", "/")}`;
  try {
    process.env.BEHTAR_PRODUCTION = "1";
    process.env.CPANEL_LOCAL_SMOKE = "1";
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.FRIEND_TEST_MODE = "0";
    process.env.AUTH_TEST_MODE = "0";
    process.env.PRIVATE_UPLOAD_ROOT = uploads;
    process.env.PUBLIC_DONATIONS_ENABLED = "0";
    process.env.NOTIFICATION_PROVIDER_MODE = "disabled";
    process.env.NOTIFICATION_WEBHOOK_ENABLED = "0";
    process.env.DATABASE_URL = "file:./dev.db";
    assert.throws(assertProductionIsolation, /absolute local SQLite/);
    process.env.DATABASE_URL = url("friend-test.db");
    assert.throws(assertProductionIsolation, /test or development/);
    process.env.DATABASE_URL = url("production.db");
    assert.doesNotThrow(assertProductionIsolation);
    const publicRoot = path.join(privateRoot, "public_html");
    mkdirSync(publicRoot);
    process.env.PRIVATE_UPLOAD_ROOT = publicRoot;
    assert.throws(assertProductionIsolation, /web document root/);
    process.env.PRIVATE_UPLOAD_ROOT = uploads;
    process.env.PUBLIC_DONATIONS_ENABLED = "1";
    assert.throws(assertProductionIsolation, /Unapproved/);
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    rmSync(privateRoot, { recursive: true, force: true });
  }
});

test("cPanel artifact scan rejects private and QA files before packaging", () => {
  const artifact = mkdtempSync(path.join(os.tmpdir(), "behtar-artifact-check-"));
  const scanner = path.resolve("scripts/verify-cpanel-artifact.mjs");
  try {
    for (const filename of [".env", "friend-test.db", "qa-uploads.db-wal"]) {
      writeFileSync(path.join(artifact, filename), "[QA TEST] disposable fixture");
      const result = spawnSync(process.execPath, [scanner, artifact, "--local-smoke"], { cwd: path.resolve("."), encoding: "utf8" });
      assert.notEqual(result.status, 0, `${filename} was accepted`);
      assert.match(result.stderr, /private, QA, credential or database file/);
      rmSync(path.join(artifact, filename));
    }
  } finally { rmSync(artifact, { recursive: true, force: true }); }
});
