import { assertProductionIsolation } from "../src/lib/production-safety";
import { validEmail } from "../src/lib/auth/validation";
import { smtpConfiguration } from "../src/lib/email/config";
import { sendTransactionalEmail, verifySmtpConnection } from "../src/lib/email/transport";

async function main() {
  if (process.env.NODE_ENV !== "production" || process.env.BEHTAR_PRODUCTION !== "1" || process.env.NOTIFICATION_PROVIDER_MODE !== "smtp") throw new Error("Production SMTP mode is required.");
  assertProductionIsolation();
  const recipient = process.env.TEST_EMAIL ?? "";
  if (!validEmail(recipient) || /[\r\n]/.test(recipient)) throw new Error("A valid TEST_EMAIL is required.");
  const config = smtpConfiguration();
  if (!config) throw new Error("Production SMTP configuration is incomplete.");
  await verifySmtpConnection(config);
  await sendTransactionalEmail({
    to: recipient,
    subject: "Behtar Pakistan SMTP delivery test",
    text: "This is the one-time Behtar Pakistan production SMTP delivery test. No account or complaint data is included.",
  });
  console.log("One production SMTP test message was accepted by the mail server. Confirm inbox receipt separately.");
}

main().catch(() => { console.error("Production SMTP test failed. Check private configuration and mail server access; no credentials were logged."); process.exitCode = 1; });
