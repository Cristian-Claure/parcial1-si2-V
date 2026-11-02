/**
 * Cachés de datos del service worker (mismos nombres que `runtimeCaching` en vite.config.ts).
 * Se borran al cerrar sesión o al vencer el token: el siguiente usuario del equipo parte limpio.
 * El precaché del shell (workbox-precache-*) se conserva: no contiene datos.
 */
export const PWA_DATA_CACHES = ["velora-catalog-api", "velora-catalog-images"] as const;

export async function clearPwaDataCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try { await Promise.all(PWA_DATA_CACHES.map((name) => caches.delete(name))); }
  catch { /* sin Cache Storage (modo privado, contexto no seguro): no hay nada que limpiar */ }
}
