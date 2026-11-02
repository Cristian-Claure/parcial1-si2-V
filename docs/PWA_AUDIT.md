# Auditoría PWA de Trama (web)

Fecha: 2026-11-02 · Rama `feat/pwa-instalable` · Alcance: `apps/front` (vite-plugin-pwa 1.3, `generateSW`).

## Veredicto

La PWA existía (manifest, SW con precaché y caché del catálogo, aviso de versión) pero **no estaba completa**:
el aviso de "nueva versión" nunca aparecía, faltaban metadatos e íconos maskable reales, no había meta de
iOS ni botón de instalar, y el caché de datos no excluía peticiones autenticadas ni se limpiaba al salir.
Todo quedó corregido; `node scripts/verify-pwa.mjs [--url …]` lo comprueba sobre `dist` y por HTTP.

| Área | Antes | Ahora |
|---|---|---|
| Manifest | name/short_name, colores, scope/start_url y standalone correctos. Sin `lang`, `id`, atajos ni capturas; todos los íconos `"maskable any"` (el mismo PNG para ambos usos). | `id`, `lang: es`, `categories`; íconos `any` (8 tamaños) y `maskable` 192/512 separados, regenerados desde el monograma (`scripts/pwa-icons.mjs`); atajos Tiendas/Planes/Ingresar; dos portadas de marca (narrow/wide; no son capturas reales). |
| Service worker | `registerType: autoUpdate` + `skipWaiting`: el SW nuevo se activaba solo y `PwaUpdatePrompt` no se mostraba nunca. Precaché de ~21 MB (10 fotos decorativas). | `registerType: prompt`: "Hay una nueva versión… Actualizar". Precaché del shell 1,6 MB; fotos de portada con `CacheFirst` al verlas. `navigateFallback` (offline) con denylist de `/api/` y del SW de Firebase; `cleanupOutdatedCaches`. |
| Seguridad del caché | El patrón cacheaba `/api/catalog`, `/api/companies`, `/api/plans` por URL, sin mirar `Authorization`; nada se borraba al cerrar sesión. | Solo GET **sin** `Authorization` (nunca `/api/admin`, `/api/manager`, `/api/platform`); `NetworkFirst` acepta solo 200. `clearPwaDataCaches()` borra `velora-catalog-api` y `velora-catalog-images` en `logout` y al vencer el token (el precaché del shell, sin datos, se conserva). |
| iOS | Sin `apple-touch-icon` ni meta. | `apple-touch-icon` 180×180 opaco, `apple-mobile-web-app-capable`, `status-bar-style`, `title`. |
| Static Web Apps | Fallback SPA. | + `sw.js`, `registerSW.js`, `index.html` y manifest sin caché; `application/manifest+json`; `/assets/*` inmutable. |
| Instalar | **No existía** (sin `beforeinstallprompt` ni botón). | `usePwaInstall` + `InstallAppButton` (ver abajo). |
| Cola offline (Dexie, Fase 2) | Coherente: el SW no intercepta POST ni usa Background Sync; la cola (`syncOutbox`, `posSales`) va por `[companyId+userId]` y se sincroniza desde la app. | Sin cambios: al cerrar sesión los pendientes **se conservan** a propósito (se envían al volver a entrar con el mismo usuario). |

## Botón "Instalar Trama"

- `src/pwa/pwaInstall.ts`: captura `beforeinstallprompt` desde `main.tsx` (antes del primer render; `preventDefault` y guarda el evento), escucha `appinstalled` y `display-mode: standalone`, detecta iOS Safari (incluido iPadOS) y expone `promptPwaInstall()`.
- `src/pwa/usePwaInstall.ts`: `{ canInstall, isInstalled, needsIosSteps, install }` con `useSyncExternalStore`.
- `src/pwa/InstallAppButton.tsx`: Chrome/Edge/Android → `prompt()`; iOS Safari → diálogo accesible (`aria-modal`, foco, Escape) con "Compartir → Añadir a pantalla de inicio". Oculto si ya está instalada o si el navegador no permite instalar. Objetivo táctil ≥ 44 px; usa los tokens del contenedor (Trama o el tema de la tienda).
- Ubicación: encabezado y pie públicos de la plataforma (login, registro, planes, directorio), encabezado y pie de las tiendas, encabezado de `/elegir-empresa` y menú lateral de cliente, propietario (`/admin`), encargado y plataforma.

## Pruebas

`src/pwa/pwaInstall.test.tsx` (hook, iOS, botón y diálogo) y `src/pwa/pwaCaches.test.ts` (limpieza y coherencia de nombres/exclusión de `Authorization`); `scripts/verify-pwa.mjs` sobre `dist` y contra `vite preview`.

Pendiente fuera de alcance: capturas reales para el diálogo enriquecido de Chrome (hoy son portadas de marca).
