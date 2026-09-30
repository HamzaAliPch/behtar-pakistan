/* eslint-disable @typescript-eslint/no-require-imports -- Standalone preflight runs as CommonJS. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

process.chdir(__dirname);
process.env.BEHTAR_PRODUCTION = "1";
require("./production-preflight.cjs").assertProductionIsolation();
if (process.platform !== "linux" || process.versions.node !== "22.23.2") throw new Error("Use the approved Linux Node.js 22.23.2 runtime.");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "release-manifest.json"), "utf8"));
if (!manifest.deployable || manifest.platform !== "linux" || manifest.architecture !== process.arch || manifest.node !== process.version || manifest.sourceDirty) throw new Error("This is not a clean Linux release artifact.");
for (const file of ["app.js", "server.js", "cron-notifications.cjs", "notification-worker.cjs", "migrate-production.cjs", "production-preflight.cjs", "cpanel-prisma-platform.cjs", ".next/BUILD_ID", "prisma/schema.prisma"]) if (!fs.existsSync(path.join(__dirname, file))) throw new Error(`Missing artifact component: ${file}`);
for (const target of ["rhel-openssl-1.1.x", "rhel-openssl-3.0.x"]) for (const file of [`node_modules/.prisma/client/libquery_engine-${target}.so.node`, `node_modules/@prisma/engines/schema-engine-${target}`]) if (!fs.existsSync(path.join(__dirname, file))) throw new Error(`Missing ${target} Prisma engine.`);
for (const file of [".env", "prisma/dev.db", "prisma/friend-test.db", "prisma/auth-test.db", "private_uploads", "runtime/friend-test"]) if (fs.existsSync(path.join(__dirname, file))) throw new Error("Release artifact contains a private or development path.");
const envFile = process.env.BEHTAR_ENV_FILE;
if (!envFile || !path.isAbsolute(envFile) || !fs.existsSync(envFile) || (fs.statSync(envFile).mode & 0o077)) throw new Error("Private environment file must exist with mode 600.");
const actualEnvFile = fs.realpathSync(envFile);
if (actualEnvFile.startsWith(__dirname + path.sep) || actualEnvFile.split(path.sep).some(part => part.toLowerCase() === "public_html")) throw new Error("Private environment file must be outside the application and document roots.");
const uploadMode = fs.statSync(process.env.PRIVATE_UPLOAD_ROOT).mode;
if (uploadMode & 0o077) throw new Error("Private upload directory must have mode 700.");
const dbFile = decodeURIComponent(process.env.DATABASE_URL.slice(5));
if (!fs.existsSync(dbFile) || (fs.statSync(dbFile).mode & 0o077)) throw new Error("Production SQLite file must exist with mode 600.");
require("./cpanel-prisma-platform.cjs").detectAndAssertPackagedPrismaPlatform(__dirname).then(platform => {
  console.log(`Production paths, permissions, runtime, artifact and Prisma ${platform}: PASS (read-only). Email, SSL, resources and migration status still require separate checks.`);
}).catch(error => { console.error(error instanceof Error ? error.message : "Platform preflight failed."); process.exitCode = 1; });
