import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useOperationalBrand, useStorefrontBrand } from "../../core/company/useBrand";
import { applyStoreTheme, brandVariables, themeAreaForPath } from "../../core/theme/themeScope";

/**
 * Aplica en <html> el tema de la tienda o empresa del ámbito actual (ver core/theme/themeScope).
 * En la plataforma quita las variables: rigen :root y los tokens de Trama ([data-platform]).
 */
export function ThemeScope() {
  const location = useLocation();
  const area = themeAreaForPath(location.pathname);
  const storefront = useStorefrontBrand();
  const owner = useOperationalBrand("ADMIN");
  const manager = useOperationalBrand("STORE_MANAGER");
  const brand = area === "storefront" ? storefront : area === "owner" ? owner : area === "manager" ? manager : null;
  const key = brand ? `${brand.slug}:${brand.tier}:${brand.palette.accent}:${brand.palette.paper}:${brand.palette.ink}:${brand.palette.primary}` : "platform";

  useEffect(() => {
    // Mientras se resuelve la marca del panel se conserva el tema aplicado (caché o anterior).
    if (!brand) {
      if (area === "platform") applyStoreTheme(null, false);
      return;
    }
    applyStoreTheme({ slug: brand.slug, vars: brandVariables(brand) });
    // La clave resume la paleta: no hace falta depender del objeto brand completo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, area]);

  return null;
}
