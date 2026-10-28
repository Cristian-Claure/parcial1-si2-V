import { useQuery } from "@tanstack/react-query";
import { ownerApi } from "@/core/api/ownerApi";
import { cachedFetch } from "@/core/offline/cachedFetch";

/** Productos de la empresa activa del propietario (con lectura en caché sin red). */
export function useManagedProducts(companyId: string | null) {
  return useQuery({ queryKey: ["owner-products", companyId], enabled: Boolean(companyId), queryFn: () => cachedFetch("owner-products", companyId!, () => ownerApi.managedProducts(companyId!)) });
}

export function useOwnerStores(companyId: string | null) {
  return useQuery({ queryKey: ["panel-stores", companyId], enabled: Boolean(companyId), queryFn: () => cachedFetch("panel-stores", companyId!, () => ownerApi.stores(companyId!)) });
}
