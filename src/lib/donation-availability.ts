// Public collection needs an explicit owner-controlled launch switch in addition
// to the existing per-wallet admin verification. Test mode can never collect.
export function publicDonationsEnabled(): boolean {
  return process.env.FRIEND_TEST_MODE !== "1" && process.env.PUBLIC_DONATIONS_ENABLED === "1";
}
