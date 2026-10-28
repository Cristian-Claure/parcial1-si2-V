#!/usr/bin/env node
// Verifica el tema de cada tienda listada (directorio público), con la misma derivación que la web:
//   1. contraste AA de los pares de texto (≥ 4,5) y de indicadores y gráficos (≥ 3);
//   2. diversidad: ningún par de tiendas comparte matiz de acento ni de barra lateral (≥ 40°).
// Las tiendas que se conservaron tal cual (VÉLORA, Casa Montalvo, Ímpetu Sport y Solana) ya tenían
// acentos cercanos entre sí; esos pares se informan como aviso y no hacen fallar la verificación.
// Sale con código 1 si algo falla. Solo lectura (endpoints públicos).
//
//   node scripts/verify-theme.mjs              # API en VELORA_DEMO_API_BASE o http://127.0.0.1:8080
//   $env:VELORA_DEMO_API_BASE="http://127.0.0.1:18080"; node scripts/verify-theme.mjs

import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { contrastRatio, deriveTheme, hexToHsl, hueDistance, themeInputForBrand, WCAG_AA_TEXT } = await import(pathToFileURL(join(ROOT, "packages/contracts/dist/index.js")).href);
const API = (process.env.VELORA_DEMO_API_BASE || "http://127.0.0.1:8080").replace(/\/$/, "");
const PRESERVED = new Set(["velora", "casa-montalvo", "impetu-sport", "solana"]);
const MIN_HUE = 40;
const failures = [];
const warnings = [];

const get = async (path) => {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  return response.json();
};

const directory = await get("/api/companies/directory");
const stores = [];
for (const entry of directory) {
  const brand = await get(`/api/companies/by-slug/${entry.slug}`);
  const theme = deriveTheme(themeInputForBrand(brand));
  stores.push({ slug: entry.slug, tier: brand.tier, theme });
  const pairs = [
    ["texto/fondo", theme.ink, theme.paper, WCAG_AA_TEXT], ["texto suave/fondo", theme.inkSoft, theme.paper, WCAG_AA_TEXT],
    ["texto suave/tarjeta", theme.inkSoft, theme.paperRaised, WCAG_AA_TEXT], ["blanco/acento profundo", "#FFFFFF", theme.accentDeep, WCAG_AA_TEXT],
    ["texto/primario", theme.onPrimary, theme.primary, WCAG_AA_TEXT], ["barra: texto/fondo", theme.sidebarInk, theme.sidebarBg, WCAG_AA_TEXT],
    ["barra: texto/activo", theme.sidebarInk, theme.sidebarActive, WCAG_AA_TEXT], ["barra: secundario/fondo", theme.sidebarMuted, theme.sidebarBg2, WCAG_AA_TEXT],
    ["barra: indicador/fondo", theme.sidebarIndicator, theme.sidebarBg, 3],
    ...theme.chart.map((color, index) => [`gráfico ${index + 1}/fondo`, color, theme.paper, 3]),
  ];
  for (const [label, fg, bg, min] of pairs) {
    const ratio = contrastRatio(fg, bg);
    if (ratio < min) failures.push(`${entry.slug}: ${label} ${ratio}:1 < ${min}:1`);
  }
}

for (let i = 0; i < stores.length; i += 1) {
  for (let j = i + 1; j < stores.length; j += 1) {
    const a = stores[i]; const b = stores[j];
    const accent = hueDistance(a.theme.accent, b.theme.accent);
    const sidebar = hueDistance(a.theme.sidebarBg, b.theme.sidebarBg);
    if (accent >= MIN_HUE && sidebar >= MIN_HUE) continue;
    const message = `${a.slug} ~ ${b.slug}: acento ${accent.toFixed(0)}°, barra ${sidebar.toFixed(0)}°`;
    (PRESERVED.has(a.slug) && PRESERVED.has(b.slug) ? warnings : failures).push(message);
  }
}

const hue = (hex) => `${Math.round(hexToHsl(hex).h)}°`;
console.log(`Tema por tienda contra ${API}\n`);
console.log("tienda            nivel         acento        barra         fondo     AA texto suave");
for (const { slug, tier, theme } of stores) {
  console.log(`${slug.padEnd(17)} ${tier.padEnd(13)} ${theme.accent} ${hue(theme.accent).padStart(4)}  ${theme.sidebarBg} ${hue(theme.sidebarBg).padStart(4)}  ${theme.paper}  ${contrastRatio(theme.inkSoft, theme.paper)}:1`);
}
if (warnings.length) console.log(`\nAvisos (tiendas conservadas tal cual):\n  ${warnings.join("\n  ")}`);
console.log(failures.length ? `\n✘ ${failures.length} problemas:\n  ${failures.join("\n  ")}` : `\n✔ ${stores.length} tiendas: AA y diversidad de matiz correctos.`);
process.exit(failures.length || stores.length === 0 ? 1 : 0);
