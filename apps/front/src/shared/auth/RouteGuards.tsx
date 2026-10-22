import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { UserRole } from "@velora/contracts";
import { useAuthStore } from "../../core/auth/authStore";
import { lastStoreSlug, useCompanyStore } from "../../core/company/companyStore";
import { postLoginPath } from "../../core/auth/postLoginPath";

/** Inicio por rol para sesiones ya abiertas (el ADMIN con varias empresas pasa por /elegir-empresa desde su panel). */
function homeForRole(role: UserRole): string {
  return postLoginPath({ role, lastStoreSlug: lastStoreSlug(), adminCompanyCount: 0 });
}

export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const status = useAuthStore((state) => state.status); const user = useAuthStore((state) => state.user); const location = useLocation();
  if (status === "checking") return <div className="page-loading">Validando sesión…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;
  return children;
}

/** Rutas de compra que necesitan una tienda elegida: sin tienda → directorio /tiendas. */
export function RequireStorefront({ children }: { children: ReactNode }) {
  const storefront = useCompanyStore((state) => state.storefrontCompanyId);
  if (!storefront) return <Navigate to="/tiendas" replace />;
  return children;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status); const user = useAuthStore((state) => state.user);
  if (status === "checking") return <div className="page-loading">Validando sesión…</div>;
  if (user) return <Navigate to={homeForRole(user.role)} replace />;
  return children;
}
