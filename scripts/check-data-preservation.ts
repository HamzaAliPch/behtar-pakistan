// Read-only preservation checks: store hashes and column names, never record contents.
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const db = new PrismaClient();
const [mode, file] = process.argv.slice(2);
type Entry = { table: string; columns: string[]; count: number; hash: string };
const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;
async function digest(table: string, columns: string[]): Promise<Entry> {
  const records = await db.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT ${columns.map(quoted).join(",")} FROM ${quoted(table)}`);
  const lines = records.map(row => JSON.stringify(row, (_, value) => typeof value === "bigint" ? value.toString() : value)).sort();
  return { table, columns, count: records.length, hash: createHash("sha256").update(lines.join("\n")).digest("hex") };
}
async function main() {
  if (!file || !["capture", "verify"].includes(mode)) throw new Error("Use capture|verify with a manifest filename");
  if (mode === "capture") {
    const tables = await db.$queryRaw<{ name: string }[]>`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' AND name != 'AuditLog'`;
    const entries: Entry[] = [];
    for (const { name } of tables) { const columns = await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info(${quoted(name)})`); entries.push(await digest(name, columns.map(column => column.name))); }
    writeFileSync(file, JSON.stringify(entries, null, 2), { flag: "wx" });
    console.log(`Recorded preservation hashes for ${entries.length} tables.`);
  } else {
    const entries = JSON.parse(readFileSync(file, "utf8")) as Entry[];
    for (const entry of entries) { const current = await digest(entry.table, entry.columns); if (current.count !== entry.count || current.hash !== entry.hash) throw new Error(`Historical data changed in ${entry.table}`); }
    console.log(`Verified all historical columns and records across ${entries.length} tables. AuditLog excluded because the migration appends an audit event.`);
  }
}
main().finally(() => db.$disconnect()).catch(error => { console.error(error.message); process.exitCode = 1; });
