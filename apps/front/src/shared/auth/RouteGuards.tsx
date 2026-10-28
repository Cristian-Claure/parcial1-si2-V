import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { guardRoute, homePathForRole, type UserRole } from "@velora/contracts";
import { useAuthStore } from "../../core/auth/authStore";
import { lastStoreSlug, useCompanyStore } from "../../core/company/companyStore";

/** Estado que recibe /login al redirigir desde una ruta protegida. */
export interface LoginRedirectState { from: string; expired: boolean }

/** Inicio por rol para sesiones ya abiertas (el ADMIN con varias empresas pasa por /elegir-empresa desde su panel). */
function homeForRole(role: UserRole): string {
  return homePathForRole(role, lastStoreSlug());
}

export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const status = useAuthStore((state) => state.status); const user = useAuthStore((state) => state.user);
  const expired = useAuthStore((state) => state.sessionExpired); const location = useLocation();
  const decision = guardRoute({ status, role: user?.role ?? null, path: `${location.pathname}${location.search}`, roles, expired, lastStoreSlug: lastStoreSlug() });
  if (decision.kind === "wait") return <div className="page-loading" role="status">Validando sesión…</div>;
  if (decision.kind === "login") return <Navigate to={decision.to} replace state={{ from: decision.from, expired: decision.expired } satisfies LoginRedirectState} />;
  if (decision.kind === "redirect") return <Navigate to={decision.to} replace />;
  return children;
}

/** Rutas de compra que necesitan una tienda elegida: sin tienda → directorio /tiendas. */
export function RequireStorefront({ children }: { children: ReactNode }) {
  const storefront = useCompanyStore((state) => state.storefrontCompanyId);
  if (!storefront) return <Navigate to="/tiendas" replace />;
  return children;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status); const user = useAuthStore((state) => state.user); const location = useLocation();
  const loggingOut = Boolean((location.state as { loggedOut?: boolean } | null)?.loggedOut);
  if (status === "checking" || (user && loggingOut)) return <div className="page-loading" role="status">Validando sesión…</div>;
  if (user) return <Navigate to={homeForRole(user.role)} replace />;
  return children;
}
