import assert from "node:assert/strict";
import test from "node:test";
import { contrastRatio, deriveAccentShades, resolveBrandPalette, TRAMA_TOKENS } from "@velora/contracts";
import { buildPlatformTheme, buildStoreTheme, ensureContrast } from "../src/shared/theme/tokens.ts";

const AA = 4.5;

test("Trama usa exactamente los tokens de la web", () => {
  assert.deepEqual({ ...TRAMA_TOKENS }, {
    paper: "#F7F6FB", paperRaised: "#FFFFFF", ink: "#14142B", inkSoft: "#5B5B75", hairline: "#E4E3EF",
    accent: "#4F46E5", accentDeep: "#3730A3", accentSoft: "#E8E7FB", highlight: "#F2B544",
  });
  const { colors } = buildPlatformTheme();
  for (const key of Object.keys(TRAMA_TOKENS) as (keyof typeof TRAMA_TOKENS)[]) assert.equal(colors[key], TRAMA_TOKENS[key], key);
});

test("Trama cumple AA en texto, texto suave y botones", () => {
  const { colors } = buildPlatformTheme();
  assert.ok(contrastRatio(colors.ink, colors.paper) >= AA);
  assert.ok(contrastRatio(colors.inkSoft, colors.paper) >= AA);
  assert.ok(contrastRatio(colors.onAccent, colors.accent) >= AA);
  assert.ok(contrastRatio(colors.accentDeep, colors.paper) >= AA);
});

const samplePalettes = [
  null, // sin marca: base de VÉLORA en contracts
  { accent: "#8B6A34" },
  { accent: "#0F766E", paper: "#F4F7F6", ink: "#10201C" },
  { accent: "#C2410C", primary: "#7C2D12" },
  { accent: "#E11D48", paper: "#FFF7F9", ink: "#2B0A14" },
  { accent: "#FACC15" }, // acento claro: el texto del botón debe pasar a ink
];

test("la paleta de cada tienda deriva accent-deep/soft con las funciones compartidas y cumple AA", () => {
  for (const palette of samplePalettes) {
    const resolved = resolveBrandPalette(palette);
    const { colors, mode } = buildStoreTheme(palette, "t");
    assert.equal(mode, "store");
    assert.equal(colors.accent, resolved.accent);
    assert.equal(colors.accentSoft, deriveAccentShades(resolved.accent, resolved.paper).accentSoft);
    assert.equal(colors.onAccent, resolved.onAccent);
    assert.ok(contrastRatio(colors.ink, colors.paper) >= AA, `ink ${JSON.stringify(palette)}`);
    assert.ok(contrastRatio(colors.inkSoft, colors.paperRaised) >= AA, `inkSoft ${JSON.stringify(palette)}`);
    assert.ok(contrastRatio(colors.accentDeep, colors.paper) >= AA, `accentDeep ${JSON.stringify(palette)}`);
    assert.ok(contrastRatio(colors.onPrimary, colors.primary) >= AA, `onPrimary ${JSON.stringify(palette)}`);
  }
});

test("los colores semánticos no cambian con la marca", () => {
  const a = buildStoreTheme({ accent: "#0F766E" }).colors;
  const b = buildPlatformTheme().colors;
  for (const key of ["success", "warning", "error", "info"] as const) {
    assert.equal(a[key], b[key]);
    assert.ok(contrastRatio(a[key], a[`${key}Soft`]) >= AA, key);
  }
});

test("cambiar de tienda cambia la clave del tema (y por lo tanto los estilos memoizados)", () => {
  assert.notEqual(buildStoreTheme({ accent: "#0F766E" }, "a").key, buildStoreTheme({ accent: "#C2410C" }, "b").key);
  assert.equal(buildStoreTheme({ accent: "#0F766E" }, "a").key, buildStoreTheme({ accent: "#0F766E" }, "a").key);
});

test("ensureContrast oscurece hasta AA", () => {
  const fixed = ensureContrast("#BBBBBB", "#FFFFFF");
  assert.ok(contrastRatio(fixed, "#FFFFFF") >= AA);
});
