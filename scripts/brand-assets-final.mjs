#!/usr/bin/env node
// Logos y banners finales (Parte B · B3) de Urbano Boutique, Urbano Outlet, Andina Moda y Primer Paso.
// Monograma GEOMÉTRICO sin texto, generado con la paleta VIGENTE de cada tienda (GET .../branding),
// verificado por contraste (WCAG: ≥ 3:1 para elementos gráficos) y subido por el endpoint real de marca.
// Banner 1600×600 solo donde el plan lo permite (nivel de marca FULL); Primer Paso y Andina: solo logo.
//
//   VELORA_SEED_API_BASE=http://127.0.0.1:18080 node scripts/brand-assets-final.mjs [--dry-run]
// Los PNG también quedan en scripts/.seed-progress/brand-final/ (no versionado) para revisarlos.

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(join(ROOT, "apps/front/package.json"))("sharp");
const { contrastRatio } = await import(new URL("../packages/contracts/dist/index.js", import.meta.url));
const API = (process.env.VELORA_SEED_API_BASE ?? "http://127.0.0.1:18080").replace(/\/$/, "");
const DRY_RUN = process.argv.includes("--dry-run");
const OUT = join(ROOT, "scripts", ".seed-progress", "brand-final");
const OWNER_PASSWORD = "SeedPropietario2026"; // cuentas sembradas locales (seed-realistic-history.mjs)

/** Cada tienda tiene su figura: la forma cuenta la idea de la marca sin letras. */
const STORES = [
  { slug: "urbano-boutique", owner: "lucia.arce@urbano.seed.velora.local", mark: "towers" },
  { slug: "urbano-outlet", owner: "lucia.arce@urbano.seed.velora.local", mark: "chevrons" },
  { slug: "andina-moda", owner: "mateo.quispe@andina.seed.velora.local", mark: "peaks" },
  { slug: "primer-paso", owner: "valeria.rojas@primerpaso.seed.velora.local", mark: "steps" },
];

