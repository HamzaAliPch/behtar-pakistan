/* eslint-disable @typescript-eslint/no-require-imports -- cPanel invokes this CommonJS entrypoint. */
// One-time, operator-invoked; not a public endpoint.
"use strict";
if (process.env.NODE_ENV !== "production") throw new Error("Production mode is required.");
process.chdir(__dirname);
process.env.BEHTAR_PRODUCTION = "1";
require("./production-preflight.cjs").assertProductionIsolation();
require("./admin-provision-bundle.cjs");
