import type {
  UserRole,
} from "@velora/contracts";

import {
  ApiClientError,
} from "../api/apiClient";

import {
  veloraApi,
} from "../api/veloraApi";

import {
  offlineDb,
} from "./offlineDb";

export async function syncOfflinePosSales(
  userId: string,
  role: UserRole,
): Promise<{
  synced: number;
  conflicts: number;
}> {
  if (
    !navigator.onLine ||
    (
      role !== "ADMIN" &&
      role !== "STORE_MANAGER"
    )
  ) {
    return {
      synced: 0,
      conflicts: 0,
    };
  }

  const pending =
    await offlineDb.posSales
      .where("userId")
      .equals(userId)
      .filter(
        (entry) =>
          entry.status ===
          "PENDING",
      )
      .sortBy("createdAt");

  let synced = 0;
  let conflicts = 0;

  for (
    const entry of
    pending
  ) {
    try {
      await veloraApi.createPosSale(
        role,
        entry.request,
      );

      await offlineDb.posSales.delete(
        entry.id,
      );

      synced += 1;
    }
    catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status === 409
      ) {
        await offlineDb.posSales.update(
          entry.id,
          {
            status: "CONFLICT",
            errorMessage:
              error.message,
          },
        );

        conflicts += 1;
        continue;
      }

      if (
        error instanceof ApiClientError &&
        error.status === 0
      ) {
        break;
      }

      await offlineDb.posSales.update(
        entry.id,
        {
          errorMessage:
            error instanceof Error
              ? error.message
              : "No se pudo sincronizar la venta POS.",
        },
      );
    }
  }

  return {
    synced,
    conflicts,
  };
}
