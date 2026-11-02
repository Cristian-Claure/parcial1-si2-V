import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt": el SW nuevo espera hasta que el usuario pulse "Actualizar" (PwaUpdatePrompt).
      // Con autoUpdate + skipWaiting el aviso de nueva versión nunca llegaba a mostrarse.
      registerType: "prompt",
      includeAssets: ["icons/icon-*.png", "icons/maskable-*.png", "icons/apple-touch-icon.png", "icons/velora-notification-*.png", "trama-mark.svg"],
      // El manifest es de la plataforma Trama (no por tienda).
      manifest: {
        id: "/",
        name: "Trama",
        short_name: "Trama",
        description: "Trama · Tu tienda de moda, lista en minutos.",
        lang: "es",
        dir: "ltr",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/",
        // Tokens de Trama: --paper (fondo del splash) y --ink (barra del sistema).
        background_color: "#F7F6FB",
        theme_color: "#14142B",
        categories: ["shopping", "business", "lifestyle"],
        icons: [
          ...[72, 96, 128, 144, 152, 192, 384, 512].map((size) => ({ src: `/icons/icon-${size}x${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })),
          { src: "/icons/maskable-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ],
        shortcuts: [
          { name: "Tiendas", short_name: "Tiendas", description: "Directorio de tiendas en Trama", url: "/tiendas", icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" }] },
          { name: "Planes", short_name: "Planes", description: "Planes para abrir tu tienda", url: "/planes", icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" }] },
          { name: "Ingresar", short_name: "Ingresar", description: "Entrar a tu cuenta", url: "/login", icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" }] }
        ],
        // Portadas de marca (scripts/pwa-icons.mjs), no capturas reales de pantalla.
        screenshots: [
          { src: "/icons/screenshot-narrow.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow", label: "Trama · tu tienda de moda" },
          { src: "/icons/screenshot-wide.png", sizes: "1920x1080", type: "image/png", form_factor: "wide", label: "Trama · tu tienda de moda" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        // Navegaciones a la API (si comparte origen) o al SW de Firebase nunca reciben el shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/firebase-cloud-messaging-push-scope\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Fuera del precaché: portadas del manifest y fotos decorativas de la portada (~20 MB);
        // las fotos se guardan al verlas (trama-static-images) para no pesar en la instalación.
        globIgnores: ["**/icons/screenshot-*.png", "**/assets/VELORA*.png"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Fase 2: lectura del catálogo sin red (la API puede estar en otro origen). Solo lecturas
        // PÚBLICAS: nada con Authorization ni de /api/admin, /api/manager o /api/platform. Los nombres
        // coinciden con PWA_DATA_CACHES (src/pwa/pwaCaches.ts), que se borran al cerrar sesión.
        runtimeCaching: [
          {
            urlPattern: ({ url, request, sameOrigin }) => sameOrigin && request.destination === "image" && url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: { cacheName: "trama-static-images", expiration: { maxEntries: 40, maxAgeSeconds: 30 * 24 * 3600 }, cacheableResponse: { statuses: [200] } }
          },
          {
            urlPattern: ({ url, request }) => request.method === "GET" && !request.headers.has("Authorization") && /^\/api\/(catalog\/(products|categories)|companies|plans)(\/|$)/.test(url.pathname) && !url.pathname.includes("/assets/"),
            handler: "NetworkFirst",
            options: { cacheName: "velora-catalog-api", networkTimeoutSeconds: 4, expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600 }, cacheableResponse: { statuses: [200] } }
          },
          {
            urlPattern: ({ url, request }) => request.method === "GET" && !request.headers.has("Authorization") && /^\/api\/(catalog|companies)\/assets\//.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "velora-catalog-images", expiration: { maxEntries: 400, maxAgeSeconds: 30 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } }
          }
        ]
      }
    })
  ]
});
