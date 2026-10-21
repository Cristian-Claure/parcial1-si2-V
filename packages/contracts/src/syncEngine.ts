import {
  SYNC_MAX_ATTEMPTS,
  type SyncConflictOption, type SyncEntityType, type SyncOperation, type SyncOperationResult, type SyncOutboxStatus, type SyncPullResponse, type SyncPushResponse,
} from "./sync.js";

/*
 * Motor puro de la cola offline, compartido por web (Dexie) y móvil (SQLite):
 * un solo mecanismo con los mismos estados, reintentos y resoluciones.
 */

/** Entrada de la cola genérica de operaciones offline (una sola cola para todo lo nuevo). */
export interface OutboxEntry {
  clientOperationId: string;
  companyId: string;
  userId: string;
  operation: SyncOperation;
  /** Texto corto para la UI, p. ej. "Cliente Rosa Méndez". */
  label: string;
  status: SyncOutboxStatus;
  attempts: number;
  code: string | null;
  error: string | null;
  /** Último resultado del servidor (CONFLICT/REJECTED) con opciones y datos existentes. */
  result: SyncOperationResult | null;
  createdAt: string;
  updatedAt: string;
}

/** Copia local del alcance (pull) + registros creados offline aún no sincronizados. */
export interface MirrorRecord {
  key: string;
  companyId: string;
  entityType: SyncEntityType;
  id: string;
  data: Record<string, unknown>;
  pending: boolean;
  updatedAt: string;
}

export const mirrorKey = (companyId: string, entityType: SyncEntityType, id: string) => `${companyId}:${entityType}:${id}`;

/** Persistencia de la cola (Dexie en web; en pruebas, memoria). */
export interface OutboxStore {
  pending(companyId: string, userId: string): Promise<OutboxEntry[]>;
  update(clientOperationId: string, patch: Partial<OutboxEntry>): Promise<void>;
  remove(clientOperationId: string): Promise<void>;
}

export interface SyncTransport {
  push(companyId: string, operations: SyncOperation[]): Promise<SyncPushResponse>;
}

export interface PushSummary { applied: number; duplicates: number; conflicts: number; rejected: number; failed: number; offline: boolean }

export type ResultDecision = { action: "REMOVE"; result: SyncOperationResult } | { action: "UPDATE"; patch: Partial<OutboxEntry> };

const now = () => new Date().toISOString();

/** APPLIED/DUPLICATE → se quita de la cola; CONFLICT → espera decisión; REJECTED → FAILED con código. */
export function decideResult(entry: OutboxEntry, result: SyncOperationResult): ResultDecision {
  if (result.status === "APPLIED" || result.status === "DUPLICATE") return { action: "REMOVE", result };
  if (result.status === "CONFLICT") return { action: "UPDATE", patch: { status: "CONFLICT", code: result.code, error: result.message, result, updatedAt: now() } };
  return { action: "UPDATE", patch: { status: "FAILED", code: result.code, error: result.message, result, attempts: entry.attempts + 1, updatedAt: now() } };
}

/** Error de transporte: sin red → vuelve a PENDING sin gastar intento; otro error → intento++ (FAILED al 5.º). */
export function decideTransportError(entry: OutboxEntry, offline: boolean, message: string): Partial<OutboxEntry> {
  if (offline) return { status: "PENDING", updatedAt: now() };
  const attempts = entry.attempts + 1;
  return { status: attempts >= SYNC_MAX_ATTEMPTS ? "FAILED" : "PENDING", attempts, error: message, code: null, updatedAt: now() };
}

