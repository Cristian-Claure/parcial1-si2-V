import type { UserRole } from "@velora/contracts";

export interface PostLoginContext {
  role: UserRole;
  /** Slug de la última tienda visitada (/t/:slug), si existe. */
  lastStoreSlug: string | null;
  /** Empresas que administra el propietario (solo relevante para ADMIN). */
  adminCompanyCount: number;
  /** Ruta protegida que el cliente intentaba abrir antes de ingresar. */
  requested?: string | null;
}

const NEUTRAL = new Set(["/", "/login", "/registro"]);

/**
 * Destino tras el login según el rol (Fase 4B, sin empresa por defecto):
 * CUSTOMER → ruta pedida, última tienda visitada o /tiendas · ADMIN → su panel con una empresa,
 * /elegir-empresa con dos o más · STORE_MANAGER → su sucursal · PLATFORM_ADMIN → /plataforma.
 */
export function postLoginPath({ role, lastStoreSlug, adminCompanyCount, requested }: PostLoginContext): string {
  switch (role) {
    case "CUSTOMER":
      if (requested && requested.startsWith("/") && !requested.startsWith("//") && !NEUTRAL.has(requested)) return requested;
      return lastStoreSlug ? `/t/${encodeURIComponent(lastStoreSlug)}` : "/tiendas";
    case "ADMIN":
      return adminCompanyCount >= 2 ? "/elegir-empresa" : "/admin";
    case "STORE_MANAGER":
      return "/sucursal";
    case "PLATFORM_ADMIN":
      return "/plataforma";
    default:
      return "/";
  }
}