/** Figuras en una grilla de 100×100 (fg = forma principal, bg2 = acento secundario). */
function markShapes(kind, fg, second) {
  switch (kind) {
    case "towers": // dos torres que se cruzan: ciudad y sastrería
      return `<rect x="22" y="30" width="26" height="48" rx="4" fill="${fg}"/><rect x="52" y="20" width="26" height="58" rx="4" fill="${fg}" opacity="0.9"/>
        <rect x="40" y="44" width="20" height="34" rx="3" fill="${second}"/>`;
    case "chevrons": // tres chevrones descendentes: precio que baja
      return [0, 1, 2].map((index) => `<path d="M24 ${26 + index * 16} L50 ${44 + index * 16} L76 ${26 + index * 16}" fill="none" stroke="${index === 1 ? second : fg}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
    case "peaks": // cumbres andinas con un tejido en zigzag
      return `<path d="M14 76 L40 30 L56 56 L66 42 L86 76 Z" fill="${fg}"/><path d="M22 84 L32 76 L42 84 L52 76 L62 84 L72 76 L82 84" fill="none" stroke="${second}" stroke-width="5" stroke-linejoin="round"/>`;
    case "steps": // escalones: el primer paso
      return `<rect x="18" y="62" width="22" height="18" rx="3" fill="${fg}"/><rect x="40" y="46" width="22" height="34" rx="3" fill="${fg}" opacity="0.92"/><rect x="62" y="28" width="22" height="52" rx="3" fill="${second}"/>`;
    default:
      throw new Error(kind);
  }
}

/** Elige el par de colores con mayor contraste para la figura sobre el fondo (todos de la paleta). */
function pickColors(palette) {
  const background = palette.accent;
  const candidates = [palette.paper, palette.primary, palette.ink, palette.accentSoft].filter(Boolean);
  const ranked = candidates.map((color) => ({ color, ratio: contrastRatio(color, background) })).sort((a, b) => b.ratio - a.ratio);
  // Acento secundario: preferentemente el tono oscuro de la paleta (distingue las piezas), si alcanza 3:1.
  const second = [palette.primary, palette.ink, ...ranked.map((entry) => entry.color)].find((color) => color && color !== ranked[0].color && contrastRatio(color, background) >= 3) ?? ranked[0].color;
  return { background, fg: ranked[0].color, fgRatio: ranked[0].ratio, second, secondRatio: contrastRatio(second, background) };
}

function logoSvg(kind, colors) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="${colors.background}"/>${markShapes(kind, colors.fg, colors.second)}</svg>`;
}

function bannerSvg(kind, palette, colors) {
  // Degradado primario → acento y la figura repetida en mosaico, tenue, sin texto (el nombre lo pone la web).
  const tiles = [];
  for (let x = 0; x < 16; x += 1) for (let y = 0; y < 6; y += 1) {
    if ((x + y) % 3) continue;
    tiles.push(`<g transform="translate(${x * 100 + (y % 2) * 50} ${y * 100}) scale(0.9)" opacity="${0.08 + ((x * 7 + y) % 5) * 0.03}">${markShapes(kind, colors.fg, colors.second)}</g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${palette.primary}"/><stop offset="1" stop-color="${palette.accent}"/></linearGradient></defs>
    <rect width="1600" height="600" fill="url(#g)"/>${tiles.join("")}
    <g transform="translate(1180 140) scale(3.2)">${markShapes(kind, colors.fg, colors.second)}</g></svg>`;
}

async function http(method, path, { token, body, form } = {}) {
  const response = await fetch(`${API}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const text = await response.text();
  if (response.status >= 300) throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const tokens = new Map();
  let failed = false;
  for (const store of STORES) {
    if (!tokens.has(store.owner)) tokens.set(store.owner, (await http("POST", "/api/auth/login", { body: { email: store.owner, password: OWNER_PASSWORD } })).accessToken);
    const token = tokens.get(store.owner);
    const company = (await http("GET", "/api/admin/companies", { token })).find((entry) => entry.slug === store.slug);
    const { brand } = await http("GET", `/api/admin/companies/${company.id}/branding`, { token });
    const colors = pickColors(brand.palette);
    const ok = colors.fgRatio >= 3 && colors.secondRatio >= 3;
    failed ||= !ok;
    const logo = await sharp(Buffer.from(logoSvg(store.mark, colors))).png().toBuffer();
    writeFileSync(join(OUT, `${store.slug}-logo.png`), logo);
    const withBanner = brand.tier === "FULL";
    const banner = withBanner ? await sharp(Buffer.from(bannerSvg(store.mark, brand.palette, colors))).png().toBuffer() : null;
    if (banner) writeFileSync(join(OUT, `${store.slug}-banner.png`), banner);
    console.log(`${ok ? "✔" : "✘"} ${store.slug}: figura ${colors.fg} sobre ${colors.background} (${colors.fgRatio.toFixed(2)}:1), acento ${colors.second} (${colors.secondRatio.toFixed(2)}:1) · ${withBanner ? "logo + banner 1600×600" : `solo logo (nivel ${brand.tier})`}`);
    if (DRY_RUN || !ok) continue;
    for (const [asset, buffer] of [["logo", logo], ...(banner ? [["banner", banner]] : [])]) {
      const form = new FormData();
      form.append("file", new Blob([buffer], { type: "image/png" }), `${store.slug}-${asset}.png`);
      const saved = await http("POST", `/api/admin/companies/${company.id}/branding/${asset}`, { token, form });
      const url = saved.brand[asset === "logo" ? "logoUrl" : "bannerUrl"];
      const served = await fetch(url);
      console.log(`   ${asset} subido y servido (${served.status}, ${served.headers.get("content-type")})`);
      failed ||= served.status !== 200;
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
