// The integration suite can target either Next's dev or production server.
export const testCookieName = process.env.AUTH_TEST_PRODUCTION === "1" ? "__Host-kfx_session" : "kfx_session";
