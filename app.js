/* eslint-disable @typescript-eslint/no-require-imports -- Passenger loads this CommonJS entrypoint. */
// Copy beside Next's generated standalone server.js as the cPanel startup file.
// Passenger supplies PORT via reverse port binding; never hardcode a public port.
"use strict";
if (process.env.NODE_ENV !== "production") throw new Error("Production mode is required.");
process.chdir(__dirname);
process.env.BEHTAR_PRODUCTION = "1";
require("./production-preflight.cjs").assertProductionIsolation();
require("./server.js");
