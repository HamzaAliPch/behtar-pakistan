import assert from "node:assert/strict";
import test from "node:test";
import { passwordRecoveryAvailable } from "../src/lib/auth/password-recovery";
import { relayConfiguration, smtpConfiguration } from "../src/lib/email/config";
import { sendSmtpEmail, verifySmtpConnection, type SmtpFactory } from "../src/lib/email/transport";

const keys = ["NODE_ENV", "BEHTAR_PRODUCTION", "FRIEND_TEST_MODE", "AUTH_TEST_MODE", "NOTIFICATION_PROVIDER_MODE", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "SMTP_FROM_NAME", "PASSWORD_RESET_PUBLIC_ORIGIN", "PASSWORD_RESET_DELIVERY_URL", "PASSWORD_RESET_DELIVERY_SECRET"] as const;

test("SMTP reset delivery is explicit, production-only and preserves the HTTPS relay", () => {
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, {
      NODE_ENV: "production", BEHTAR_PRODUCTION: "1", FRIEND_TEST_MODE: "0", AUTH_TEST_MODE: "0",
      NOTIFICATION_PROVIDER_MODE: "disabled", SMTP_HOST: "mail.privateemail.com", SMTP_PORT: "465", SMTP_SECURE: "true",
      SMTP_USER: "no-reply@behtarpakistan.org", SMTP_PASSWORD: "[QA TEST] mock-only credential", SMTP_FROM: "no-reply@behtarpakistan.org", SMTP_FROM_NAME: "Behtar Pakistan",
      PASSWORD_RESET_PUBLIC_ORIGIN: "https://behtarpakistan.org", PASSWORD_RESET_DELIVERY_URL: "https://relay.example.test/reset-email", PASSWORD_RESET_DELIVERY_SECRET: "[QA TEST] mock-only-relay-secret-32-chars",
    });
    assert.equal(smtpConfiguration(), null);
    assert.ok(relayConfiguration());
    assert.equal(passwordRecoveryAvailable(), true);
    process.env.NOTIFICATION_PROVIDER_MODE = "smtp";
    assert.ok(smtpConfiguration());
    assert.equal(relayConfiguration(), null);
    assert.equal(passwordRecoveryAvailable(), true);
    process.env.SMTP_SECURE = "false";
    assert.equal(passwordRecoveryAvailable(), false);
    process.env.SMTP_SECURE = "true";
    process.env.SMTP_FROM = "other@behtarpakistan.org";
    assert.equal(smtpConfiguration(), null);
    process.env.SMTP_FROM = "no-reply@behtarpakistan.org";
    process.env.AUTH_TEST_MODE = "1";
    assert.equal(smtpConfiguration(), null);
    assert.equal(passwordRecoveryAvailable(), false);
  } finally {
    for (const key of keys) { const value = original[key]; if (value === undefined) delete process.env[key]; else Object.assign(process.env, { [key]: value }); }
  }
});

test("mock SMTP transport sends only to the requested recipient and masks failures", async () => {
  const config = { host: "mail.privateemail.com", port: 465 as const, secure: true as const, user: "no-reply@behtarpakistan.org", password: "[QA TEST] mock-only credential", from: "no-reply@behtarpakistan.org", fromName: "Behtar Pakistan" };
  const messages: Array<{ to: string; subject: string; text: string }> = [];
  let verified = 0, closed = 0;
  const factory: SmtpFactory = () => ({
    async sendMail(message) { messages.push(message); return { accepted: [message.to] }; },
    async verify() { verified++; },
    close() { closed++; },
  });
  await verifySmtpConnection(config, factory);
  await sendSmtpEmail(config, { to: "qa@example.test", subject: "[QA TEST] Test", text: "No private data." }, factory);
  assert.equal(verified, 1);
  assert.equal(closed, 2);
  assert.deepEqual(messages.map(item => item.to), ["qa@example.test"]);
  assert.equal(messages[0].text, "No private data.");
  const failing: SmtpFactory = () => ({
    async sendMail() { throw new Error(`secret=${config.password}`); },
    async verify() { throw new Error(`secret=${config.password}`); },
    close() { closed++; },
  });
  await assert.rejects(sendSmtpEmail(config, { to: "qa@example.test", subject: "Test", text: "Safe" }, failing), error => error instanceof Error && error.message === "Transactional email delivery failed.");
  await assert.rejects(verifySmtpConnection(config, failing), error => error instanceof Error && error.message === "SMTP connection or authentication failed.");
  await assert.rejects(sendSmtpEmail(config, { to: "qa@example.test", subject: "Injected\r\nBcc: other@example.test", text: "Safe" }, factory), /Invalid transactional email/);
  assert.equal(messages.length, 1);
});
