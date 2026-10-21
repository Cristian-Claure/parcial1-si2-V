import { create } from "zustand";
import type { SyncConflictOption, SyncCustomerCreate, SyncEntityType, SyncOperation, SyncProductCreate, SyncPullResponse, SyncPushResponse, UserRole } from "@velora/contracts";
import { apiRequest, ApiClientError, jsonBody } from "../api/apiClient";
import { offlineDb } from "../offline/offlineDb";
import { syncOfflinePosSales } from "../offline/syncOfflinePosSales";
import { mirrorChanges, pushOutbox, resolveConflict, retryPatch, type OutboxStore } from "./outboxEngine";
import { mirrorKey, type MirrorRecord, type OutboxEntry } from "./types";

const OPERATOR_ROLES: readonly UserRole[] = ["ADMIN", "STORE_MANAGER"];
const now = () => new Date().toISOString();

export const syncApi = {
  push: (companyId: string, operations: SyncOperation[]) => apiRequest<SyncPushResponse>("/api/sync/push", { method: "POST", body: jsonBody({ companyId, operations }) }),
  pull: (companyId: string, since: string | null) => apiRequest<SyncPullResponse>(`/api/sync/pull?companyId=${encodeURIComponent(companyId)}${since ? `&since=${encodeURIComponent(since)}` : ""}`),
  uploadProductImage: (productId: string, blob: Blob, filename: string) => {
    const form = new FormData();
    form.append("file", blob, filename); form.append("purpose", "GALLERY"); form.append("primary", "true");
    return apiRequest<unknown>(`/api/catalog/manage/products/${productId}/assets`, { method: "POST", body: form });
  },
};

const isOffline = (error: unknown) => error instanceof ApiClientError && error.status === 0;

export const dexieOutbox: OutboxStore = {
  pending: (companyId, userId) => offlineDb.syncOutbox.where("[companyId+userId]").equals([companyId, userId]).toArray(),
  update: async (id, patch) => { await offlineDb.syncOutbox.update(id, patch); },
  remove: async (id) => { await offlineDb.syncOutbox.delete(id); },
};

export interface SyncStatus {
  online: boolean;
  running: boolean;
  lastSyncAt: string | null;
  lastMessage: string | null;
  counts: { pending: number; conflicts: number; failed: number };
  refreshCounts: (companyId: string | null, userId: string | null) => Promise<void>;
}

export const useSyncStatus = create<SyncStatus>((set) => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  running: false,
  lastSyncAt: null,
  lastMessage: null,
  counts: { pending: 0, conflicts: 0, failed: 0 },
  refreshCounts: async (companyId, userId) => {
    const outbox = companyId && userId ? await dexieOutbox.pending(companyId, userId) : [];
    const pos = userId ? await offlineDb.posSales.where("userId").equals(userId).toArray() : [];
    const statuses = [...outbox.map((entry) => entry.status), ...pos.map((entry) => entry.status)];
    set({ counts: {
      pending: statuses.filter((status) => status === "PENDING" || status === "SYNCING").length,
      conflicts: statuses.filter((status) => status === "CONFLICT").length,
      failed: statuses.filter((status) => status === "FAILED").length,
    } });
  },
}));

function notify(): void {
  window.dispatchEvent(new Event("velora:sync-changed"));
}

// ------------------------------------------------------------------ encolar (funciona sin red)

async function enqueue(companyId: string, userId: string, operation: SyncOperation, label: string, local: { entityType: SyncEntityType; id: string; data: Record<string, unknown> } | null): Promise<void> {
  const at = now();
  await offlineDb.transaction("rw", offlineDb.syncOutbox, offlineDb.mirror, async () => {
    await offlineDb.syncOutbox.put({ clientOperationId: operation.clientOperationId, companyId, userId, operation, label, status: "PENDING", attempts: 0, code: null, error: null, result: null, createdAt: at, updatedAt: at });
    if (local) await offlineDb.mirror.put({ key: mirrorKey(companyId, local.entityType, local.id), companyId, entityType: local.entityType, id: local.id, data: local.data, pending: true, updatedAt: at });
  });
  await useSyncStatus.getState().refreshCounts(companyId, userId);
  notify();
}

export async function enqueueCustomer(companyId: string, userId: string, customer: SyncCustomerCreate): Promise<void> {
  await enqueue(companyId, userId, { clientOperationId: crypto.randomUUID(), type: "CUSTOMER_CREATE", payload: customer }, `Cliente ${customer.firstName} ${customer.lastName}`,
    { entityType: "CUSTOMER", id: customer.id, data: { ...customer, hasAccess: false, version: 0 } });
}

export async function enqueueProduct(companyId: string, userId: string, product: SyncProductCreate, image: File | null): Promise<void> {
  const operation: SyncOperation = { clientOperationId: crypto.randomUUID(), type: "PRODUCT_CREATE", payload: product };
  await enqueue(companyId, userId, operation, `Producto ${product.name}`, {
    entityType: "PRODUCT", id: product.id,
    data: { ...product, slug: product.slug ?? "", status: product.status ?? "ACTIVE", version: 0, imageUrl: null, variants: product.variants.map((variant) => ({ ...variant, currency: "BOB", active: true })), stock: (product.initialStock ?? []).map((entry) => ({ variantId: entry.variantId, warehouseId: entry.warehouseId, available: entry.quantity })) },
  });
  if (image) {
    await offlineDb.pendingImages.put({ id: crypto.randomUUID(), companyId, userId, productId: product.id, dependsOn: operation.clientOperationId, blob: image, filename: image.name, status: "WAITING", attempts: 0, error: null, createdAt: now() });
  }
}

