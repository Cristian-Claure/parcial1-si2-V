import { ApiClientError } from "../api/apiClient";
import { veloraApi } from "../api/veloraApi";
import {
  deleteOfflineOrder,
  listOfflineOrders,
  recordOfflineOrderFailure,
  recoverSyncingOrders,
  setOfflineOrderStatus,
} from "./mobileDb";

const MAX_SYNC_ATTEMPTS = 5;

export interface OfflineSyncSummary {
  synced: number;
  conflicts: number;
  pending: number;
}

export async function syncOfflineOrders(
  userId: string,
): Promise<OfflineSyncSummary> {
  await recoverSyncingOrders(userId);

  const entries = (await listOfflineOrders(userId)).filter(
    (entry) => entry.status === "PENDING",
  );

  let synced = 0;
  let conflicts = 0;
  let pending = 0;

  for (const entry of entries) {
    await setOfflineOrderStatus(entry.id, "SYNCING", null);

    try {
      await veloraApi.syncOfflineOrder(entry.request);
      await deleteOfflineOrder(entry.id);
      synced += 1;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        await setOfflineOrderStatus(
          entry.id,
          "CONFLICT",
          error.message ||
            "El pedido necesita revisión antes de sincronizarse.",
        );
        conflicts += 1;
        continue;
      }

      if (error instanceof ApiClientError && error.status === 0) {
        await setOfflineOrderStatus(entry.id, "PENDING", null);
        pending += 1;
        break;
      }

      const message =
        error instanceof Error ? error.message : "No se pudo sincronizar.";
      await recordOfflineOrderFailure(entry.id, message, MAX_SYNC_ATTEMPTS);
      pending += 1;

      throw error;
    }
  }

  return { synced, conflicts, pending };
}