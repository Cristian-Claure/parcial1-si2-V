import { useEffect } from "react";
import { useAuthStore } from "../auth/authStore";
import { useCompanyStore } from "../company/companyStore";
import { useSyncStatus } from "./syncEngine";

/** Compañía con la que opera el usuario (selector del propietario o compañía del encargado). */
export function useOperationalCompanyId(): string | null {
  const role = useAuthStore((state) => state.user?.role);
  return useCompanyStore((state) => role === "ADMIN" ? state.adminCompanyId : role === "STORE_MANAGER" ? state.managerCompany?.id ?? null : null);
}

/** Mantiene `online` del estado de sincronización al día con el navegador. */
export function useOnlineTracking(): void {
  useEffect(() => {
    const update = () => useSyncStatus.setState({ online: navigator.onLine });
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
}
