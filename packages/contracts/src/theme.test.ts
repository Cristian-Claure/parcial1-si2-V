import { describe, expect, it } from "vitest";
import { contrastRatio } from "./branding.js";
import { deriveTheme, hexToHsl, hslToHex, hueDistance, themeCssVariables, themeInputForBrand, type ThemeInput } from "./theme.js";

/** Paletas de muestra (las que quedan en las tiendas locales; ver docs/TEMA_PALETAS.md). */
const SAMPLE_STORES: Record<string, ThemeInput> = {
  velora: { paper: "#FAF6F0", ink: "#17130F", primary: "#17130F", accent: "#8B6A34" },
  "casa-montalvo": { paper: "#F4F1EA", ink: "#1C1F26", primary: "#23303F", accent: "#8C2F39" },
  "impetu-sport": { paper: "#F2F4F7", ink: "#0B1220", primary: "#0B1220", accent: "#C2410C" },
  solana: { paper: "#FFF8EF", ink: "#24313A", primary: "#115E59", accent: "#B8432F" },
  "urbano-boutique": { paper: "#F2F5F3", ink: "#0F1611", primary: "#183A1E", accent: "#0B7A5C" },
  "urbano-outlet": { paper: "#F4F5F2", ink: "#16180F", primary: "#2E3612", accent: "#1D5FA3" },
  "andina-moda": { paper: "#F8F2F6", ink: "#2A1426", primary: "#3E1838", accent: "#9A1F86" },
  "primer-paso": { accent: "#7238CF" },
  // Casos límite: acento claro, primario claro y acento gris.
  "acento-claro": { accent: "#FACC15" },
  "primario-claro": { paper: "#FFFFFF", ink: "#111111", primary: "#7DD3FC", accent: "#0E7490" },
  "acento-gris": { accent: "#6B7280" },
};

const AA = 4.5;

