import { useEffect } from "react";
import { create } from "zustand";
import type { CompanyResponse } from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useNetworkStore } from "@/core/network/networkStore";
import { readSetting, saveSetting } from "@/core/offline/mobileDb";

const SETTING = "manager-company";

interface ManagerCompanyState { company: CompanyResponse | null; set: (company: CompanyResponse | null) => void }
const useManagerCompanyStore = create<ManagerCompanyState>((set) => ({ company: null, set: (company) => set({ company }) }));

/** Compañía del encargado: se guarda en SQLite para operar sin red. */
export async function loadManagerCompany(online: boolean): Promise<CompanyResponse | null> {
  if (online) {
    try {
      const company = await veloraApi.managerCompany();
      await saveSetting(SETTING, JSON.stringify(company));
      useManagerCompanyStore.getState().set(company);
      return company;
    } catch { /* sin red o error: se usa la copia local */ }
  }
  const stored = await readSetting(SETTING);
  const company = stored ? JSON.parse(stored) as CompanyResponse : null;
  useManagerCompanyStore.getState().set(company);
  return company;
}

export function useManagerCompany(): CompanyResponse | null {
  const company = useManagerCompanyStore((state) => state.company);
  const isConnected = useNetworkStore((state) => state.isConnected);
  useEffect(() => { if (!company) void loadManagerCompany(isConnected); }, [company, isConnected]);
  return company;
}

/** Empresa del encargado ya cargada (sin disparar la carga): la usa el tema activo. */
export function useLoadedManagerCompany(): CompanyResponse | null {
  return useManagerCompanyStore((state) => state.company);
}

/**
 * Empresa para el Modo operaciones (registrar producto/cliente): la del encargado o, para el
 * propietario, su empresa activa. El backend (sync push/pull) vuelve a validar el alcance.
 */
export function useOperationsCompany(role: string | undefined, ownerCompany: CompanyResponse | null): CompanyResponse | null {
  const manager = useManagerCompanyStore((state) => state.company);
  return role === "ADMIN" ? ownerCompany : manager;
}
