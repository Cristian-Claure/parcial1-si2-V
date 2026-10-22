import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "trama-mark.svg"],
      manifest: {
        name: "Trama",
        short_name: "Trama",
        description: "Trama · Tu tienda de moda, lista en minutos.",
        display: "standalone",
        scope: "/",
        start_url: "/",
        background_color: "#F7F6FB",
        theme_color: "#14142B",
        icons: [
          { src: "/icons/icon-72x72.png", sizes: "72x72", type: "image/png", purpose: "maskable any" },
          { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png", purpose: "maskable any" },
          { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png", purpose: "maskable any" },
          { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png", purpose: "maskable any" },
          { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png", purpose: "maskable any" },
          { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable any" },
          { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png", purpose: "maskable any" },
          { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable any" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Fase 2: lectura del catálogo sin red (la API puede estar en otro origen).
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => request.method === "GET" && /^\/api\/(catalog\/(products|categories)|companies|plans)(\/|$)/.test(url.pathname) && !url.pathname.includes("/assets/"),
            handler: "NetworkFirst",
            options: { cacheName: "velora-catalog-api", networkTimeoutSeconds: 4, expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } }
          },
          {
            urlPattern: ({ url, request }) => request.method === "GET" && /^\/api\/(catalog|companies)\/assets\//.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "velora-catalog-images", expiration: { maxEntries: 400, maxAgeSeconds: 30 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } }
          }
        ]
      }
    })
  ]
});