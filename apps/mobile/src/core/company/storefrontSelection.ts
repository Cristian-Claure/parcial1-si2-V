import type { CompanyResponse } from "@velora/contracts";

/**
 * Tienda activa en el móvil (Fase 4B): sin tienda por defecto.
 * - Si hay un pin (EXPO_PUBLIC_STOREFRONT_COMPANY_ID) válido, manda el pin (instalación de una sola tienda).
 * - Si no, se conserva la última tienda elegida por el usuario si sigue activa.
 * - Si no, null → se muestra el selector de tiendas (nunca se elige una arbitrariamente).
 */
export function resolveStorefront(companies: Pick<CompanyResponse, "id">[], pin: string | null, stored: string | null): { companyId: string | null; pinned: boolean } {
  const exists = (id: string | null) => Boolean(id && companies.some((company) => company.id === id));
  if (pin && exists(pin)) return { companyId: pin, pinned: true };
  if (exists(stored)) return { companyId: stored, pinned: false };
  return { companyId: null, pinned: false };
}
