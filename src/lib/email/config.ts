import { validEmail } from "@/lib/auth/validation";

export type SmtpConfig = { host: string; port: 465; secure: true; user: string; password: string; from: string; fromName: string };
export type RelayConfig = { endpoint: string; secret: string };

function externalDeliveryAllowed() {
  return process.env.FRIEND_TEST_MODE !== "1" && process.env.AUTH_TEST_MODE !== "1";
}

export function smtpConfiguration(): SmtpConfig | null {
  if (!externalDeliveryAllowed() || process.env.NODE_ENV !== "production" || process.env.BEHTAR_PRODUCTION !== "1" || process.env.NOTIFICATION_PROVIDER_MODE !== "smtp") return null;
  const host = process.env.SMTP_HOST ?? "", user = process.env.SMTP_USER ?? "";
  const password = process.env.SMTP_PASSWORD ?? "", from = process.env.SMTP_FROM ?? "";
  const fromName = process.env.SMTP_FROM_NAME ?? "";
  if (host !== "mail.privateemail.com" || process.env.SMTP_PORT !== "465" || process.env.SMTP_SECURE !== "true") return null;
  if (!validEmail(user) || !validEmail(from) || user.toLowerCase() !== from.toLowerCase() || !password || /[\r\n]/.test(password) || /^(?:SET_|REPLACE_|YOUR_)/i.test(password)) return null;
  if (!fromName || fromName.length > 80 || /[\r\n]/.test(fromName)) return null;
  return { host, port: 465, secure: true, user, password, from, fromName };
}

export function relayConfiguration(): RelayConfig | null {
  if (!externalDeliveryAllowed() || process.env.NOTIFICATION_PROVIDER_MODE === "smtp") return null;
  try {
    const endpoint = new URL(process.env.PASSWORD_RESET_DELIVERY_URL ?? "");
    const secret = process.env.PASSWORD_RESET_DELIVERY_SECRET ?? "";
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash || secret.length < 32) return null;
    return { endpoint: endpoint.toString(), secret };
  } catch { return null; }
}

export function transactionalEmailAvailable() {
  return process.env.NOTIFICATION_PROVIDER_MODE === "smtp" ? smtpConfiguration() !== null : relayConfiguration() !== null;
}

export function passwordResetPublicOrigin(): string | null {
  try {
    const origin = new URL(process.env.PASSWORD_RESET_PUBLIC_ORIGIN ?? "");
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return null;
    return origin.origin;
  } catch { return null; }
}
