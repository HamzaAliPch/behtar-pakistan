/* eslint-disable @typescript-eslint/no-require-imports -- Cron invokes this CommonJS entrypoint. */
// One bounded invocation. Use only from cPanel cron, never as a web startup file.
"use strict";
if (process.env.NODE_ENV !== "production") throw new Error("Production mode is required.");
process.chdir(__dirname);
process.env.BEHTAR_PRODUCTION = "1";
require("./production-preflight.cjs").assertProductionIsolation();
require("./notification-worker.cjs");