describe("deriveTheme", () => {
  it("cumple AA en todos los pares de texto y 3:1 en indicadores y gráficos", () => {
    for (const [name, input] of Object.entries(SAMPLE_STORES)) {
      const t = deriveTheme(input);
      const pairs: [string, string, string, number][] = [
        ["ink/paper", t.ink, t.paper, AA], ["ink/paperRaised", t.ink, t.paperRaised, AA],
        ["inkSoft/paper", t.inkSoft, t.paper, AA], ["inkSoft/paperRaised", t.inkSoft, t.paperRaised, AA],
        ["blanco/accentDeep", "#FFFFFF", t.accentDeep, AA], ["onAccent/accent", t.onAccent, t.accent, AA - 1.5],
        ["onPrimary/primary", t.onPrimary, t.primary, AA],
        ["sidebarInk/bg", t.sidebarInk, t.sidebarBg, AA], ["sidebarInk/bg2", t.sidebarInk, t.sidebarBg2, AA],
        ["sidebarInk/hover", t.sidebarInk, t.sidebarHover, AA], ["sidebarInk/active", t.sidebarInk, t.sidebarActive, AA],
        ["sidebarMuted/bg", t.sidebarMuted, t.sidebarBg, AA], ["sidebarMuted/bg2", t.sidebarMuted, t.sidebarBg2, AA],
        ["sidebarIndicator/bg", t.sidebarIndicator, t.sidebarBg, 3],
        ["accentDeep/paper (foco y enlaces)", t.accentDeep, t.paper, 3],
        ...t.chart.map((color, index) => [`chart${index + 1}/paper`, color, t.paper, 3] as [string, string, string, number]),
      ];
      for (const [label, fg, bg, min] of pairs) expect(contrastRatio(fg, bg), `${name} ${label}`).toBeGreaterThanOrEqual(min);
    }
  });

  it("la barra lateral es oscura (L ≤ 25 %) y conserva el matiz del primario", () => {
    for (const input of Object.values(SAMPLE_STORES)) {
      const t = deriveTheme(input);
      expect(hexToHsl(t.sidebarBg).l).toBeLessThanOrEqual(0.25 + 1e-9);
      if (hexToHsl(t.primary).s > 0.1) expect(hueDistance(t.sidebarBg, t.primary)).toBeLessThan(6);
    }
  });

  it("es determinista y dos matices distintos producen barras distintas", () => {
    expect(deriveTheme(SAMPLE_STORES["urbano-boutique"]!)).toEqual(deriveTheme(SAMPLE_STORES["urbano-boutique"]!));
    const a = deriveTheme(SAMPLE_STORES["urbano-boutique"]!); const b = deriveTheme(SAMPLE_STORES["andina-moda"]!);
    expect(a.sidebarBg).not.toBe(b.sidebarBg);
    expect(hueDistance(a.sidebarBg, b.sidebarBg)).toBeGreaterThanOrEqual(40);
  });

  it("plan FREE: con solo el acento deriva fondo, texto y primario de su matiz (no arena)", () => {
    const t = deriveTheme({ accent: "#2563EB" });
    expect(t.derivedFromAccent).toBe(true);
    // Con L 97 % el redondeo a hex desplaza unos grados el matiz del fondo.
    expect(hueDistance(t.paper, "#2563EB")).toBeLessThan(15);
    expect(hueDistance(t.sidebarBg, "#2563EB")).toBeLessThan(8);
    expect(t.paper).not.toBe("#FAF6F0");
    expect(themeInputForBrand({ tier: "BASIC", palette: { accent: "#2563EB", paper: "#FAF6F0", ink: "#17130F" } })).toEqual({ accent: "#2563EB" });
    expect(themeInputForBrand({ tier: "FULL", palette: { accent: "#2563EB", paper: "#FFFFFF" } }).paper).toBe("#FFFFFF");
  });

  it("los semánticos no cambian y las variables CSS cubren la barra, sombras y gráficos", () => {
    const vars = themeCssVariables(deriveTheme(SAMPLE_STORES.solana!));
    expect(vars["--success"]).toBe(themeCssVariables(deriveTheme(SAMPLE_STORES["primer-paso"]!))["--success"]);
    for (const key of ["--sidebar-bg", "--sidebar-active", "--shadow-rgb", "--chart-6", "--image-to", "--focus-ring", "--hairline", "--paper-raised"]) expect(vars[key]).toBeTruthy();
    expect(vars["--shadow-rgb"]).toMatch(/^\d+, \d+, \d+$/);
  });

  it("HSL ida y vuelta", () => {
    for (const hex of ["#0B7A5C", "#A3345F", "#2563EB", "#FAF6F0", "#000000", "#FFFFFF"]) expect(hslToHex(hexToHsl(hex))).toBe(hex);
  });

  it("snapshot de los tokens de las tiendas de muestra", () => {
    const tokens = Object.fromEntries(Object.entries(SAMPLE_STORES).map(([name, input]) => [name, deriveTheme(input)]));
    expect(tokens).toMatchSnapshot();
  });
});

describe("paletas sugeridas y correcciones del editor", () => {
  it("las 8 paletas sugeridas pasan la validación del backend y no tienen avisos de contraste", async () => {
    const { SUGGESTED_PALETTES, themeChecks } = await import("./theme.js");
    const { validateBrandPalette } = await import("./branding.js");
    expect(SUGGESTED_PALETTES).toHaveLength(8);
    for (const suggestion of SUGGESTED_PALETTES) {
      expect(validateBrandPalette(suggestion.palette), suggestion.id).toEqual([]);
      expect(themeChecks(suggestion.palette).filter((check) => !check.ok).map((check) => check.id), suggestion.id).toEqual([]);
      expect(themeChecks({ accent: suggestion.palette.accent }).every((check) => check.ok), `${suggestion.id} FREE`).toBe(true);
    }
  });

  it("propone una corrección que sí cumple AA", async () => {
    const { themeChecks } = await import("./theme.js");
    const checks = themeChecks({ paper: "#FFFFFF", ink: "#9CA3AF", primary: "#A5B4FC", accent: "#FACC15" });
    const ink = checks.find((check) => check.id === "ink")!;
    expect(ink.ok).toBe(false);
    expect(contrastRatio(ink.fix!.ink!, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    const primary = checks.find((check) => check.id === "primary")!;
    expect(contrastRatio(primary.fix!.primary!, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    const fixed = themeChecks({ paper: "#FFFFFF", ink: ink.fix!.ink!, primary: primary.fix!.primary!, accent: "#FACC15" });
    expect(fixed.filter((check) => ["ink", "primary"].includes(check.id)).every((check) => check.ok)).toBe(true);
  });
});
