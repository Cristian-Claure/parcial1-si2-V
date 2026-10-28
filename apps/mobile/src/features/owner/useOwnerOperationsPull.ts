import { useEffect } from "react";
import { runOperationsSync, useOperationsSync } from "@/core/sync/syncEngine";

/**
 * Propietario en el Modo operaciones: al abrir los formularios sincroniza la empresa activa
 * (cola local + pull de categorías y almacenes). El encargado lo hace en su propio layout.
 */
export function useOwnerOperationsPull(role: string | undefined, userId: string, companyId: string | null, isConnected: boolean): void {
  useEffect(() => {
    if (role !== "ADMIN" || !companyId) return;
    void useOperationsSync.getState().refresh(companyId, userId);
    if (isConnected) void runOperationsSync(userId, companyId);
  }, [role, userId, companyId, isConnected]);
}
