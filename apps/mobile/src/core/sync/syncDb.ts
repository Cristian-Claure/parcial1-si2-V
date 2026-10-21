import type { MirrorRecord, OutboxEntry, OutboxStore, SyncEntityType } from "@velora/contracts";
import { mobileDatabase } from "../offline/mobileDb";
import { entryToRow, rowToEntry, rowToMirror, type MirrorRow, type OutboxRow } from "./outboxRows";

/** Implementación SQLite de la cola del motor compartido. */
export const sqliteOutbox: OutboxStore = {
  pending: async (companyId, userId) => {
    const db = await mobileDatabase();
    const rows = await db.getAllAsync<OutboxRow>("SELECT * FROM sync_outbox WHERE company_id = ? AND user_id = ? ORDER BY created_at", companyId, userId);
    return rows.map(rowToEntry);
  },
  update: async (id, patch) => {
    const db = await mobileDatabase();
    const current = await db.getFirstAsync<OutboxRow>("SELECT * FROM sync_outbox WHERE client_operation_id = ?", id);
    if (!current) return;
    const row = entryToRow({ ...rowToEntry(current), ...patch });
    await db.runAsync(
      "UPDATE sync_outbox SET status = ?, label = ?, operation_json = ?, attempts = ?, code = ?, error = ?, result_json = ?, updated_at = ? WHERE client_operation_id = ?",
      row.status, row.label, row.operation_json, row.attempts, row.code, row.error, row.result_json, row.updated_at, id,
    );
  },
  remove: async (id) => {
    const db = await mobileDatabase();
    await db.runAsync("DELETE FROM sync_outbox WHERE client_operation_id = ?", id);
  },
};

export async function insertOutboxEntry(entry: OutboxEntry): Promise<void> {
  const db = await mobileDatabase();
  const row = entryToRow(entry);
  await db.runAsync(
    "INSERT OR REPLACE INTO sync_outbox (client_operation_id, company_id, user_id, status, label, operation_json, attempts, code, error, result_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    row.client_operation_id, row.company_id, row.user_id, row.status, row.label, row.operation_json, row.attempts, row.code, row.error, row.result_json, row.created_at, row.updated_at,
  );
}

export async function putMirror(records: MirrorRecord[]): Promise<void> {
  const db = await mobileDatabase();
  for (const record of records) {
    await db.runAsync(
      "INSERT OR REPLACE INTO sync_mirror (mirror_key, company_id, entity_type, entity_id, data_json, pending, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      record.key, record.companyId, record.entityType, record.id, JSON.stringify(record.data), record.pending ? 1 : 0, record.updatedAt,
    );
  }
}

export async function deleteMirror(keys: string[]): Promise<void> {
  const db = await mobileDatabase();
  for (const key of keys) await db.runAsync("DELETE FROM sync_mirror WHERE mirror_key = ?", key);
}

export async function clearSyncedMirror(companyId: string): Promise<void> {
  const db = await mobileDatabase();
  await db.runAsync("DELETE FROM sync_mirror WHERE company_id = ? AND pending = 0", companyId);
}

export async function markMirrorSynced(key: string): Promise<void> {
  const db = await mobileDatabase();
  await db.runAsync("UPDATE sync_mirror SET pending = 0 WHERE mirror_key = ?", key);
}

export async function listMirror(companyId: string, entityType: SyncEntityType): Promise<MirrorRecord[]> {
  const db = await mobileDatabase();
  const rows = await db.getAllAsync<MirrorRow>("SELECT * FROM sync_mirror WHERE company_id = ? AND entity_type = ? ORDER BY pending DESC, updated_at DESC", companyId, entityType);
  return rows.map(rowToMirror);
}

export async function readCursor(companyId: string): Promise<string | null> {
  const db = await mobileDatabase();
  return (await db.getFirstAsync<{ cursor: string | null }>("SELECT cursor FROM sync_state WHERE company_id = ?", companyId))?.cursor ?? null;
}

export async function saveCursor(companyId: string, cursor: string): Promise<void> {
  const db = await mobileDatabase();
  await db.runAsync("INSERT OR REPLACE INTO sync_state (company_id, cursor, last_pull_at) VALUES (?, ?, ?)", companyId, cursor, new Date().toISOString());
}
