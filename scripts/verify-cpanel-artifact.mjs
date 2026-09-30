import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifact = path.resolve(process.argv[2] ?? path.join(root, "runtime", "cpanel-build", "artifact"));
const localSmoke = process.argv.includes("--local-smoke");

function fail(message) { throw new Error(`cPanel artifact safety check: ${message}`); }
function forbidden(name, source = false) {
  const parts = name.replaceAll("\\", "/").split("/");
  const leaf = parts.at(-1) ?? "";
  if (parts.some(part => /^\.env(?:\..*)?$/i.test(part) && !(source && part === ".env.example"))) return true;
  if (/^(?:runtime|private_uploads|uploads|backups|screenshots|test-results|playwright-report)$/i.test(parts[0])) return true;
  if (parts.some(part => /^(?:private_uploads|friend-test|auth-test)$/i.test(part))) return true;
  if (/\.(?:db|sqlite|sqlite3)(?:$|[-.](?:wal|shm|journal)$)/i.test(leaf)) return true;
  if (/\.(?:pem|key|p12|pfx)$/i.test(leaf)) return true;
  if (/^(?:credentials|secrets?|tunnel-token)(?:[._-]|$)/i.test(leaf) && !/\.(?:js|cjs|mjs|ts|tsx)$/i.test(leaf)) return true;
  if (!source && [".git", "tests", "test", "__tests__"].includes(parts[0])) return true;
  return false;
}

// Checking the index matters: .gitignore does not make an already-tracked file safe.
const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
if (tracked.status !== 0) fail("cannot inspect the tracked source index");
const trackedUnsafe = tracked.stdout.split("\0").filter(Boolean).filter(name => forbidden(name, true));
if (trackedUnsafe.length) fail(`${trackedUnsafe.length} tracked private or runtime path(s)`);

function files(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink() || lstatSync(full).isSymbolicLink()) fail(`symbolic link in artifact: ${name}`);
    return entry.isDirectory() ? files(full, name) : [name];
  });
}

const names = files(artifact);
const unsafe = names.filter(name => forbidden(name));
if (unsafe.length) fail(`${unsafe.length} private, QA, credential or database file(s)`);
if (!localSmoke && names.some(name => /(?:^|\/)(?:@prisma\/engines|\.prisma\/client)\/[^/]*(?:windows|win32|\.dll(?:\.node)?$|\.exe$)/i.test(name))) fail("Windows Prisma engine included");
if (!localSmoke && names.some(name => /(?:^|\/)@next\/swc-win32-/i.test(name))) fail("Windows Next.js engine included");

const required = ["app.js", "server.js", ".next/BUILD_ID", "release-manifest.json", "prisma/schema.prisma", "production-preflight.cjs", "notification-worker.cjs", "node_modules/.prisma/client/default.js"];
for (const name of required) if (!names.includes(name)) fail(`missing ${name}`);
const manifest = JSON.parse(readFileSync(path.join(artifact, "release-manifest.json"), "utf8"));
if (!/^[0-9a-f]{40}$/.test(manifest.sourceRevision) || (!localSmoke && manifest.sourceDirty)) fail("source revision is missing or dirty");
if (process.env.GITHUB_SHA && manifest.sourceRevision !== process.env.GITHUB_SHA) fail("manifest does not match the workflow commit");
if (localSmoke) {
  if (manifest.deployable !== false) fail("local smoke artifact must not be deployable");
} else {
  if (manifest.deployable !== true || manifest.platform !== "linux" || manifest.architecture !== "x64" || manifest.node !== "v22.23.2") fail("manifest does not describe deployable Linux x64 Node 22.23.2 output");
  for (const target of ["rhel-openssl-1.1.x", "rhel-openssl-3.0.x"]) {
    for (const name of [`node_modules/.prisma/client/libquery_engine-${target}.so.node`, `node_modules/@prisma/engines/schema-engine-${target}`]) if (!names.includes(name)) fail(`missing ${name}`);
  }
}
console.log(`cPanel artifact safety check: PASS (${names.length} files; deployable=${manifest.deployable}).`);
