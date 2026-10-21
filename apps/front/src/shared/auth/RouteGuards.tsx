import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { UserRole } from "@velora/contracts";
import { useAuthStore } from "../../core/auth/authStore";

function homeForRole(role: UserRole): string {
  return role === "ADMIN" ? "/admin" : role === "STORE_MANAGER" ? "/sucursal" : role === "PLATFORM_ADMIN" ? "/plataforma" : "/mis-pedidos";
}

export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const status = useAuthStore((state) => state.status); const user = useAuthStore((state) => state.user); const location = useLocation();
  if (status === "checking") return <div className="page-loading">Validando sesión…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;
  return children;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status); const user = useAuthStore((state) => state.user);
  if (status === "checking") return <div className="page-loading">Validando sesión…</div>;
  if (user) return <Navigate to={homeForRole(user.role)} replace />;
  return children;
}
