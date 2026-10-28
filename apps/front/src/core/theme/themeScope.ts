import { deriveTheme, themeCssVariables, themeInputForBrand, webArea, type CompanyBrand } from "@velora/contracts";

/**
 * Tema por tienda en la web: las variables de deriveTheme se aplican en <html>, así cubren el
 * body, modales y portales. Ámbitos: tienda activa (/t/:slug, catálogo y área del cliente),
 * empresa elegida en /admin, empresa del encargado en /sucursal; Trama (sin variables de tienda)
 * en la plataforma y las pantallas públicas.
 */
export type ThemeArea = "storefront" | "owner" | "manager" | "platform";

const CACHE_KEY = "trama.theme.v1";
const STORE_ATTRIBUTE = "data-store-theme";

export function themeAreaForPath(path: string): ThemeArea {
  const area = webArea(path);
  if (area === "owner") return "owner";
  if (area === "manager") return "manager";
  if (area === "customer" || path.startsWith("/t/") || path === "/catalogo" || path.startsWith("/catalogo/")) return "storefront";
  return "platform";
}

export function brandVariables(brand: Pick<CompanyBrand, "tier" | "palette">): Record<string, string> {
  return themeCssVariables(deriveTheme(themeInputForBrand(brand)));
}

let applied: string[] = [];

function clearVariables(root: HTMLElement): void {
  for (const name of applied) root.style.removeProperty(name);
  applied = [];
  root.removeAttribute(STORE_ATTRIBUTE);
}

/** Aplica (o quita, con null) el tema de una tienda en el documento y lo recuerda para el próximo arranque. */
export function applyStoreTheme(store: { slug: string; vars: Record<string, string> } | null, remember = true): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  clearVariables(root);
  if (!store) return;
  for (const [name, value] of Object.entries(store.vars)) root.style.setProperty(name, value);
  applied = Object.keys(store.vars);
  root.setAttribute(STORE_ATTRIBUTE, store.slug);
  if (remember) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch { /* almacenamiento no disponible */ }
  }
}

/** Antes del primer render: aplica el último tema conocido si la ruta es de tienda o panel (evita el parpadeo). */
export function applyCachedThemeBeforePaint(path: string): void {
  if (themeAreaForPath(path) === "platform") return;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const cached = raw ? JSON.parse(raw) as { slug?: unknown; vars?: unknown } : null;
    if (cached && typeof cached.slug === "string" && cached.vars && typeof cached.vars === "object") {
      applyStoreTheme({ slug: cached.slug, vars: cached.vars as Record<string, string> }, false);
    }
  } catch { /* caché corrupta: se ignora */ }
}

/** Logout: sin tema de tienda y sin caché. */
export function resetStoreTheme(): void {
  applyStoreTheme(null);
  try { localStorage.removeItem(CACHE_KEY); } catch { /* sin almacenamiento */ }
}
