#!/usr/bin/env node
// Verificación programática de la PWA construida (apps/front/dist) y, opcionalmente, servida.
//   pnpm build:front && node scripts/verify-pwa.mjs
//   node scripts/verify-pwa.mjs --url http://127.0.0.1:4173      (vite preview o Static Web App)
// Sale con código 1 si algo falla.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "front", "dist");
const urlArg = process.argv.indexOf("--url");
const BASE = urlArg > 0 ? process.argv[urlArg + 1]?.replace(/\/$/, "") : null;
const failures = [];
const check = (ok, label) => { console.log(`${ok ? "OK " : "ERR"} ${label}`); if (!ok) failures.push(label); };

/** Ancho y alto de un PNG (cabecera IHDR). */
function pngSize(file) {
  const head = readFileSync(file).subarray(0, 24);
  if (head.toString("latin1", 1, 4) !== "PNG") return null;
  return `${head.readUInt32BE(16)}x${head.readUInt32BE(20)}`;
}

// ---------- dist ----------
const manifestPath = join(DIST, "manifest.webmanifest");
check(existsSync(manifestPath), "dist/manifest.webmanifest existe");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
check(manifest.name === "Trama" && manifest.short_name === "Trama", "name/short_name = Trama");
check(manifest.start_url === "/" && manifest.scope === "/" && manifest.id === "/", "start_url, scope e id = /");
check(manifest.display === "standalone", "display standalone");
check(manifest.lang === "es", "lang es");
check(manifest.theme_color === "#14142B" && manifest.background_color === "#F7F6FB", "theme/background con tokens de Trama");
for (const icon of [...manifest.icons, ...(manifest.screenshots ?? []), ...(manifest.shortcuts ?? []).flatMap((s) => s.icons ?? [])]) {
  const file = join(DIST, icon.src.replace(/^\//, ""));
  check(existsSync(file) && pngSize(file) === icon.sizes, `${icon.src} mide ${icon.sizes}`);
}
for (const size of ["192x192", "512x512"]) {
  check(manifest.icons.some((i) => i.sizes === size && i.purpose === "any"), `ícono any ${size}`);
  check(manifest.icons.some((i) => i.sizes === size && i.purpose === "maskable"), `ícono maskable ${size}`);
}
check((manifest.shortcuts ?? []).length >= 1, "atajos declarados");
check(["narrow", "wide"].every((f) => manifest.screenshots?.some((s) => s.form_factor === f)), "capturas narrow y wide");

const html = readFileSync(join(DIST, "index.html"), "utf8");
check(/<link rel="manifest" href="\/manifest\.webmanifest"/.test(html), "index.html enlaza el manifest");
check(/rel="apple-touch-icon"[^>]*href="\/icons\/apple-touch-icon\.png"/.test(html) && pngSize(join(DIST, "icons/apple-touch-icon.png")) === "180x180", "apple-touch-icon 180×180");
check(/apple-mobile-web-app-capable" content="yes"/.test(html) && /apple-mobile-web-app-status-bar-style/.test(html), "meta de iOS (capable, status bar)");

const swPath = join(DIST, "sw.js");
check(existsSync(swPath), "dist/sw.js generado");
const sw = readFileSync(swPath, "utf8");
check(/precacheAndRoute\(/.test(sw) && /url:"index\.html"/.test(sw), "sw precachea el shell (index.html)");
check(/url:"icons\/icon-192x192\.png"/.test(sw) && !/screenshot-/.test(sw), "sw precachea íconos y omite las portadas");
check(/NavigationRoute/.test(sw) && /cleanupOutdatedCaches\(\)/.test(sw), "fallback de navegación y limpieza de cachés");
check(/velora-catalog-api/.test(sw) && /velora-catalog-images/.test(sw), "runtime caching del catálogo");
check((sw.match(/headers\.has\("Authorization"\)/g) ?? []).length === 2, "runtime caching excluye peticiones con Authorization");
check(!/skipWaiting\(\)/.test(sw.replace(/addEventListener\("message"[^]*?skipWaiting\(\)/, "")), "sin skipWaiting automático (aviso de nueva versión)");

const swa = JSON.parse(readFileSync(join(DIST, "staticwebapp.config.json"), "utf8"));
check(swa.navigationFallback?.rewrite === "/index.html", "staticwebapp: fallback SPA");
check(/no-cache/.test(swa.routes?.find((r) => r.route === "/sw.js")?.headers?.["Cache-Control"] ?? ""), "staticwebapp: sw.js sin caché");
check(swa.mimeTypes?.[".webmanifest"] === "application/manifest+json", "staticwebapp: tipo del manifest");

// ---------- HTTP ----------
if (BASE) {
  const get = async (path) => { const response = await fetch(`${BASE}${path}`); await response.arrayBuffer(); return response; };
  const m = await get("/manifest.webmanifest");
  check(m.status === 200 && /application\/manifest\+json/.test(m.headers.get("content-type") ?? ""), `HTTP manifest 200 application/manifest+json (${m.headers.get("content-type")})`);
  const s = await get("/sw.js");
  check(s.status === 200 && /javascript/.test(s.headers.get("content-type") ?? ""), `HTTP sw.js 200 JavaScript (${s.headers.get("content-type")})`);
  const icon = await get("/icons/icon-512x512.png");
  check(icon.status === 200 && /image\/png/.test(icon.headers.get("content-type") ?? ""), "HTTP ícono 512 image/png");
  const deep = await get("/tiendas");
  check(deep.status === 200 && /text\/html/.test(deep.headers.get("content-type") ?? ""), "HTTP ruta SPA /tiendas sirve el shell");
}

console.log(failures.length ? `\n${failures.length} verificación(es) fallida(s).` : "\nPWA verificada.");
process.exitCode = failures.length ? 1 : 0;
