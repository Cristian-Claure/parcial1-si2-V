import type { ReactNode } from "react";
import { Redirect } from "expo-router";
import { useCompanyStore } from "@/core/company/companyStore";
import { ErrorState, Loading } from "@/shared/ui";

/**
 * Pantallas de tienda: sin tienda elegida (y sin pin en la instalación) se va al directorio
 * /stores. Nunca se elige una tienda arbitrariamente.
 */
export function CompanyGate({ children }: { children: ReactNode }) {
  const status = useCompanyStore((state) => state.status);
  const selectedCompanyId = useCompanyStore((state) => state.selectedCompanyId);
  const error = useCompanyStore((state) => state.error);
  const load = useCompanyStore((state) => state.load);

  if (status === "idle" || status === "loading") return <Loading label="Cargando tienda…" />;
  if (status === "error") return <ErrorState message={error ?? "No fue posible cargar las tiendas."} onRetry={() => void load()} />;
  if (!selectedCompanyId) return <Redirect href={"/stores" as never} />;
  return <>{children}</>;
}
