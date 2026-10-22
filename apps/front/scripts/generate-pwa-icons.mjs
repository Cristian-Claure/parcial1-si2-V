import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

// Íconos de la PWA a partir del monograma vectorial de la plataforma Trama (una "T" tejida: la
// barra y el pie se cruzan por encima y por debajo). Misma geometría que <PlatformMark/>.
// Fondo índigo a sangre completa para que sirvan como íconos "maskable" (zona segura ~60 %).
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = path.join(ROOT, "public/icons");
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const ACCENT = "#4F46E5";

/**
 * Monograma en coordenadas 0..64: la barra de la "T" son dos hebras paralelas; el pie pasa por
 * DEBAJO de la hebra superior y por ENCIMA de la inferior (trama sobre urdimbre). `gap` es el
 * color del fondo, usado como contorno para que se lea el cruce.
 */
function markSvg({ bar, stem, gap }) {
  return `<rect x="8" y="27" width="48" height="9" rx="4.5" fill="${bar}" opacity="0.92"/>`
    + `<rect x="25" y="13" width="14" height="43" rx="5" fill="${stem}" stroke="${gap}" stroke-width="2.5"/>`
    + `<rect x="8" y="13" width="48" height="10" rx="5" fill="${bar}" stroke="${gap}" stroke-width="2.5"/>`;
}

const iconSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">`
  + `<rect width="64" height="64" fill="${ACCENT}"/>`
  // El monograma ocupa ~66 % del lienzo, centrado (zona segura de los íconos maskable).
  + `<g transform="translate(11 11) scale(0.66)">${markSvg({ bar: "#FFFFFF", stem: "#C9C6F7", gap: ACCENT })}</g></svg>`;

// Favicon vectorial (versión clara, fondo transparente).
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${markSvg({ bar: "#4F46E5", stem: "#3730A3", gap: "#F7F6FB" })}</svg>\n`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    await sharp(Buffer.from(iconSvg(size))).png().toFile(path.join(OUT_DIR, `icon-${size}x${size}.png`));
  }
  await writeFile(path.join(ROOT, "public/trama-mark.svg"), faviconSvg);
  console.log(`Generados ${SIZES.length} íconos de Trama en ${OUT_DIR} y public/trama-mark.svg`);
}

await main();
