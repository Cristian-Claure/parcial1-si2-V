import { create } from "zustand";
import type { CompanyBrand, CompanyResponse } from "@velora/contracts";
import { veloraApi } from "../api/veloraApi";
import { resolveCompanySelection } from "./companySelection";

const STOREFRONT_KEY = "velora.storefront.company";
const ADMIN_KEY = "velora.admin.company";
const MANAGER_KEY = "velora.manager.company";

/** La compañía del encargado se guarda para operar sin red (Fase 2). */
function storedManagerCompany(): CompanyResponse | null {
  try { const raw = localStorage.getItem(MANAGER_KEY); return raw ? JSON.parse(raw) as CompanyResponse : null; } catch { return null; }
}
const configuredCompany = import.meta.env.VITE_STOREFRONT_COMPANY_ID?.trim() || null;

interface CompanyState {
  companies: CompanyResponse[]; storefrontCompanyId: string | null; adminCompanyId: string | null;
  managerCompany: CompanyResponse | null; loading: boolean;
  /** Marca resuelta por /t/:slug (la tienda puede no estar en el listado cargado). */
  tenantBrand: CompanyBrand | null; enterTenant: (brand: CompanyBrand) => void;
  initializePublic: () => Promise<void>; loadAdmin: () => Promise<void>; loadManager: () => Promise<void>;
  selectStorefront: (id: string) => void; selectAdmin: (id: string) => void;
}

export const useCompanyStore = create<CompanyState>((set, get) => ({
  companies: [], storefrontCompanyId: configuredCompany ?? localStorage.getItem(STOREFRONT_KEY),
  adminCompanyId: localStorage.getItem(ADMIN_KEY), managerCompany: storedManagerCompany(), loading: false, tenantBrand: null,
  enterTenant: (brand) => { localStorage.setItem(STOREFRONT_KEY, brand.companyId); set({ tenantBrand: brand, storefrontCompanyId: brand.companyId }); },
  initializePublic: async () => {
    set({ loading: true });
    try {
      const companies = await veloraApi.companies();
      const selected = resolveCompanySelection(companies, get().storefrontCompanyId);
      if (selected) localStorage.setItem(STOREFRONT_KEY, selected);
      set({ companies, storefrontCompanyId: selected, loading: false });
    } catch { set({ loading: false }); }
  },
  loadAdmin: async () => {
    const companies = await veloraApi.adminCompanies();
    const selected = resolveCompanySelection(companies, get().adminCompanyId);
    if (selected) localStorage.setItem(ADMIN_KEY, selected);
    set({ companies, adminCompanyId: selected });
  },
  loadManager: async () => {
    try { const company = await veloraApi.managerCompany(); localStorage.setItem(MANAGER_KEY, JSON.stringify(company)); set({ managerCompany: company }); }
    catch { set({ managerCompany: storedManagerCompany() }); }
  },
  selectStorefront: (id) => { localStorage.setItem(STOREFRONT_KEY, id); set({ storefrontCompanyId: id }); },
  selectAdmin: (id) => { localStorage.setItem(ADMIN_KEY, id); set({ adminCompanyId: id }); },
}));
