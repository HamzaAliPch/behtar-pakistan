/* eslint-disable @typescript-eslint/no-require-imports -- Packaged host preflight runs as CommonJS. */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { getBinaryTargetForCurrentPlatform } = require("@prisma/get-platform");

// These are the Linux/OpenSSL targets included in the approved release build.
const supportedTargets = new Set([
  "debian-openssl-1.1.x",
  "debian-openssl-3.0.x",
  "rhel-openssl-1.1.x",
  "rhel-openssl-3.0.x",
]);

function assertPackagedPrismaPlatform(artifactRoot, target, hostPlatform = process.platform) {
  if (hostPlatform !== "linux" || !supportedTargets.has(target)) {
    throw new Error(`Unsupported Prisma host platform/OpenSSL target: ${target}.`);
  }
  const engineFiles = [
    path.join(artifactRoot, "node_modules", ".prisma", "client", `libquery_engine-${target}.so.node`),
    path.join(artifactRoot, "node_modules", "@prisma", "engines", `schema-engine-${target}`),
  ];
  for (const file of engineFiles) {
    let stat;
    try { stat = fs.lstatSync(file); } catch { throw new Error(`No packaged Prisma engines for host platform ${target}.`); }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`No packaged Prisma engines for host platform ${target}.`);
  }
  return target;
}

async function detectAndAssertPackagedPrismaPlatform(artifactRoot) {
  const target = await getBinaryTargetForCurrentPlatform();
  return assertPackagedPrismaPlatform(artifactRoot, target);
}

module.exports = { assertPackagedPrismaPlatform, detectAndAssertPackagedPrismaPlatform };
