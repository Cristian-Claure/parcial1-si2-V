import { describe, expect, it } from "vitest";
import { brandingAllows, contrastRatio, DEFAULT_BRAND_PALETTE, resolveBrandPalette, validateBrandPalette } from "./branding.js";

function channelDistance(a: string, b: string): number {
  const parse = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const [x, y] = [parse(a), parse(b)];
  return Math.max(...x.map((value, index) => Math.abs(value - y[index]!)));
}

describe("marca: contraste WCAG AA y derivados", () => {
  it("la paleta de VÉLORA pasa AA y sus derivados se parecen a los tokens de global.css", () => {
    expect(validateBrandPalette(DEFAULT_BRAND_PALETTE)).toEqual([]);
    const resolved = resolveBrandPalette({ accent: "#8B6A34" });
    expect(channelDistance(resolved.accentDeep, "#6B4F22")).toBeLessThanOrEqual(8);
    expect(channelDistance(resolved.accentSoft, "#F0E4CF")).toBeLessThanOrEqual(10);
  });

  it("rechaza texto de bajo contraste y elige el texto del botón que mejor contrasta", () => {
    expect(validateBrandPalette({ accent: "#1F4E79", paper: "#FFFFFF", ink: "#BBBBBB" }).map((issue) => issue.field)).toContain("ink");
    expect(resolveBrandPalette({ accent: "#F5E663" }).onAccent).toBe(DEFAULT_BRAND_PALETTE.ink);
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
  });

  it("el nivel de marca define qué se puede personalizar", () => {
    expect(brandingAllows("BASIC", "accent")).toBe(true);
    expect(brandingAllows("BASIC", "fullPalette")).toBe(false);
    expect(brandingAllows("FULL_PALETTE", "banner")).toBe(false);
    expect(brandingAllows("FULL", "contact")).toBe(true);
  });
});
