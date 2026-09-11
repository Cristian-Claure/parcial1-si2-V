import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const migrationDir = join(here, "..", "migrations");

function migrationVersion(name) {
  const match = /^V(\d+)__.+\.sql$/.exec(name);
  return match ? Number(match[1]) : null;
}

const files = (await readdir(migrationDir))
  .map((name) => ({ name, version: migrationVersion(name) }))
  .filter((entry) => entry.version !== null)
  .sort((a, b) => a.version - b.version);

if (files.length !== 25 || files.some((entry, index) => entry.version !== index + 1)) {
  throw new Error("Se requieren exactamente las migraciones V1-V25, sin huecos.");
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL es obligatoria.");
}

const client = new Client({ connectionString });

try {
  await client.connect();

  const existing = await client.query(
    "select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
  );
  if (Number(existing.rows[0]?.count ?? 0) !== 0) {
    throw new Error("db:migrate:fresh solo puede ejecutarse sobre una base sin tablas public existentes.");
  }

  for (const { name, version } of files) {
    const sql = await readFile(join(migrationDir, name), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
      console.log(`MIGRATION_V${version}=OK`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Falló ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("VELORA_FRESH_MIGRATIONS_V1_V25=OK");
} finally {
  await client.end().catch(() => undefined);
}
