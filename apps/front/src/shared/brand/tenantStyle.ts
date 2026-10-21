import type { CSSProperties } from "react";
import type { CompanyBrand } from "@velora/contracts";

/** Variables CSS de la marca: sobrescriben los tokens existentes dentro de [data-tenant]. */
export function tenantStyle(brand: CompanyBrand): CSSProperties {
  const palette = brand.palette;
  return {
    "--paper": palette.paper, "--ink": palette.ink, "--ink-soft": palette.inkSoft, "--accent": palette.accent,
    "--accent-deep": palette.accentDeep, "--accent-soft": palette.accentSoft, "--on-accent": palette.onAccent,
  } as CSSProperties;
}
