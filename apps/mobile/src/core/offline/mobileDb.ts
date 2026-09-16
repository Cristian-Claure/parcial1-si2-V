import * as SQLite from "expo-sqlite";
import type { SyncOfflineOrderRequest } from "@velora/contracts";

export type OfflineOrderStatus = "PENDING" | "SYNCING" | "CONFLICT" | "FAILED";

export interface OfflineOrderEntry {
  id: string;
  userId: string;
  status: OfflineOrderStatus;
  request: SyncOfflineOrderRequest;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  attempts: number;
}

interface CacheRow {
  payload: string;
}

interface SettingRow {
  value: string;
}

interface OfflineRow {
  id: string;
  user_id: string;
  status: OfflineOrderStatus;
  request_json: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  attempts: number;
}

let databasePromise: ReturnType<typeof SQLite.openDatabaseAsync> | null = null;

async function database() {
  databasePromise ??= SQLite.openDatabaseAsync("velora-mobile.db");
  return databasePromise;
}

export async function initMobileDb(): Promise<void> {
  const db = await database();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS cache_entries (
      scope TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope, owner_id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offline_orders (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      request_json TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_offline_orders_user_status
      ON offline_orders(user_id, status, created_at);
  `);

  await migrateOfflineOrdersAttemptsColumn(db);
}

async function migrateOfflineOrdersAttemptsColumn(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(offline_orders)",
  );

  if (!columns.some((column) => column.name === "attempts")) {
    await db.execAsync(
      "ALTER TABLE offline_orders ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0",
    );
  }
}

export async function saveCache<T>(
  scope: string,
  ownerId: string,
  value: T,
): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT INTO cache_entries(scope, owner_id, payload, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(scope, owner_id)
     DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    scope,
    ownerId,
    JSON.stringify(value),
    new Date().toISOString(),
  );
}

export async function readCache<T>(
  scope: string,
  ownerId: string,
): Promise<T | null> {
  const db = await database();
  const row = await db.getFirstAsync<CacheRow>(
    "SELECT payload FROM cache_entries WHERE scope = ? AND owner_id = ?",
    scope,
    ownerId,
  );

  if (!row) {
    return null;
  }

  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export async function saveSetting(key: string, value: string): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT INTO app_settings(setting_key, value)
     VALUES (?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export async function readSetting(key: string): Promise<string | null> {
  const db = await database();
  const row = await db.getFirstAsync<SettingRow>(
    "SELECT value FROM app_settings WHERE setting_key = ?",
    key,
  );
  return row?.value ?? null;
}

export async function enqueueOfflineOrder(
  userId: string,
  request: SyncOfflineOrderRequest,
): Promise<OfflineOrderEntry> {
  const db = await database();
  const existing = await db.getFirstAsync<OfflineRow>(
    "SELECT * FROM offline_orders WHERE id = ?",
    request.clientOperationId,
  );

  if (existing) {
    const current = mapOfflineRow(existing);
    if (JSON.stringify(current.request) !== JSON.stringify(request)) {
      throw new Error(
        "clientOperationId ya existe con un snapshot diferente.",
      );
    }
    return current;
  }

  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO offline_orders(
      id, user_id, status, request_json, error_message, created_at, updated_at, attempts
    ) VALUES (?, ?, 'PENDING', ?, NULL, ?, ?, 0)`,
    request.clientOperationId,
    userId,
    JSON.stringify(request),
    now,
    now,
  );

  return {
    id: request.clientOperationId,
    userId,
    status: "PENDING",
    request,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
  };
}

export async function listOfflineOrders(
  userId: string,
): Promise<OfflineOrderEntry[]> {
  const db = await database();
  const rows = await db.getAllAsync<OfflineRow>(
    "SELECT * FROM offline_orders WHERE user_id = ? ORDER BY created_at ASC",
    userId,
  );
  return rows.map(mapOfflineRow);
}

export async function setOfflineOrderStatus(
  id: string,
  status: OfflineOrderStatus,
  errorMessage: string | null,
): Promise<void> {
  const db = await database();
  await db.runAsync(
    `UPDATE offline_orders
     SET status = ?, error_message = ?, updated_at = ?
     WHERE id = ?`,
    status,
    errorMessage,
    new Date().toISOString(),
    id,
  );
}

export async function recoverSyncingOrders(userId: string): Promise<void> {
  const db = await database();
  await db.runAsync(
    `UPDATE offline_orders
     SET status = 'PENDING', error_message = NULL, updated_at = ?
     WHERE user_id = ? AND status = 'SYNCING'`,
    new Date().toISOString(),
    userId,
  );
}

export async function deleteOfflineOrder(id: string): Promise<void> {
  const db = await database();
  await db.runAsync("DELETE FROM offline_orders WHERE id = ?", id);
}

export async function retryOfflineOrder(id: string): Promise<void> {
  const db = await database();
  await db.runAsync(
    `UPDATE offline_orders
     SET status = 'PENDING', error_message = NULL, attempts = 0, updated_at = ?
     WHERE id = ?`,
    new Date().toISOString(),
    id,
  );
}

export async function recordOfflineOrderFailure(
  id: string,
  errorMessage: string,
  maxAttempts: number,
): Promise<void> {
  const db = await database();
  await db.runAsync(
    `UPDATE offline_orders
     SET attempts = attempts + 1,
         error_message = ?,
         status = CASE WHEN attempts + 1 >= ? THEN 'FAILED' ELSE 'PENDING' END,
         updated_at = ?
     WHERE id = ?`,
    errorMessage,
    maxAttempts,
    new Date().toISOString(),
    id,
  );
}

function mapOfflineRow(row: OfflineRow): OfflineOrderEntry {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    request: JSON.parse(row.request_json) as SyncOfflineOrderRequest,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attempts: row.attempts,
  };
}