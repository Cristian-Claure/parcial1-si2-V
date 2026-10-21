import process from "node:process";
import pg from "pg";
import {
  HISTORY_TABLE,
  LEGACY_BASELINE_VERSION,
  applyMigration,
  ensureHistoryTable,
  listMigrations,
} from "./migration-files.mjs";

const { Client } = pg;

const files = await listMigrations();

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL es obligatoria.");
}

const client = new Client({ connectionString });

// Objeto creado por V25: si existe, la base ya tiene V1-V25 aplicadas.
async function hasLegacyBaseline() {
  const result = await client.query("select to_regclass('public.order_inventory_allocations') is not null as present");
  return result.rows[0]?.present === true;
}

try {
  await client.connect();

  // Evita dos ejecuciones simultáneas sobre la misma base.
  await client.query("select pg_advisory_lock(hashtext($1))", [HISTORY_TABLE]);

  await ensureHistoryTable(client);

  const applied = await client.query(`select version from ${HISTORY_TABLE} order by version`);
  let appliedVersions = new Set(applied.rows.map((row) => Number(row.version)));

  if (appliedVersions.size === 0) {
    if (!(await hasLegacyBaseline())) {
      throw new Error("La base no tiene V1-V25. Use db:migrate:fresh sobre una base vacía.");
    }
    for (const file of files.filter((entry) => entry.version <= LEGACY_BASELINE_VERSION)) {
      await client.query(`insert into ${HISTORY_TABLE} (version, script) values ($1, $2)`, [file.version, file.name]);
    }
    appliedVersions = new Set(files.filter((entry) => entry.version <= LEGACY_BASELINE_VERSION).map((entry) => entry.version));
    console.log(`MIGRATION_BASELINE_V1_V${LEGACY_BASELINE_VERSION}=RECORDED`);
  }

  const pending = files.filter((entry) => !appliedVersions.has(entry.version));
  for (const file of pending) {
    await applyMigration(client, file);
    console.log(`MIGRATION_V${file.version}=OK`);
  }

  console.log(pending.length === 0 ? "VELORA_MIGRATIONS=UP_TO_DATE" : `VELORA_MIGRATIONS_V${files.at(-1).version}=OK`);
} finally {
  await client.end().catch(() => undefined);
}
