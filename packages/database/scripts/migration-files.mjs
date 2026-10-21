import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const migrationDir = join(here, "..", "migrations");

// V1-V25 se aplicaron antes de existir el control incremental.
export const LEGACY_BASELINE_VERSION = 25;

export const HISTORY_TABLE = "velora_schema_migrations";

function migrationVersion(name) {
  const match = /^V(\d+)__.+\.sql$/.exec(name);
  return match ? Number(match[1]) : null;
}

export async function listMigrations() {
  const files = (await readdir(migrationDir))
    .map((name) => ({ name, version: migrationVersion(name) }))
    .filter((entry) => entry.version !== null)
    .sort((a, b) => a.version - b.version);

  if (files.length < LEGACY_BASELINE_VERSION || files.some((entry, index) => entry.version !== index + 1)) {
    throw new Error(`Se requieren migraciones contiguas desde V1 (mínimo V1-V${LEGACY_BASELINE_VERSION}), sin huecos.`);
  }

  return files;
}

export function readMigration(name) {
  return readFile(join(migrationDir, name), "utf8");
}

export async function ensureHistoryTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} (
      version INTEGER PRIMARY KEY,
      script VARCHAR(200) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function applyMigration(client, { name, version }) {
  const sql = await readMigration(name);
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO ${HISTORY_TABLE} (version, script) VALUES ($1, $2)`,
      [version, name],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`Falló ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
