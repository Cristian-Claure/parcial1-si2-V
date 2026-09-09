import { ApiClientError } from "../api/apiClient";
import { veloraApi } from "../api/veloraApi";
import { offlineDb } from "./offlineDb";

export async function syncOfflineOrders(userId: string): Promise<{ synced: number; conflicts: number }> {
  if (!navigator.onLine) return { synced: 0, conflicts: 0 };
  const pending = await offlineDb.offlineOrders.where("userId").equals(userId).filter((item) => item.status === "PENDING").toArray();
  let synced = 0; let conflicts = 0;
  for (const entry of pending) {
    try {
      await veloraApi.syncOfflineOrder(entry.request);
      await offlineDb.offlineOrders.delete(entry.id);
      synced += 1;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        await offlineDb.offlineOrders.update(entry.id, { status: "CONFLICT", errorMessage: error.message });
        conflicts += 1;
      } else if (error instanceof ApiClientError && error.status === 0) {
        break;
      } else {
        await offlineDb.offlineOrders.update(entry.id, { errorMessage: error instanceof Error ? error.message : "No se pudo sincronizar." });
      }
    }
  }
  return { synced, conflicts };
}
