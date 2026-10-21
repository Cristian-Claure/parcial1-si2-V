import type { SyncEntityType, SyncOperation, SyncOperationResult, SyncOutboxStatus } from "@velora/contracts";

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

export interface PendingImage {
  id: string;
  companyId: string;
  userId: string;
  productId: string;
  /** Operación que crea el producto: la imagen sube cuando esa operación ya fue aplicada. */
  dependsOn: string;
  blob: Blob;
  filename: string;
  status: "WAITING" | "FAILED";
  attempts: number;
  error: string | null;
  createdAt: string;
}

export interface SyncStateRecord { companyId: string; cursor: string | null; lastPullAt: string | null }

export const mirrorKey = (companyId: string, entityType: SyncEntityType, id: string) => `${companyId}:${entityType}:${id}`;
