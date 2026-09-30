import { createTransport } from "nodemailer";
import { validEmail } from "@/lib/auth/validation";
import { relayConfiguration, smtpConfiguration, type SmtpConfig } from "./config";

export type TransactionalEmail = { to: string; subject: string; text: string };
type SmtpClient = {
  sendMail(message: { from: { name: string; address: string }; to: string; subject: string; text: string }): Promise<{ accepted: string[] }>;
  verify(): Promise<void>;
  close(): void;
};
export type SmtpFactory = (config: SmtpConfig) => SmtpClient;

const defaultSmtpFactory: SmtpFactory = config => {
  const transport = createTransport({
    host: config.host, port: config.port, secure: config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    tls: { servername: config.host, rejectUnauthorized: true },
    logger: false, debug: false,
  });
  return {
    async sendMail(message) { const result = await transport.sendMail(message); return { accepted: result.accepted as string[] }; },
    async verify() { await transport.verify(); },
    close() { transport.close(); },
  };
};

function validMessage(message: TransactionalEmail) {
  return validEmail(message.to) && message.subject.length > 0 && message.subject.length <= 160 && !/[\r\n]/.test(message.subject)
    && message.text.length > 0 && message.text.length <= 10_000;
}

export async function sendSmtpEmail(config: SmtpConfig, message: TransactionalEmail, factory: SmtpFactory = defaultSmtpFactory) {
  if (!validMessage(message)) throw new Error("Invalid transactional email.");
  const client = factory(config);
  try {
    const result = await client.sendMail({ from: { name: config.fromName, address: config.from }, ...message });
    if (!result.accepted.some(address => address.toLowerCase() === message.to.toLowerCase())) throw new Error("SMTP recipient not accepted.");
  } catch {
    throw new Error("Transactional email delivery failed.");
  } finally { client.close(); }
}

export async function verifySmtpConnection(config: SmtpConfig, factory: SmtpFactory = defaultSmtpFactory) {
  const client = factory(config);
  try { await client.verify(); }
  catch { throw new Error("SMTP connection or authentication failed."); }
  finally { client.close(); }
}

export async function sendTransactionalEmail(message: TransactionalEmail) {
  if (!validMessage(message)) throw new Error("Invalid transactional email.");
  if (process.env.NOTIFICATION_PROVIDER_MODE === "smtp") {
    const config = smtpConfiguration();
    if (!config) throw new Error("Transactional email is not configured.");
    return sendSmtpEmail(config, message);
  }
  const relay = relayConfiguration();
  if (!relay) throw new Error("Transactional email is not configured.");
  try {
    const response = await fetch(relay.endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${relay.secret}` }, body: JSON.stringify(message) });
    if (!response.ok) throw new Error("Relay rejected message.");
  } catch { throw new Error("Transactional email delivery failed."); }
}
