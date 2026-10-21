import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "@velora/database";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const migrationDir = join(repositoryRoot, "packages", "database", "migrations");

function urlFromRootEnv(): string | null {
  const file = join(repositoryRoot, ".env");
  if (!existsSync(file)) return null;
  const line = readFileSync(file, "utf8").split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
  return line ? line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "") : null;
}

/** Servidor donde se crean bases temporales: VELORA_TEST_DATABASE_URL, DATABASE_URL o el .env raíz. */
export function integrationServerUrl(): string | null {
  return process.env.VELORA_TEST_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || urlFromRootEnv();
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export async function integrationDatabaseAvailable(): Promise<boolean> {
  const url = integrationServerUrl();
  if (!url) return false;
  const client = createDatabase(withDatabase(url, "postgres"));
  try {
    await client.pool.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.pool.end().catch(() => undefined);
  }
}

export interface TestDatabase {
  url: string;
  /** Aplica las migraciones con versión > `afterVersion` (para probar backfills sobre datos). */
  migrateAfter(afterVersion: number): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  drop(): Promise<void>;
}

function migrationFiles(): { name: string; version: number }[] {
  return readdirSync(migrationDir)
    .filter((name) => /^V\d+__.+\.sql$/.test(name))
    .map((name) => ({ name, version: Number(/^V(\d+)/.exec(name)?.[1]) }))
    .sort((a, b) => a.version - b.version);
}

/** Crea una base vacía, aplica V1..Vn y devuelve un cliente; `drop()` la elimina. */
export async function createMigratedDatabase(prefix: string, options: { upTo?: number } = {}): Promise<TestDatabase> {
  const server = integrationServerUrl();
  if (!server) throw new Error("No hay servidor PostgreSQL para pruebas de integración.");
  const name = `velora_test_${prefix}_${randomBytes(4).toString("hex")}`;
  const admin = createDatabase(withDatabase(server, "postgres"));
  await admin.pool.query(`create database ${name}`);
  const url = withDatabase(server, name);
  const database = createDatabase(url);
  // `drop database ... with (force)` corta las conexiones que aún cierran: no es un fallo de la prueba.
  const ignoreTermination = () => undefined;
  database.pool.on("error", ignoreTermination);
  admin.pool.on("error", ignoreTermination);
  try {
    for (const file of migrationFiles().filter((entry) => options.upTo === undefined || entry.version <= options.upTo)) {
      await database.pool.query(readFileSync(join(migrationDir, file.name), "utf8"));
    }
  } catch (error) {
    await database.pool.end().catch(() => undefined);
    await admin.pool.query(`drop database if exists ${name} with (force)`).catch(() => undefined);
    await admin.pool.end().catch(() => undefined);
    throw error;
  }
  return {
    url,
    async migrateAfter(afterVersion: number) {
      for (const file of migrationFiles().filter((entry) => entry.version > afterVersion)) {
        await database.pool.query(readFileSync(join(migrationDir, file.name), "utf8"));
      }
    },
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await database.pool.query(sql, params);
      return result.rows as T[];
    },
    async drop() {
      await database.pool.end().catch(() => undefined);
      await admin.pool.query(`drop database if exists ${name} with (force)`);
      await admin.pool.end();
    },
  };
}
