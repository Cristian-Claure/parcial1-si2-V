import { describe, expect, it } from "vitest";

/**
 * Tema por tienda: ningún color fijo (hex, rgb()/rgba() numérico o white/black) fuera de la lista
 * permitida. Todo lo demás usa los tokens que deriveTheme aplica por tienda.
 */
// Fuentes como texto vía Vite (sin APIs de Node): rutas relativas a src/.
const SOURCES = import.meta.glob(["../**/*.{css,ts,tsx}", "!../**/*.test.{ts,tsx}", "!../assets/**"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** Bloques de tokens permitidos (desde la línea que abre hasta su "}") y archivos de logo/datos. */
const TOKEN_BLOCKS: Record<string, string> = {
  "styles/global.css": ":root {",
  "styles/platform.css": "[data-platform][data-platform] {",
};
const ALLOWED_FILES = new Set(["shared/platform/PlatformBrand.tsx"]);
/** Datos del producto (nombre de color de la prenda → muestra), no colores de interfaz. */
const ALLOWED_LINES: Record<string, RegExp> = { "features/catalog/CatalogPages.tsx": /COLOR_SWATCHES/ };

const HEX = /(^|[^&\w])#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?(?:[0-9A-Fa-f]{2})?\b/;
const RGB = /\brgba?\(\s*\d/;
const NAMED_CSS = /:[^;{]*(?<![-\w])(white|black)(?![-\w])/;
const NAMED_TSX = /["'](white|black)["']/;

function offenders(): string[] {
  const found: string[] = [];
  for (const [key, text] of Object.entries(SOURCES)) {
    const rel = key.replace(/^\.\.\//, "");
    if (ALLOWED_FILES.has(rel)) continue;
    const lines = text.split(/\r?\n/);
    const blockStart = TOKEN_BLOCKS[rel];
    let inBlock = false;
    lines.forEach((raw, index) => {
      const line = raw.replace(/\/\*.*?\*\//g, "").replace(/^\s*\/\/.*$/, "");
      if (blockStart && line.includes(blockStart)) inBlock = true;
      const allowed = inBlock || ALLOWED_LINES[rel]?.test(line);
      if (inBlock && /^\s*}/.test(line)) inBlock = false;
      if (allowed) return;
      const css = rel.endsWith(".css");
      if (HEX.test(line) || RGB.test(line) || (css ? NAMED_CSS.test(line) : NAMED_TSX.test(line))) found.push(`${rel}:${index + 1}`);
    });
  }
  return found;
}

describe("sin colores fijos fuera de los tokens", () => {
  it("CSS, TSX y SVG usan solo variables del tema", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
    expect(offenders()).toEqual([]);
  });
});
