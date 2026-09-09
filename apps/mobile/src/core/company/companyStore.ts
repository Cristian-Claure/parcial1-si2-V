import { create } from "zustand";
import type { CompanyResponse } from "@velora/contracts";
import { veloraApi } from "../api/veloraApi";
import { cachedFetch } from "../offline/cachedFetch";
import { readSetting, saveSetting } from "../offline/mobileDb";
import { resolveCompanySelection } from "./companySelection";

const COMPANY_SETTING = "storefront-company-id";

interface CompanyState {
  status: "idle" | "loading" | "ready" | "error";
  companies: CompanyResponse[];
  selectedCompanyId: string | null;
  error: string | null;
  load: () => Promise<void>;
  select: (companyId: string) => Promise<void>;
}

export const useCompanyStore = create<CompanyState>((set, get) => ({
  status: "idle",
  companies: [],
  selectedCompanyId: null,
  error: null,

  load: async () => {
    set({ status: "loading", error: null });

    try {
      const companies = await cachedFetch(
        "companies",
        "public",
        veloraApi.companies,
      );

      const configured =
        process.env.EXPO_PUBLIC_STOREFRONT_COMPANY_ID?.trim() || null;
      const stored = await readSetting(COMPANY_SETTING);
      const requested = configured ?? stored;
      const selectedCompanyId = resolveCompanySelection(
        companies,
        requested,
      );

      if (selectedCompanyId) {
        await saveSetting(COMPANY_SETTING, selectedCompanyId);
      }

      set({
        status: "ready",
        companies,
        selectedCompanyId,
        error: null,
      });
    } catch (error) {
      set({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "No fue posible cargar la compañía.",
      });
    }
  },

  select: async (companyId) => {
    if (!get().companies.some((company) => company.id === companyId)) {
      throw new Error("La compañía seleccionada no está disponible.");
    }

    await saveSetting(COMPANY_SETTING, companyId);
    set({ selectedCompanyId: companyId, error: null });
  },
}));