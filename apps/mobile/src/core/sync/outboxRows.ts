import type { MirrorRecord, OutboxEntry, SyncEntityType, SyncOperation, SyncOperationResult, SyncOutboxStatus } from "@velora/contracts";

/** Fila SQLite de `sync_outbox` ↔ entrada del motor compartido (@velora/contracts). */
export interface OutboxRow {
  client_operation_id: string;
  company_id: string;
  user_id: string;
  status: string;
  label: string;
  operation_json: string;
  attempts: number;
  code: string | null;
  error: string | null;
  result_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface MirrorRow {
  mirror_key: string;
  company_id: string;
  entity_type: string;
  entity_id: string;
  data_json: string;
  pending: number;
  updated_at: string;
}

export function rowToEntry(row: OutboxRow): OutboxEntry {
  return {
    clientOperationId: row.client_operation_id, companyId: row.company_id, userId: row.user_id, status: row.status as SyncOutboxStatus,
    label: row.label, operation: JSON.parse(row.operation_json) as SyncOperation, attempts: Number(row.attempts), code: row.code, error: row.error,
    result: row.result_json ? JSON.parse(row.result_json) as SyncOperationResult : null, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function entryToRow(entry: OutboxEntry): OutboxRow {
  return {
    client_operation_id: entry.clientOperationId, company_id: entry.companyId, user_id: entry.userId, status: entry.status, label: entry.label,
    operation_json: JSON.stringify(entry.operation), attempts: entry.attempts, code: entry.code, error: entry.error,
    result_json: entry.result ? JSON.stringify(entry.result) : null, created_at: entry.createdAt, updated_at: entry.updatedAt,
  };
}

export function rowToMirror(row: MirrorRow): MirrorRecord {
  return {
    key: row.mirror_key, companyId: row.company_id, entityType: row.entity_type as SyncEntityType, id: row.entity_id,
    data: JSON.parse(row.data_json) as Record<string, unknown>, pending: Number(row.pending) === 1, updatedAt: row.updated_at,
  };
}
