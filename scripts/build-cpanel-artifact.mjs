import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localSmoke = process.argv.includes("--local-smoke");
if (process.platform !== "linux" && !localSmoke) throw new Error("Release artifacts must be built on Linux; --local-smoke is never deployable.");
if (!localSmoke && process.versions.node !== "22.23.2") throw new Error("Build with Node.js 22.23.2 to match Stellar.");
if (!localSmoke && readdirSync(root).some(name => /^\.env(?:\..*)?$/i.test(name) && name !== ".env.example")) throw new Error("Remove private local .env files from the clean Linux build checkout.");
const scratch = path.join(root, "runtime", "cpanel-build");
const artifacts = path.join(scratch, "artifact");
const uploads = path.join(scratch, "uploads");
mkdirSync(uploads, { recursive: true });
// A brand-new disposable SQLite database used only during prerendering.
const database = path.join(scratch, "build-only.db");
if (existsSync(database) && !localSmoke) throw new Error("Build-only database already exists. Move it aside manually before a new build; no data is deleted automatically.");
if (!existsSync(database)) writeFileSync(database, "", { flag: "wx" });
const dbUrl = process.platform === "win32" ? `file:../runtime/cpanel-build/build-only.db` : `file:${database}`;
const nonsecretEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/(?:PASSWORD|TOKEN|SECRET|PRIVATE_KEY|API_KEY|ADMIN_EMAIL|DONATION_CANDIDATE_NUMBER|SMTP_)/i.test(name)));
const env = { ...nonsecretEnvironment, CPANEL_STANDALONE_BUILD: "1", BEHTAR_PRODUCTION: "0", FRIEND_TEST_MODE: "0", AUTH_TEST_MODE: "0", DATABASE_URL: dbUrl, PRIVATE_UPLOAD_ROOT: uploads, PUBLIC_DONATIONS_ENABLED: "0", NOTIFICATION_PROVIDER_MODE: "disabled", NOTIFICATION_WEBHOOK_ENABLED: "0", NODE_ENV: "production" };
const gitStatus = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
if (gitStatus.status !== 0) throw new Error("Git source status is unavailable.");
if (!localSmoke && gitStatus.stdout.trim()) throw new Error("Commit and review source changes before producing a deployable artifact.");
function run(file, args) {
  const result = spawnSync(process.execPath, [file, ...args], { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed with exit ${result.status ?? "unknown"}.`);
}
run(path.join(root, "node_modules", "prisma", "build", "index.js"), ["migrate", "deploy"]);
// On Windows, running web processes can lock the existing native engine DLL.
// A deployable Linux build must always generate its own Linux engine.
if (!localSmoke) run(path.join(root, "node_modules", "prisma", "build", "index.js"), ["generate"]);
run(path.join(root, "node_modules", "next", "dist", "bin", "next"), ["build"]);
const standalone = path.join(root, ".next", "standalone");
if (!existsSync(path.join(standalone, "server.js"))) throw new Error("Next.js standalone output is missing.");
if (existsSync(artifacts)) throw new Error("Artifact directory already exists. Archive or move it manually; this script will not replace it.");
cpSync(standalone, artifacts, { recursive: true, dereference: true, filter(source) {
  // Next may trace dependencies as links back to the build checkout. Copy the
  // actual package bytes so the uploaded ZIP has no external filesystem links.
  if (lstatSync(source).isSymbolicLink()) {
    const target = realpathSync(source);
    if (!target.startsWith(path.join(root, "node_modules") + path.sep) && !target.startsWith(standalone + path.sep)) throw new Error("Unexpected standalone symlink target.");
  }
  const parts = path.relative(standalone, source).split(path.sep).map(part => part.toLowerCase());
  const leaf = parts.at(-1) ?? "";
  return !["runtime", "private_uploads", ".next-friend-test", ".next-auth-test"].includes(parts[0])
    && !(parts[0] === "prisma" && parts[1] === "backups")
    && !/^\.env(?:\..*)?$/.test(leaf)
    && !/\.tmp\d+$/i.test(leaf)
    && !/\.(?:db|sqlite|sqlite3|pem|key)(?:$|-)/.test(leaf)
    && !/^credentials(?:\..*)?$/.test(leaf);
} });
cpSync(path.join(root, ".next", "static"), path.join(artifacts, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) cpSync(path.join(root, "public"), path.join(artifacts, "public"), { recursive: true });
// The web trace may omit runtime files used only by the separately bundled cron
// and provisioning CLIs. Copy their exact generated Prisma runtime as well.
function copyDependency(source, destination) {
  cpSync(source, destination, { recursive: true, dereference: true, filter(file) {
    if (/\.tmp\d+$/i.test(file)) return false;
    if (lstatSync(file).isSymbolicLink() && !realpathSync(file).startsWith(path.join(root, "node_modules") + path.sep)) throw new Error("Unexpected dependency symlink target.");
    return true;
  } });
}
copyDependency(path.join(root, "node_modules", "@prisma"), path.join(artifacts, "node_modules", "@prisma"));
copyDependency(path.join(root, "node_modules", ".prisma", "client"), path.join(artifacts, "node_modules", ".prisma", "client"));
copyDependency(path.join(root, "node_modules", "prisma"), path.join(artifacts, "node_modules", "prisma"));
copyDependency(path.join(root, "node_modules", "nodemailer"), path.join(artifacts, "node_modules", "nodemailer"));
cpSync(path.join(root, "app.js"), path.join(artifacts, "app.js"));
cpSync(path.join(root, "preflight-cpanel.cjs"), path.join(artifacts, "preflight-cpanel.cjs"));
cpSync(path.join(root, "cpanel-prisma-platform.cjs"), path.join(artifacts, "cpanel-prisma-platform.cjs"));
cpSync(path.join(root, "migrate-production.cjs"), path.join(artifacts, "migrate-production.cjs"));
cpSync(path.join(root, "admin-provision.cjs"), path.join(artifacts, "admin-provision.cjs"));
cpSync(path.join(root, "cron-notifications.cjs"), path.join(artifacts, "cron-notifications.cjs"));
cpSync(path.join(root, "scripts", "cpanel-notifications-cron.sh"), path.join(artifacts, "cpanel-notifications-cron.sh"));
await build({ entryPoints: [path.join(root, "src", "lib", "production-safety.ts")], outfile: path.join(artifacts, "production-preflight.cjs"), bundle: true, platform: "node", format: "cjs", target: "node22" });
await build({ entryPoints: [path.join(root, "scripts", "run-notification-worker.ts")], outfile: path.join(artifacts, "notification-worker.cjs"), bundle: true, platform: "node", format: "cjs", target: "node22", external: ["@prisma/client"] });
await build({ entryPoints: [path.join(root, "scripts", "provision-admin.ts")], outfile: path.join(artifacts, "admin-provision-bundle.cjs"), bundle: true, platform: "node", format: "cjs", target: "node22", external: ["@prisma/client"] });
await build({ entryPoints: [path.join(root, "scripts", "test-production-email.ts")], outfile: path.join(artifacts, "test-email.cjs"), bundle: true, platform: "node", format: "cjs", target: "node22", external: ["nodemailer"] });
cpSync(path.join(root, "prisma", "schema.prisma"), path.join(artifacts, "prisma", "schema.prisma"));
cpSync(path.join(root, "prisma", "migrations"), path.join(artifacts, "prisma", "migrations"), { recursive: true });
function files(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]); }
const names = files(artifacts).map(file => path.relative(artifacts, file).replaceAll("\\", "/"));
const forbidden = names.filter(name => /(^|\/)(?:\.env(?:\..*)?|private_uploads|friend-test|auth-test|backups|credentials(?:\..*)?)($|\/)|\.(?:db|sqlite|sqlite3|pem|key)(?:$|-)/i.test(name));
if (forbidden.length) throw new Error(`Artifact contains ${forbidden.length} forbidden runtime path(s).`);
if (names.some(name => /\.tmp\d+$/i.test(name))) throw new Error("Artifact contains temporary generated files.");
const engines = names.filter(name => /libquery_engine.*\.so\.node$/.test(name));
if (!localSmoke && engines.length === 0) throw new Error("Linux Prisma query engine missing from standalone artifact.");
if (!localSmoke) for (const target of ["debian-openssl-1.0.x", "debian-openssl-1.1.x", "rhel-openssl-1.1.x", "rhel-openssl-3.0.x"]) {
  if (!names.includes(`node_modules/.prisma/client/libquery_engine-${target}.so.node`) || !names.includes(`node_modules/@prisma/engines/schema-engine-${target}`)) throw new Error(`Prisma client or CLI engine missing: ${target}`);
}
if (!names.includes("node_modules/@prisma/client/runtime/library.js") || !names.includes("node_modules/.prisma/client/default.js")) throw new Error("Prisma runtime missing from standalone artifact.");
if (!names.includes("test-email.cjs") || !names.includes("node_modules/nodemailer/dist/cjs/nodemailer.js")) throw new Error("Production SMTP test command or transport missing from artifact.");
const manifest = { sourceRevision: (spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout ?? "").trim(), sourceDirty: Boolean(gitStatus.stdout.trim()), platform: process.platform, architecture: process.arch, node: process.version, deployable: process.platform === "linux" && !localSmoke, createdAt: new Date().toISOString(), startupFile: "app.js", workerFile: "cron-notifications.cjs" };
writeFileSync(path.join(artifacts, "release-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
if (readFileSync(path.join(artifacts, "server.js"), "utf8").length < 100) throw new Error("Invalid standalone server.");
console.log(`Artifact prepared at ${artifacts}; deployable=${manifest.deployable}. No existing database or uploads were copied.`);
