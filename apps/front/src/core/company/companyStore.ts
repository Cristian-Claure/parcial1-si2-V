import { create } from "zustand";
import type { CompanyBrand, CompanyResponse } from "@velora/contracts";
import { veloraApi } from "../api/veloraApi";
import { resolveCompanySelection } from "./companySelection";

const STOREFRONT_KEY = "velora.storefront.company";
const STOREFRONT_SLUG_KEY = "velora.storefront.slug";
const ADMIN_KEY = "velora.admin.company";
const MANAGER_KEY = "velora.manager.company";

/** La compañía del encargado se guarda para operar sin red (Fase 2). */
function storedManagerCompany(): CompanyResponse | null {
  try { const raw = localStorage.getItem(MANAGER_KEY); return raw ? JSON.parse(raw) as CompanyResponse : null; } catch { return null; }
}

/** Slug de la última tienda visitada (para volver a ella tras el login). Sin tienda fijada por defecto. */
export function lastStoreSlug(): string | null {
  try { return localStorage.getItem(STOREFRONT_SLUG_KEY); } catch { return null; }
}

interface CompanyState {
  companies: CompanyResponse[]; storefrontCompanyId: string | null; adminCompanyId: string | null;
  managerCompany: CompanyResponse | null; loading: boolean;
  /** Marca resuelta por /t/:slug (la tienda puede no estar en el listado cargado). */
  tenantBrand: CompanyBrand | null; enterTenant: (brand: CompanyBrand) => void;
  initializePublic: () => Promise<void>; loadAdmin: () => Promise<void>; loadManager: () => Promise<void>;
  selectStorefront: (id: string) => void; selectAdmin: (id: string) => void;
  /** Logout: olvida empresa del panel y tienda activa (el tema vuelve a Trama). */
  reset: () => void;
}

export const useCompanyStore = create<CompanyState>((set, get) => ({
  companies: [], storefrontCompanyId: localStorage.getItem(STOREFRONT_KEY),
  adminCompanyId: localStorage.getItem(ADMIN_KEY), managerCompany: storedManagerCompany(), loading: false, tenantBrand: null,
  enterTenant: (brand) => { localStorage.setItem(STOREFRONT_KEY, brand.companyId); localStorage.setItem(STOREFRONT_SLUG_KEY, brand.slug); set({ tenantBrand: brand, storefrontCompanyId: brand.companyId }); },
  initializePublic: async () => {
    set({ loading: true });
    try {
      const companies = await veloraApi.companies();
      // Fase 4B: nunca se elige una tienda por defecto; solo se conserva la última visitada si sigue activa.
      const current = get().storefrontCompanyId;
      const selected = current && companies.some((company) => company.id === current) ? current : null;
      if (!selected) { localStorage.removeItem(STOREFRONT_KEY); localStorage.removeItem(STOREFRONT_SLUG_KEY); }
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
  reset: () => {
    // Se conserva solo el slug de la última tienda visitada (para volver a ella tras el próximo login).
    for (const key of [STOREFRONT_KEY, ADMIN_KEY, MANAGER_KEY]) localStorage.removeItem(key);
    set({ storefrontCompanyId: null, adminCompanyId: null, managerCompany: null, tenantBrand: null });
  },
}));
