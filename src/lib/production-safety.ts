import fs from "node:fs";
import path from "node:path";
import { passwordResetPublicOrigin, smtpConfiguration } from "./email/config";

function privatePath(value: string | undefined, label: string): string {
  if (!value || !path.isAbsolute(value)) throw new Error(`${label} must be an explicit absolute private path.`);
  const resolved = path.resolve(value);
  const segments = resolved.split(path.sep).map(segment => segment.toLowerCase());
  if (segments.includes("public_html") || segments.includes("www")) throw new Error(`${label} must be outside the web document root.`);
  const parent = fs.realpathSync(path.dirname(resolved));
  const actual = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
  if ([parent, actual].some(candidate => candidate.split(path.sep).some(segment => ["public_html", "www"].includes(segment.toLowerCase())))) throw new Error(`${label} resolves inside the web document root.`);
  const appRoot = fs.realpathSync(process.cwd());
  if ([parent, actual].some(candidate => candidate === appRoot || candidate.startsWith(appRoot + path.sep))) throw new Error(`${label} must be outside the application artifact.`);
  return actual;
}

/** Fail closed before any Prisma connection or private upload is opened. */
export function assertProductionIsolation(): void {
  if (process.env.BEHTAR_PRODUCTION !== "1") return;
  if (process.env.NODE_ENV !== "production" || process.env.FRIEND_TEST_MODE === "1" || process.env.AUTH_TEST_MODE === "1") throw new Error("Invalid production mode.");
  const url = process.env.DATABASE_URL ?? "";
  const windowsSmokeUrl = process.platform === "win32" && process.env.CPANEL_LOCAL_SMOKE === "1" && /^file:[A-Za-z]:\//.test(url);
  if ((!url.startsWith("file:/") && !windowsSmokeUrl) || url.startsWith("file://")) throw new Error("DATABASE_URL must be an absolute local SQLite file URL.");
  let dbPath: string;
  try { dbPath = decodeURIComponent(url.slice(5)); } catch { throw new Error("Invalid DATABASE_URL encoding."); }
  if (process.platform === "win32" && /^\/[A-Za-z]:\//.test(dbPath)) dbPath = dbPath.slice(1);
  if (!path.isAbsolute(dbPath) || !/\.(?:db|sqlite|sqlite3)$/i.test(dbPath)) throw new Error("Invalid production SQLite path.");
  const database = privatePath(dbPath, "DATABASE_URL");
  if (/^(?:dev|friend-test|auth-test)\.(?:db|sqlite|sqlite3)$/i.test(path.basename(database))) throw new Error("A test or development database cannot be used in production.");
  const uploads = privatePath(process.env.PRIVATE_UPLOAD_ROOT, "PRIVATE_UPLOAD_ROOT");
  if (!fs.existsSync(uploads) || !fs.statSync(uploads).isDirectory()) throw new Error("PRIVATE_UPLOAD_ROOT must be an existing directory.");
  if (database === uploads || database.startsWith(uploads + path.sep)) throw new Error("Database and upload paths must be separate.");
  if (process.env.PUBLIC_DONATIONS_ENABLED !== "0" || process.env.NOTIFICATION_WEBHOOK_ENABLED !== "0") throw new Error("Unapproved public payment or external messaging setting.");
  if (process.env.NOTIFICATION_PROVIDER_MODE !== "disabled" && (process.env.NOTIFICATION_PROVIDER_MODE !== "smtp" || !smtpConfiguration() || !passwordResetPublicOrigin())) throw new Error("SMTP configuration or HTTPS reset origin is incomplete, or another external provider is unapproved.");
}
