import {
  parseServerRuntimeConfig,
} from "@velora/config";

import {
  createDatabase,
  type VeloraDatabaseClient,
} from "@velora/database";

type DatabaseGlobalState =
  typeof globalThis & {
    __veloraDatabaseClient?:
      VeloraDatabaseClient;
  };

export function getDatabaseClient():
  VeloraDatabaseClient {
  const state =
    globalThis as DatabaseGlobalState;

  if (
    !state.__veloraDatabaseClient
  ) {
    const config =
      parseServerRuntimeConfig(
        process.env,
      );

    state.__veloraDatabaseClient =
      createDatabase(
        config.DATABASE_URL,
      );
  }

  return state.__veloraDatabaseClient;
}