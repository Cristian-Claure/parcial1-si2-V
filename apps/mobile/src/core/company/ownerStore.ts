import { create } from "zustand";
import type { CompanyResponse } from "@velora/contracts";
import { veloraApi } from "../api/veloraApi";
import { cachedFetch } from "../offline/cachedFetch";
import { readSetting, saveSetting } from "../offline/mobileDb";
import { resolveCompanySelection } from "./companySelection";

const OWNER_SETTING = "owner-company-id";

interface OwnerState {
  status: "idle" | "loading" | "ready" | "error";
  /** Empresas del propietario: el backend ya las filtra con TenantScopeService. */
  companies: CompanyResponse[];
  selectedCompanyId: string | null;
  error: string | null;
  load: (userId: string) => Promise<void>;
  select: (companyId: string) => Promise<void>;
  clear: () => Promise<void>;
}

/**
 * Empresa activa del propietario en el móvil. Recuerda la última elegida; con una sola empresa se
 * elige sola; con dos o más y sin elección válida se muestra "Mis empresas".
 */
export const useOwnerStore = create<OwnerState>((set, get) => ({
  status: "idle",
  companies: [],
  selectedCompanyId: null,
  error: null,

  load: async (userId) => {
    set({ status: "loading", error: null });
    try {
      const companies = await cachedFetch("owner-companies", userId, veloraApi.adminCompanies);
      const stored = (await readSetting(OWNER_SETTING)) || null;
      const selectedCompanyId = resolveCompanySelection(companies, stored);
      if (selectedCompanyId) await saveSetting(OWNER_SETTING, selectedCompanyId);
      set({ status: "ready", companies, selectedCompanyId });
    } catch (error) {
      set({ status: "error", error: error instanceof Error ? error.message : "No se pudieron cargar tus empresas." });
    }
  },

  select: async (companyId) => {
    if (!get().companies.some((company) => company.id === companyId)) throw new Error("La empresa elegida no está disponible.");
    await saveSetting(OWNER_SETTING, companyId);
    set({ selectedCompanyId: companyId });
  },

  clear: async () => {
    await saveSetting(OWNER_SETTING, "");
    set({ status: "idle", companies: [], selectedCompanyId: null, error: null });
  },
}));

export function useOwnerCompany(): CompanyResponse | null {
  return useOwnerStore((state) => state.companies.find((company) => company.id === state.selectedCompanyId) ?? null);
}
