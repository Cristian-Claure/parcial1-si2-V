import type { ReactNode } from "react";
import type { CompanyBrand } from "@velora/contracts";

/**
 * Compatibilidad: el tema de la tienda ahora lo aplica <ThemeScope/> en <html> (cubre modales y
 * portales). Este componente queda como envoltura neutra para no tocar los shells que lo usan.
 */
export function TenantTheme({ children }: { brand: CompanyBrand | null; children: ReactNode }) {
  return <>{children}</>;
}
