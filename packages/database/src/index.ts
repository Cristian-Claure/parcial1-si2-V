import {
  drizzle,
} from "drizzle-orm/node-postgres";

import {
  Pool,
} from "pg";

import * as schema from "./schema.js";

export * from "./schema.js";

export const VELORA_DATABASE_BASELINE = {
  engine:
    "postgresql",

  historicalMigrations:
    23,

  migrationPolicy:
    "preserve-v1-v23",
} as const;

export function createDatabase(
  connectionString: string,
) {
  const pool =
    new Pool({
      connectionString,
    });

  const db =
    drizzle(
      pool,
      {
        schema,
      },
    );

  return {
    db,
    pool,
  };
}

export type VeloraDatabaseClient =
  ReturnType<
    typeof createDatabase
  >;