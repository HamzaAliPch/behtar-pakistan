// CommonJS preload runs before tsx; import syntax is unavailable here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const os = require("node:os");
const original = os.userInfo;
os.userInfo = function (options) {
  try { return original(options); }
  catch (error) {
    if (error?.code !== "ERR_SYSTEM_ERROR" || error?.info?.code !== "ENOMEM") throw error;
    return { username: "friend-test-local", uid: -1, gid: -1, shell: null, homedir: process.cwd() };
  }
};
