import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useParams } from "react-router-dom";
import { veloraApi } from "../../core/api/veloraApi";
import { useCompanyStore } from "../../core/company/companyStore";
import { PageLoader } from "../../shared/ui/PageLoader";

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
  if (!brand.data) return <main className="page centered"><span className="eyebrow">TIENDA</span><h1>Tienda no encontrada</h1><p>El enlace /t/{tenantSlug} no corresponde a una tienda activa.</p><Link className="button primary" to="/">Ir a VÉLORA</Link></main>;
  return <Outlet />;
}
