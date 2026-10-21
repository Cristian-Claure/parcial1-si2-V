import process from "node:process";
import pg from "pg";
import { applyMigration, ensureHistoryTable, listMigrations } from "./migration-files.mjs";

const { Client } = pg;

const files = await listMigrations();

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
    throw new Error("db:migrate:fresh solo puede ejecutarse sobre una base sin tablas public existentes. Use db:migrate:up para una base existente.");
  }

  await ensureHistoryTable(client);

  for (const file of files) {
    await applyMigration(client, file);
    console.log(`MIGRATION_V${file.version}=OK`);
  }

  console.log(`VELORA_FRESH_MIGRATIONS_V1_V${files.at(-1).version}=OK`);
} finally {
  await client.end().catch(() => undefined);
}
