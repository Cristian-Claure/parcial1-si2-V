import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useParams } from "react-router-dom";
import { veloraApi } from "../../core/api/veloraApi";
import { useCompanyStore } from "../../core/company/companyStore";
import { PageLoader } from "../../shared/ui/PageLoader";
import { StoreCard } from "../platform-entry/DirectoryPage";
import { PlatformTheme } from "../../shared/platform/PlatformBrand";

/**
 * /t/:tenantSlug fija la tienda activa (storefrontCompanyId) y su marca; las rutas hijas
 * reutilizan las páginas existentes (home y catálogo) sin refactorizar el resto.
 */
export function TenantEntry() {
  const { tenantSlug = "" } = useParams();
  const enterTenant = useCompanyStore((state) => state.enterTenant); const current = useCompanyStore((state) => state.storefrontCompanyId);
  const brand = useQuery({ queryKey: ["tenant-brand", tenantSlug], queryFn: () => veloraApi.companyBySlug(tenantSlug), retry: false });
  useEffect(() => { if (brand.data) enterTenant(brand.data); }, [brand.data, enterTenant]);
  if (brand.isLoading || (brand.data && current !== brand.data.companyId)) return <PageLoader />;
  if (!brand.data) return <TenantNotFound slug={tenantSlug} />;
  return <Outlet />;
}

/** Enlace roto o tienda inactiva: se explica y se ofrece el directorio ahí mismo. */
function TenantNotFound({ slug }: { slug: string }) {
  const directory = useQuery({ queryKey: ["directory", "", null], queryFn: () => veloraApi.directory({ q: "", segment: null }) });
  return <PlatformTheme><main className="platform-main">
    <div className="tenant-missing">
      <span className="eyebrow">TIENDA</span>
      <h1>Tienda no encontrada</h1>
      <p>La dirección /t/{slug} no corresponde a una tienda activa. Puede que haya cambiado de nombre: elige una del directorio.</p>
      <Link className="button primary" to="/tiendas">Ver todas las tiendas</Link>
    </div>
    <div className="store-grid">{directory.data?.slice(0, 6).map((entry) => <StoreCard key={entry.slug} entry={entry} />)}</div>
  </main></PlatformTheme>;
}
