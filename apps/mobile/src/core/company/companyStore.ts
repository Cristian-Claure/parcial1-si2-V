import { create } from "zustand";
import type { CompanyResponse } from "@velora/contracts";
import { veloraApi } from "../api/veloraApi";
import { cachedFetch } from "../offline/cachedFetch";
import { readSetting, saveSetting } from "../offline/mobileDb";
import { resolveStorefront } from "./storefrontSelection";

const COMPANY_SETTING = "storefront-company-id";

interface CompanyState {
  status: "idle" | "loading" | "ready" | "error";
  companies: CompanyResponse[];
  selectedCompanyId: string | null;
  /** La instalación tiene una tienda fijada por configuración (no se puede cambiar). */
  pinned: boolean;
  error: string | null;
  load: () => Promise<void>;
  select: (companyId: string) => Promise<void>;
  selectBySlug: (slug: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useCompanyStore = create<CompanyState>((set, get) => ({
  status: "idle",
  companies: [],
  selectedCompanyId: null,
  pinned: false,
  error: null,

  load: async () => {
    set({ status: "loading", error: null });

    try {
      const companies = await cachedFetch(
        "companies",
        "public",
        veloraApi.companies,
      );

      const pin =
        process.env.EXPO_PUBLIC_STOREFRONT_COMPANY_ID?.trim() || null;
      const stored = await readSetting(COMPANY_SETTING);
      const { companyId: selectedCompanyId, pinned } = resolveStorefront(companies, pin, stored);

      if (selectedCompanyId) {
        await saveSetting(COMPANY_SETTING, selectedCompanyId);
      }

      set({
        status: "ready",
        companies,
        selectedCompanyId,
        pinned,
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


  /** Selección desde el directorio público (que solo expone slugs y marca). */
  selectBySlug: async (slug) => {
    const brand = await veloraApi.companyBySlug(slug);
    if (!get().companies.some((company) => company.id === brand.companyId)) {
      set({ companies: await veloraApi.companies() });
    }
    await get().select(brand.companyId);
  },

  clear: async () => {
    if (get().pinned) return;
    await saveSetting(COMPANY_SETTING, "");
    set({ selectedCompanyId: null });
  },
}));
