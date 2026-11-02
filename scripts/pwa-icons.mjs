#!/usr/bin/env node
// Íconos de la PWA de Trama generados desde el monograma (apps/front/public/trama-mark.svg) con
// los tokens de la plataforma. Salida en apps/front/public/icons (versionada):
//   icon-<n>.png            purpose "any": baldosa redondeada, monograma al 62 %.
//   maskable-<n>.png        purpose "maskable": fondo a sangre, monograma dentro de la zona segura (≤ 50 %).
//   apple-touch-icon.png    180×180 opaco (iOS redondea las esquinas).
//   screenshot-*.png        portadas de marca para el diálogo de instalación (no son capturas reales).
//
//   node scripts/pwa-icons.mjs

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(join(ROOT, "apps/front/package.json"))("sharp");
const OUT = join(ROOT, "apps/front/public/icons");

// Tokens de Trama (apps/front/src/styles/platform.css).
const T = { paper: "#F7F6FB", ink: "#14142B", inkSoft: "#5B5B75", accent: "#4F46E5", accentDeep: "#3730A3", selection: "#CDCAF6" };

/** Monograma de trama-mark.svg (grilla 64×64, contenido centrado en 32,34.5) en tonos claros sobre índigo. */
function mark(cx, cy, size) {
  const k = size / 48; // el monograma mide 48 de ancho en su grilla
  return `<g transform="translate(${cx} ${cy}) scale(${k}) translate(-32 -34.5)">
    <rect x="8" y="27" width="48" height="9" rx="4.5" fill="${T.selection}"/>
    <rect x="25" y="13" width="14" height="43" rx="5" fill="${T.selection}" stroke="${T.accent}" stroke-width="2.5"/>
    <rect x="8" y="13" width="48" height="10" rx="5" fill="${T.paper}" stroke="${T.accent}" stroke-width="2.5"/>
  </g>`;
}

const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
const any = (n) => svg(n, n, `<rect width="${n}" height="${n}" rx="${n * 0.22}" fill="${T.accent}"/>${mark(n / 2, n / 2, n * 0.62)}`);
const maskable = (n) => svg(n, n, `<rect width="${n}" height="${n}" fill="${T.accent}"/>${mark(n / 2, n / 2, n * 0.5)}`);
const appleTouch = (n) => svg(n, n, `<rect width="${n}" height="${n}" fill="${T.accent}"/>${mark(n / 2, n / 2, n * 0.58)}`);

function cover(w, h) {
  const tile = Math.round(Math.min(w, h) * 0.28);
  const cy = h * 0.42;
  return svg(w, h, `<rect width="${w}" height="${h}" fill="${T.paper}"/>
    <rect x="${(w - tile) / 2}" y="${cy - tile / 2}" width="${tile}" height="${tile}" rx="${tile * 0.22}" fill="${T.accent}"/>${mark(w / 2, cy, tile * 0.62)}
    <text x="${w / 2}" y="${cy + tile * 0.95}" text-anchor="middle" font-family="Georgia, 'Playfair Display', serif" font-weight="700" font-size="${tile * 0.42}" fill="${T.ink}">Trama</text>
    <text x="${w / 2}" y="${cy + tile * 1.3}" text-anchor="middle" font-family="Arial, Inter, sans-serif" font-size="${tile * 0.12}" fill="${T.inkSoft}">Tu tienda de moda, lista en minutos</text>`);
}

const jobs = [
  ...[72, 96, 128, 144, 152, 192, 384, 512].map((n) => [`icon-${n}x${n}.png`, any(n)]),
  ...[192, 512].map((n) => [`maskable-${n}x${n}.png`, maskable(n)]),
  ["apple-touch-icon.png", appleTouch(180)],
  ["screenshot-narrow.png", cover(1080, 1920)],
  ["screenshot-wide.png", cover(1920, 1080)],
];

mkdirSync(OUT, { recursive: true });
for (const [name, input] of jobs) {
  await sharp(input).png({ compressionLevel: 9 }).toFile(join(OUT, name));
  console.log(`icons/${name}`);
}
