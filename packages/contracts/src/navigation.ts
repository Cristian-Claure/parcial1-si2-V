import type { UserRole } from "./auth.js";

/**
 * Fase 4C · Redirecciones como funciones puras compartidas por la web y el móvil.
 * Ninguna decide alcance de datos (eso lo hace TenantScopeService en el backend): solo a qué
 * pantalla ir según la sesión, el rol y la ruta pedida.
 */

/** Zonas de la web por prefijo de ruta. */
export type WebArea = "public" | "customer" | "owner" | "owner-picker" | "manager" | "platform";

const CUSTOMER_PREFIXES = ["/favoritos", "/bolsa", "/checkout", "/mis-pedidos", "/mi-cuenta", "/probador", "/pago/stripe/retorno"];
const NEUTRAL_PATHS = new Set(["/", "/login", "/registro", "/registro/cliente", "/crear-tienda"]);

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function webArea(path: string): WebArea {
  const clean = path.split(/[?#]/)[0] ?? "/";
  if (matches(clean, "/admin")) return "owner";
  if (matches(clean, "/elegir-empresa")) return "owner-picker";
  if (matches(clean, "/sucursal")) return "manager";
  if (matches(clean, "/plataforma")) return "platform";
  if (CUSTOMER_PREFIXES.some((prefix) => matches(clean, prefix))) return "customer";
  return "public";
}

const AREA_ROLES: Record<WebArea, readonly UserRole[] | null> = {
  public: null,
  customer: ["CUSTOMER"],
  owner: ["ADMIN"],
  "owner-picker": ["ADMIN"],
  manager: ["STORE_MANAGER"],
  platform: ["PLATFORM_ADMIN"],
};

/** Ruta interna segura para volver tras el login (evita redirecciones abiertas y páginas de entrada). */
export function safeReturnPath(requested: string | null | undefined): string | null {
  if (!requested || !requested.startsWith("/") || requested.startsWith("//") || requested.includes("\\")) return null;
  const clean = requested.split(/[?#]/)[0] ?? "/";
  return NEUTRAL_PATHS.has(clean) ? null : requested;
}

/** ¿Puede este rol abrir la ruta? Las rutas públicas (tiendas, catálogo, planes) las abre cualquiera. */
export function canRoleOpen(role: UserRole, path: string): boolean {
  const roles = AREA_ROLES[webArea(path)];
  return roles === null || roles.includes(role);
}

export interface PostLoginContext {
  role: UserRole;
  /** Slug de la última tienda visitada (/t/:slug), si existe. */
  lastStoreSlug: string | null;
  /** Empresas activas que administra el propietario (solo relevante para ADMIN). */
  adminCompanyCount: number;
  /** Ruta protegida que se intentaba abrir antes de ingresar (`from`). */
  requested?: string | null;
}

/** Inicio de cada rol, sin considerar una ruta pedida. */
export function homePathForRole(role: UserRole, lastStoreSlug: string | null = null, adminCompanyCount = 0): string {
  switch (role) {
    case "CUSTOMER":
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

/**
 * Destino tras el login: la ruta pedida si el rol puede abrirla (el dueño con 2+ empresas pasa
 * antes por /elegir-empresa, que luego lo devuelve allí); si no, el inicio de su rol.
 */
export function postLoginPath({ role, lastStoreSlug, adminCompanyCount, requested }: PostLoginContext): string {
  const target = safeReturnPath(requested);
  if (target && canRoleOpen(role, target)) {
    if (role === "ADMIN" && adminCompanyCount >= 2 && webArea(target) === "owner") return chooseCompanyPath(target);
    return target;
  }
  return homePathForRole(role, lastStoreSlug, adminCompanyCount);
}

/** /elegir-empresa recordando a dónde volver. */
export function chooseCompanyPath(from: string | null | undefined): string {
  const target = safeReturnPath(from);
  return target && webArea(target) === "owner" && target !== "/admin" ? `/elegir-empresa?from=${encodeURIComponent(target)}` : "/elegir-empresa";
}

/** Tras elegir empresa: vuelve a la ruta del panel que se pedía (o al resumen). */
export function afterCompanyChoicePath(from: string | null | undefined): string {
  const target = safeReturnPath(from);
  return target && webArea(target) === "owner" ? target : "/admin";
}

/**
 * Al cambiar de empresa se conserva la sección (p. ej. /admin/inventario) pero se descartan los
 * parámetros de entidad, que pertenecen a la empresa anterior.
 */
export function equivalentOwnerPath(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? "/admin";
  if (webArea(clean) !== "owner") return "/admin";
  const [, admin, section] = clean.split("/");
  return section ? `/${admin}/${section}${section === "reportes" && clean.endsWith("/constructor") ? "/constructor" : ""}` : "/admin";
}

export type GuardDecision =
  | { kind: "allow" }
  | { kind: "wait" }
  | { kind: "login"; to: string; from: string; expired: boolean }
  | { kind: "redirect"; to: string };

export interface GuardInput {
  status: "checking" | "anonymous" | "authenticated";
  role: UserRole | null;
  /** Ruta pedida, con su query string. */
  path: string;
  /** Roles permitidos en esta ruta. */
  roles: readonly UserRole[];
  /** La sesión acaba de expirar (401). */
  expired?: boolean;
  lastStoreSlug?: string | null;
}

/**
 * Guarda de rutas protegidas: sin sesión → login con `from`; rol que no corresponde → su inicio
 * (un cliente que entra a /admin va al directorio /tiendas).
 */
export function guardRoute({ status, role, path, roles, expired = false, lastStoreSlug = null }: GuardInput): GuardDecision {
  if (status === "checking") return { kind: "wait" };
  if (status !== "authenticated" || !role) return { kind: "login", to: "/login", from: path, expired };
  if (roles.includes(role)) return { kind: "allow" };
  if (role === "CUSTOMER") return { kind: "redirect", to: "/tiendas" };
  return { kind: "redirect", to: homePathForRole(role, lastStoreSlug) };
}

// ---------------------------------------------------------------------------
// Móvil (expo-router)
// ---------------------------------------------------------------------------

export interface MobileHomeContext {
  status: "checking" | "anonymous" | "authenticated";
  role: UserRole | null;
  /** El cliente tiene una tienda activa (elegida o fijada por pin). */
  hasStore: boolean;
  /** El propietario tiene una empresa elegida válida. */
  ownerCompanySelected: boolean;
}

/** Pantalla inicial del móvil por rol. PLATFORM_ADMIN no usa el móvil: ve un aviso para usar la web. */
export function mobileHomePath({ status, role, hasStore, ownerCompanySelected }: MobileHomeContext): string | null {
  if (status === "checking") return null;
  if (status !== "authenticated" || !role) return "/login";
  switch (role) {
    case "CUSTOMER":
      return hasStore ? "/home" : "/stores";
    case "ADMIN":
      return ownerCompanySelected ? "/owner/dashboard" : "/owner/companies";
    case "STORE_MANAGER":
      return "/operations";
    case "PLATFORM_ADMIN":
      return "/platform-only";
    default:
      return "/login";
  }
}

/** Grupo de rutas del móvil al que pertenece cada rol. */
export function mobileGroupForRole(role: UserRole): "customer" | "owner" | "manager" | "platform" {
  return role === "CUSTOMER" ? "customer" : role === "ADMIN" ? "owner" : role === "STORE_MANAGER" ? "manager" : "platform";
}
