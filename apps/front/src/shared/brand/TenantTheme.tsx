import type { ReactNode } from "react";
import type { CompanyBrand } from "@velora/contracts";
import { tenantStyle } from "./tenantStyle";

/**
 * Aplica la paleta de la empresa con estilos inline en un contenedor data-tenant (sin pelear
 * especificidad con :root). VÉLORA (marca de la plataforma) no necesita contenedor.
 */
export function TenantTheme({ brand, children }: { brand: CompanyBrand | null; children: ReactNode }) {
  if (!brand || brand.isPlatformBrand) return <>{children}</>;
  return <div className="tenant-theme" data-tenant={brand.slug} style={tenantStyle(brand)}>{children}</div>;
}
