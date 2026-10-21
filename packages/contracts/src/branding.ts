import { z } from "zod";

/**
 * Marca por compañía: validación de colores (WCAG AA) y derivados compartidos entre
 * front y back para que el editor, la vista previa y el backend apliquen la misma regla.
 */
export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use un color hexadecimal #RRGGBB.");

export const brandPaletteSchema = z.object({
  primary: hexColorSchema.optional(),
  accent: hexColorSchema,
  paper: hexColorSchema.optional(),
  ink: hexColorSchema.optional(),
});
export type BrandPalette = z.infer<typeof brandPaletteSchema>;

export const companyContactSchema = z.object({
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email("Correo de contacto inválido.").max(180).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  socials: z.record(z.enum(["instagram", "facebook", "tiktok", "whatsapp", "web"]), z.string().trim().max(200)).optional(),
});
export type CompanyContact = z.infer<typeof companyContactSchema>;

/** Tokens de VÉLORA (global.css): base de las marcas que no definen paper/ink. */
export const DEFAULT_BRAND_PALETTE = {
  primary: "#17130F",
  accent: "#8B6A34",
  paper: "#FAF6F0",
  ink: "#17130F",
} as const;

export const WCAG_AA_TEXT = 4.5;

export interface ResolvedBrandPalette {
  primary: string;
  accent: string;
  accentDeep: string;
  accentSoft: string;
  paper: string;
  ink: string;
  inkSoft: string;
  /** Texto sobre el acento (botones). */
  onAccent: string;
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a) as [number, number];
  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

/** Mezcla lineal en sRGB: weight=1 → `a`, weight=0 → `b`. */
export function mixColors(a: string, b: string, weight: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return toHex([ar * weight + br * (1 - weight), ag * weight + bg * (1 - weight), ab * weight + bb * (1 - weight)]);
}

/** accent-deep: 76% acento + 24% negro; accent-soft: 13% acento sobre paper (≈ tokens de VÉLORA). */
export function deriveAccentShades(accent: string, paper: string = DEFAULT_BRAND_PALETTE.paper): { accentDeep: string; accentSoft: string } {
  return { accentDeep: mixColors(accent, "#000000", 0.76), accentSoft: mixColors(accent, paper, 0.13) };
}

export function resolveBrandPalette(palette: Partial<BrandPalette> | null | undefined): ResolvedBrandPalette {
  const paper = palette?.paper ?? DEFAULT_BRAND_PALETTE.paper;
  const ink = palette?.ink ?? DEFAULT_BRAND_PALETTE.ink;
  const accent = palette?.accent ?? DEFAULT_BRAND_PALETTE.accent;
  const { accentDeep, accentSoft } = deriveAccentShades(accent, paper);
  return {
    primary: palette?.primary ?? ink,
    accent,
    accentDeep,
    accentSoft,
    paper,
    ink,
    inkSoft: mixColors(ink, paper, 0.62),
    onAccent: contrastRatio("#FFFFFF", accent) >= contrastRatio(ink, accent) ? "#FFFFFF" : ink,
  };
}

export interface PaletteIssue { field: keyof BrandPalette | "onAccent"; message: string; ratio: number }

/**
 * Reglas AA (texto normal ≥ 4.5): ink sobre paper, texto del botón sobre el acento y,
 * como no hay modo oscuro (D5), paper sobre ink para superficies oscuras.
 */
export function validateBrandPalette(palette: Partial<BrandPalette>): PaletteIssue[] {
  const resolved = resolveBrandPalette(palette);
  const issues: PaletteIssue[] = [];
  const inkOnPaper = contrastRatio(resolved.ink, resolved.paper);
  if (inkOnPaper < WCAG_AA_TEXT) issues.push({ field: "ink", message: `El texto sobre el fondo tiene contraste ${inkOnPaper}:1 (mínimo 4.5:1).`, ratio: inkOnPaper });
  const onAccent = contrastRatio(resolved.onAccent, resolved.accent);
  if (onAccent < WCAG_AA_TEXT) issues.push({ field: "accent", message: `El texto de los botones sobre el acento tiene contraste ${onAccent}:1 (mínimo 4.5:1).`, ratio: onAccent });
  if (resolved.primary !== resolved.ink) {
    const primaryOnPaper = contrastRatio(resolved.primary, resolved.paper);
    if (primaryOnPaper < WCAG_AA_TEXT) issues.push({ field: "primary", message: `El color primario sobre el fondo tiene contraste ${primaryOnPaper}:1 (mínimo 4.5:1).`, ratio: primaryOnPaper });
  }
  return issues;
}