/** Envía en lotes la cola PENDING (en orden de creación) y aplica el resultado de cada operación. */
export async function pushOutbox(
  store: OutboxStore,
  transport: SyncTransport,
  companyId: string,
  userId: string,
  isOffline: (error: unknown) => boolean,
  onApplied: (entry: OutboxEntry, result: SyncOperationResult) => Promise<void> = async () => undefined,
  batchSize = 50,
): Promise<PushSummary> {
  const summary: PushSummary = { applied: 0, duplicates: 0, conflicts: 0, rejected: 0, failed: 0, offline: false };
  const pending = (await store.pending(companyId, userId)).filter((entry) => entry.status === "PENDING").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (let start = 0; start < pending.length; start += batchSize) {
    const batch = pending.slice(start, start + batchSize);
    for (const entry of batch) await store.update(entry.clientOperationId, { status: "SYNCING", updatedAt: now() });
    let response: SyncPushResponse;
    try {
      response = await transport.push(companyId, batch.map((entry) => entry.operation));
    } catch (error) {
      const offline = isOffline(error);
      for (const entry of batch) {
        const patch = decideTransportError(entry, offline, error instanceof Error ? error.message : "No se pudo sincronizar.");
        if (patch.status === "FAILED") summary.failed += 1;
        await store.update(entry.clientOperationId, patch);
      }
      if (offline) { summary.offline = true; break; }
      continue;
    }
    for (const entry of batch) {
      const result = response.results.find((candidate) => candidate.clientOperationId === entry.clientOperationId);
      if (!result) { await store.update(entry.clientOperationId, decideTransportError(entry, false, "El servidor no devolvió resultado para la operación.")); continue; }
      const decision = decideResult(entry, result);
      if (decision.action === "REMOVE") {
        await onApplied(entry, result);
        await store.remove(entry.clientOperationId);
        if (result.status === "APPLIED") summary.applied += 1; else summary.duplicates += 1;
      } else {
        await store.update(entry.clientOperationId, decision.patch);
        if (result.status === "CONFLICT") summary.conflicts += 1; else summary.rejected += 1;
      }
    }
  }
  return summary;
}

export type ConflictResolution =
  | { action: "REMOVE"; replaceLocalWith: string | null }
  | { action: "UPDATE"; patch: Partial<OutboxEntry> };

/**
 * Resolución de un CONFLICT:
 * - USE_EXISTING: se descarta la operación y lo local se reemplaza por el registro existente.
 * - ADJUST_AND_RETRY: se corrige el payload (p. ej. otro SKU o correo) y vuelve a PENDING.
 * - DISCARD / KEEP_SERVER: se descarta la operación (gana lo del servidor en el próximo pull).
 * - KEEP_MINE: se reenvía con la versión actual del servidor.
 */
export function resolveConflict(entry: OutboxEntry, option: SyncConflictOption, adjustedPayload?: Record<string, unknown>): ConflictResolution {
  const reset = { status: "PENDING" as const, attempts: 0, code: null, error: null, result: null, updatedAt: now() };
  switch (option) {
    case "USE_EXISTING": {
      const server = entry.result?.server ?? null;
      const existingId = server && typeof server.id === "string" ? server.id : server && typeof server.productId === "string" ? server.productId : null;
      return { action: "REMOVE", replaceLocalWith: existingId };
    }
    case "ADJUST_AND_RETRY":
      if (!adjustedPayload) throw new Error("Corrija los datos antes de reintentar.");
      return { action: "UPDATE", patch: { ...reset, operation: { ...entry.operation, payload: { ...entry.operation.payload, ...adjustedPayload } } as SyncOperation } };
    case "KEEP_MINE": {
      const serverVersion = entry.result?.server && typeof entry.result.server.version === "number" ? entry.result.server.version : null;
      if (serverVersion === null || !("baseVersion" in entry.operation)) throw new Error("La operación no admite conservar la versión local.");
      return { action: "UPDATE", patch: { ...reset, operation: { ...entry.operation, baseVersion: serverVersion } as SyncOperation } };
    }
    case "DISCARD":
    case "KEEP_SERVER":
      return { action: "REMOVE", replaceLocalWith: null };
  }
}

/** Reintento manual de una operación FAILED: vuelve a PENDING con contador en cero. */
export function retryPatch(): Partial<OutboxEntry> {
  return { status: "PENDING", attempts: 0, code: null, error: null, result: null, updatedAt: now() };
}

/** Convierte un pull en registros del espejo y claves a borrar (tombstones). */
export function mirrorChanges(pull: SyncPullResponse): { upserts: MirrorRecord[]; deletes: string[] } {
  const at = now();
  const record = (entityType: SyncEntityType, data: { id: string }): MirrorRecord => ({
    key: mirrorKey(pull.companyId, entityType, data.id), companyId: pull.companyId, entityType, id: data.id, data: data as Record<string, unknown>, pending: false, updatedAt: at,
  });
  const upserts = [
    ...pull.categories.map((item) => record("CATEGORY", item)),
    ...pull.products.map((item) => record("PRODUCT", item)),
    ...pull.stores.map((item) => record("STORE", item)),
    ...pull.warehouses.map((item) => record("WAREHOUSE", item)),
    ...pull.customers.map((item) => record("CUSTOMER", item)),
  ];
  return { upserts, deletes: pull.tombstones.map((tombstone) => mirrorKey(pull.companyId, tombstone.entityType, tombstone.id)) };
}
