import { createClientOperationId } from "../offline/offlineOrder";
import { create } from "zustand";
import {
  mirrorChanges, mirrorKey, pushOutbox, resolveConflict, retryPatch,
  type OutboxEntry, type SyncConflictOption, type SyncEntityType, type SyncOperation, type SyncPullResponse, type SyncPushResponse,
} from "@velora/contracts";
import { apiRequest, ApiClientError } from "../api/apiClient";
import { useNetworkStore } from "../network/networkStore";
import { clearSyncedMirror, deleteMirror, insertOutboxEntry, markMirrorSynced, putMirror, readCursor, saveCursor, sqliteOutbox } from "./syncDb";

const now = () => new Date().toISOString();
export const newId = () => createClientOperationId();

const syncApi = {
  push: (companyId: string, operations: SyncOperation[]) => apiRequest<SyncPushResponse>("/api/sync/push", { method: "POST", body: JSON.stringify({ companyId, operations }) }),
  pull: (companyId: string, since: string | null) => apiRequest<SyncPullResponse>(`/api/sync/pull?companyId=${encodeURIComponent(companyId)}${since ? `&since=${encodeURIComponent(since)}` : ""}`),
};

const isOffline = (error: unknown) => error instanceof ApiClientError && error.status === 0;

interface OperationsSyncState {
  running: boolean;
  lastMessage: string | null;
  lastSyncAt: string | null;
  version: number;
  counts: { pending: number; conflicts: number; failed: number };
  refresh: (companyId: string | null, userId: string | null) => Promise<void>;
}

/** Estado de la cola del modo operaciones (se incrementa `version` para refrescar pantallas). */
export const useOperationsSync = create<OperationsSyncState>((set) => ({
  running: false, lastMessage: null, lastSyncAt: null, version: 0, counts: { pending: 0, conflicts: 0, failed: 0 },
  refresh: async (companyId, userId) => {
    const entries = companyId && userId ? await sqliteOutbox.pending(companyId, userId) : [];
    set((state) => ({
      version: state.version + 1,
      counts: {
        pending: entries.filter((entry) => entry.status === "PENDING" || entry.status === "SYNCING").length,
        conflicts: entries.filter((entry) => entry.status === "CONFLICT").length,
        failed: entries.filter((entry) => entry.status === "FAILED").length,
      },
    }));
  },
}));

/** Encola una operación (funciona sin red) y deja el registro local visible como pendiente. */
export async function enqueueOperation(companyId: string, userId: string, operation: SyncOperation, label: string, local: { entityType: SyncEntityType; id: string; data: Record<string, unknown> }): Promise<void> {
  const at = now();
  await insertOutboxEntry({ clientOperationId: operation.clientOperationId, companyId, userId, operation, label, status: "PENDING", attempts: 0, code: null, error: null, result: null, createdAt: at, updatedAt: at });
  await putMirror([{ key: mirrorKey(companyId, local.entityType, local.id), companyId, entityType: local.entityType, id: local.id, data: local.data, pending: true, updatedAt: at }]);
  await useOperationsSync.getState().refresh(companyId, userId);
}

export async function resolveEntry(entry: OutboxEntry, option: SyncConflictOption, adjusted?: Record<string, unknown>): Promise<void> {
  const resolution = resolveConflict(entry, option, adjusted);
  if (resolution.action === "REMOVE") {
    await sqliteOutbox.remove(entry.clientOperationId);
    if (entry.operation.type === "CUSTOMER_CREATE" || entry.operation.type === "PRODUCT_CREATE") {
      const entityType: SyncEntityType = entry.operation.type === "CUSTOMER_CREATE" ? "CUSTOMER" : "PRODUCT";
      await deleteMirror([mirrorKey(entry.companyId, entityType, (entry.operation.payload as { id: string }).id)]);
    }
  } else {
    await sqliteOutbox.update(entry.clientOperationId, resolution.patch);
  }
  await useOperationsSync.getState().refresh(entry.companyId, entry.userId);
}

export async function retryEntry(entry: OutboxEntry): Promise<void> {
  await sqliteOutbox.update(entry.clientOperationId, retryPatch());
  await useOperationsSync.getState().refresh(entry.companyId, entry.userId);
}

let inFlight: Promise<void> | null = null;

/** Mismo ciclo que la web: recupera SYNCING, push en lote, marca lo aplicado y hace pull incremental. */
export function runOperationsSync(userId: string, companyId: string | null): Promise<void> {
  if (!companyId) return Promise.resolve();
  inFlight ??= (async () => {
    useOperationsSync.setState({ running: true });
    try {
      for (const entry of (await sqliteOutbox.pending(companyId, userId)).filter((item) => item.status === "SYNCING")) {
        await sqliteOutbox.update(entry.clientOperationId, { status: "PENDING" });
      }
      if (!useNetworkStore.getState().isConnected) { useOperationsSync.setState({ lastMessage: "Sin conexión: las operaciones quedan en cola." }); return; }
      const summary = await pushOutbox(sqliteOutbox, syncApi, companyId, userId, isOffline, async (entry, result) => {
        if (entry.operation.type.endsWith("_CREATE") && result.entityId) {
          await markMirrorSynced(mirrorKey(companyId, entry.operation.type.startsWith("CUSTOMER") ? "CUSTOMER" : "PRODUCT", result.entityId));
        }
      });
      if (!summary.offline) {
        const pull = await syncApi.pull(companyId, await readCursor(companyId));
        const changes = mirrorChanges(pull);
        if (pull.snapshot) await clearSyncedMirror(companyId);
        await deleteMirror(changes.deletes);
        await putMirror(changes.upserts);
        await saveCursor(companyId, pull.cursor);
      }
      useOperationsSync.setState({
        lastSyncAt: now(),
        lastMessage: summary.conflicts + summary.rejected > 0 ? "Hay operaciones que requieren tu revisión."
          : summary.applied + summary.duplicates > 0 ? `${summary.applied + summary.duplicates} operación(es) sincronizada(s).` : "Todo sincronizado.",
      });
    } catch (error) {
      useOperationsSync.setState({ lastMessage: error instanceof Error ? error.message : "No se pudo sincronizar." });
    } finally {
      useOperationsSync.setState({ running: false });
      await useOperationsSync.getState().refresh(companyId, userId);
      inFlight = null;
    }
  })();
  return inFlight;
}
