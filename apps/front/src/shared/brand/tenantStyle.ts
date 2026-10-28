import type { CSSProperties } from "react";
import type { CompanyBrand } from "@velora/contracts";
import { brandVariables } from "../../core/theme/themeScope";

/** Todas las variables del tema derivado, para vistas previas acotadas (editor de marca). */
export function tenantStyle(brand: Pick<CompanyBrand, "tier" | "palette">): CSSProperties {
  return brandVariables(brand) as CSSProperties;
}
