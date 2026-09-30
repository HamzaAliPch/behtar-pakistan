import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertProductionIsolation } from "../src/lib/production-safety";

const require = createRequire(import.meta.url);
// The packaged host preflight is intentionally a CommonJS entrypoint.
const { assertPackagedPrismaPlatform, detectAndAssertPackagedPrismaPlatform } = require("../cpanel-prisma-platform.cjs") as {
  assertPackagedPrismaPlatform: (root: string, target: string, platform?: string) => string;
  detectAndAssertPackagedPrismaPlatform: (root: string) => Promise<string>;
};

test("host preflight requires the exact Linux/OpenSSL client and CLI engines", () => {
  const artifact = mkdtempSync(path.join(os.tmpdir(), "behtar-prisma-host-"));
  const client = path.join(artifact, "node_modules", ".prisma", "client");
  const cli = path.join(artifact, "node_modules", "@prisma", "engines");
  mkdirSync(client, { recursive: true });
  mkdirSync(cli, { recursive: true });
  try {
    for (const target of ["debian-openssl-1.0.x", "debian-openssl-1.1.x", "debian-openssl-3.0.x", "rhel-openssl-1.1.x", "rhel-openssl-3.0.x"]) {
      const clientEngine = path.join(client, `libquery_engine-${target}.so.node`);
      const cliEngine = path.join(cli, `schema-engine-${target}`);
      writeFileSync(clientEngine, "[QA TEST] engine fixture");
      assert.throws(() => assertPackagedPrismaPlatform(artifact, target, "linux"), /No packaged Prisma engines/);
      writeFileSync(cliEngine, "[QA TEST] engine fixture");
      assert.equal(assertPackagedPrismaPlatform(artifact, target, "linux"), target);
      rmSync(clientEngine);
      assert.throws(() => assertPackagedPrismaPlatform(artifact, target, "linux"), /No packaged Prisma engines/);
      writeFileSync(clientEngine, "[QA TEST] engine fixture");
      assert.throws(() => assertPackagedPrismaPlatform(artifact, target, "win32"), /Unsupported Prisma host/);
    }
    for (const target of ["windows", "rhel-openssl-1.0.x", "linux-musl-openssl-3.0.x"]) {
      assert.throws(() => assertPackagedPrismaPlatform(artifact, target, "linux"), /Unsupported Prisma host/);
    }
  } finally { rmSync(artifact, { recursive: true, force: true }); }
});

test("host preflight calls Prisma's supported runtime platform detector", async () => {
  assert.equal(typeof detectAndAssertPackagedPrismaPlatform, "function");
  if (process.platform !== "linux") {
    await assert.rejects(detectAndAssertPackagedPrismaPlatform(path.resolve(".")), /Unsupported Prisma host/);
  }
});

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