// ------------------------------------------------------------------ resolver desde el centro

export async function resolveOutboxConflict(entry: OutboxEntry, option: SyncConflictOption, adjusted?: Record<string, unknown>): Promise<void> {
  const resolution = resolveConflict(entry, option, adjusted);
  const created = entry.operation.type === "CUSTOMER_CREATE" || entry.operation.type === "PRODUCT_CREATE" ? String((entry.operation.payload as { id: string }).id) : null;
  const entityType: SyncEntityType = entry.operation.type.startsWith("CUSTOMER") ? "CUSTOMER" : "PRODUCT";
  if (resolution.action === "REMOVE") {
    await offlineDb.syncOutbox.delete(entry.clientOperationId);
    if (created) {
      await offlineDb.mirror.delete(mirrorKey(entry.companyId, entityType, created));
      await offlineDb.pendingImages.where("dependsOn").equals(entry.clientOperationId).delete();
    }
  } else {
    await offlineDb.syncOutbox.update(entry.clientOperationId, resolution.patch);
  }
  await useSyncStatus.getState().refreshCounts(entry.companyId, entry.userId);
  notify();
}

export async function retryOutboxEntry(entry: OutboxEntry): Promise<void> {
  await offlineDb.syncOutbox.update(entry.clientOperationId, retryPatch());
  await useSyncStatus.getState().refreshCounts(entry.companyId, entry.userId);
  notify();
}

export async function discardOutboxEntry(entry: OutboxEntry): Promise<void> {
  await resolveOutboxConflict({ ...entry, result: null }, "DISCARD");
}

// ------------------------------------------------------------------ ciclo de sincronización

async function uploadPendingImages(companyId: string, userId: string): Promise<void> {
  const images = await offlineDb.pendingImages.where("companyId").equals(companyId).filter((image) => image.userId === userId && image.status === "WAITING").toArray();
  for (const image of images) {
    if (await offlineDb.syncOutbox.get(image.dependsOn)) continue; // el producto aún no se sincronizó
    try {
      await syncApi.uploadProductImage(image.productId, image.blob, image.filename);
      await offlineDb.pendingImages.delete(image.id);
    } catch (error) {
      if (isOffline(error)) return;
      const attempts = image.attempts + 1;
      await offlineDb.pendingImages.update(image.id, { attempts, error: error instanceof Error ? error.message : "No se pudo subir la imagen.", status: attempts >= 5 ? "FAILED" : "WAITING" });
    }
  }
}

async function pullInto(companyId: string): Promise<void> {
  const state = await offlineDb.syncState.get(companyId);
  const pull = await syncApi.pull(companyId, state?.cursor ?? null);
  const { upserts, deletes } = mirrorChanges(pull);
  await offlineDb.transaction("rw", offlineDb.mirror, offlineDb.syncState, async () => {
    if (pull.snapshot) await offlineDb.mirror.where("companyId").equals(companyId).filter((record: MirrorRecord) => !record.pending).delete();
    await offlineDb.mirror.bulkDelete(deletes);
    await offlineDb.mirror.bulkPut(upserts);
    await offlineDb.syncState.put({ companyId, cursor: pull.cursor, lastPullAt: now() });
  });
}

let inFlight: Promise<void> | null = null;

/**
 * Un único motor para operaciones: ventas POS heredadas + cola genérica (push en lote) +
 * imágenes dependientes + pull incremental del alcance. Idempotente y sin solaparse.
 */
export function runOperationsSync(user: { id: string; role: UserRole }, companyId: string | null): Promise<void> {
  if (!OPERATOR_ROLES.includes(user.role)) return Promise.resolve();
  inFlight ??= (async () => {
    const status = useSyncStatus.getState();
    useSyncStatus.setState({ running: true, online: navigator.onLine });
    try {
      // Operaciones que quedaron en SYNCING por un cierre abrupto vuelven a PENDING.
      if (companyId) {
        const stuck = (await dexieOutbox.pending(companyId, user.id)).filter((entry) => entry.status === "SYNCING");
        for (const entry of stuck) await dexieOutbox.update(entry.clientOperationId, { status: "PENDING" });
      }
      if (!navigator.onLine) { useSyncStatus.setState({ lastMessage: "Sin conexión: las operaciones quedan en cola." }); return; }
      await syncOfflinePosSales(user.id, user.role);
      if (companyId) {
        const summary = await pushOutbox(dexieOutbox, syncApi, companyId, user.id, isOffline, async (entry, result) => {
          if (entry.operation.type.endsWith("_CREATE") && result.entityId) {
            const entityType: SyncEntityType = entry.operation.type.startsWith("CUSTOMER") ? "CUSTOMER" : "PRODUCT";
            await offlineDb.mirror.update(mirrorKey(companyId, entityType, result.entityId), { pending: false });
          }
        });
        await uploadPendingImages(companyId, user.id);
        if (!summary.offline) await pullInto(companyId);
        useSyncStatus.setState({
          lastSyncAt: now(),
          lastMessage: summary.applied + summary.duplicates > 0 ? `${summary.applied + summary.duplicates} operación(es) sincronizada(s).`
            : summary.conflicts + summary.rejected > 0 ? "Hay operaciones que requieren tu revisión." : "Todo sincronizado.",
        });
      }
    } catch (error) {
      useSyncStatus.setState({ lastMessage: error instanceof Error ? error.message : "No se pudo sincronizar." });
    } finally {
      await status.refreshCounts(companyId, user.id);
      useSyncStatus.setState({ running: false });
      inFlight = null;
      notify();
    }
  })();
  return inFlight;
}
