import type { CompanyBrand } from "@velora/contracts";
import { useCompanyStore } from "./companyStore";

/** Marca de la tienda que el cliente está visitando (null → VÉLORA por defecto). */
export function useStorefrontBrand(): CompanyBrand | null {
  return useCompanyStore((state) => {
    const id = state.storefrontCompanyId;
    if (!id) return null;
    return state.companies.find((company) => company.id === id)?.brand ?? (state.tenantBrand?.companyId === id ? state.tenantBrand : null);
  });
}

/** Marca de la compañía activa en el panel (selector del propietario o compañía del encargado). */
export function useOperationalBrand(role: "ADMIN" | "STORE_MANAGER"): CompanyBrand | null {
  return useCompanyStore((state) => role === "ADMIN"
    ? state.companies.find((company) => company.id === state.adminCompanyId)?.brand ?? null
    : state.managerCompany?.brand ?? null);
}
