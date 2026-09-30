/* eslint-disable @typescript-eslint/no-require-imports -- This is a CommonJS release tool. */
"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");
if (process.env.NODE_ENV !== "production") throw new Error("Production mode is required.");
process.chdir(__dirname);
process.env.BEHTAR_PRODUCTION = "1";
require("./production-preflight.cjs").assertProductionIsolation();
const action = process.argv[2];
if (!(["status", "deploy"].includes(action)) || process.argv.length !== 3) throw new Error("Use only status or deploy.");
const cli = path.join(__dirname, "node_modules", "prisma", "build", "index.js");
const schema = path.join(__dirname, "prisma", "schema.prisma");
const result = spawnSync(process.execPath, [cli, "migrate", action, "--schema", schema], { cwd: __dirname, env: process.env, stdio: "inherit" });
if (result.error) throw new Error("Prisma migration CLI could not start.");
process.exitCode = result.status ?? 1;
