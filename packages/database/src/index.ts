import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export const VELORA_DATABASE_BASELINE = {
  engine: "postgresql",
  historicalMigrations: 23,
  migrationPolicy: "preserve-v1-v23"
} as const;

export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  return {
    db,
    pool
  };
}