import { contrastRatio, mixColors, WCAG_AA_TEXT, type BrandPalette } from "./branding.js";

/**
 * Tema derivado completo de una tienda a partir de los 4 colores que elige el dueño
 * (fondo, texto, primario, acento). Lo usan la web (variables CSS) y cualquier cliente que quiera
 * los mismos tokens. Es determinista: misma paleta → mismos tokens.
 *
 * Reglas (HSL): paper-raised aclara el fondo con blanco; hairline e ink-soft mezclan texto y fondo
 * conservando el matiz del fondo; accent-deep oscurece el acento hasta AA contra blanco; la barra
 * lateral es el primario llevado a una luminosidad de 14–20 % si no es oscuro; los gráficos usan 6
 * matices armónicos (acento, ±30°, ±150° y el primario). Con un solo color (plan FREE) se derivan
 * fondo, texto y primario desde el matiz del acento.
 */

export interface ThemeInput {
  paper?: string | null | undefined;
  ink?: string | null | undefined;
  primary?: string | null | undefined;
  accent: string;
}

export interface DerivedTheme {
  paper: string;
  paperRaised: string;
  hairline: string;
  ink: string;
  inkSoft: string;
  primary: string;
  onPrimary: string;
  accent: string;
  accentDeep: string;
  accentSoft: string;
  onAccent: string;
  sidebarBg: string;
  sidebarBg2: string;
  sidebarInk: string;
  sidebarMuted: string;
  sidebarHover: string;
  sidebarActive: string;
  sidebarIndicator: string;
  sidebarLine: string;
  /** "r, g, b" del ink para sombras y overlays: rgba(var(--shadow-rgb), α). */
  shadowRgb: string;
  chart: [string, string, string, string, string, string];
  imageFrom: string;
  imageTo: string;
  selection: string;
  focusRing: string;
  scrollbarThumb: string;
  scrollbarTrack: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  errorSoft: string;
  /** La paleta tenía solo el acento y el resto se derivó (plan FREE). */
  derivedFromAccent: boolean;
}

/** Colores semánticos: no cambian con la marca. */
export const SEMANTIC_COLORS = {
  success: "#2F6B45", successSoft: "#E3F1E8",
  warning: "#8A5A12", warningSoft: "#FBF0DC",
  error: "#9B2C2C", errorSoft: "#FBE7E7",
} as const;

const WHITE = "#FFFFFF";
const BLACK = "#000000";

export interface Hsl { h: number; s: number; l: number }

export function hexToHsl(hex: string): Hsl {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255; const g = ((value >> 8) & 255) / 255; const b = (value & 255) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360 / 360;
  const sat = Math.min(1, Math.max(0, s)); const lig = Math.min(1, Math.max(0, l));
  const toRgb = (p: number, q: number, t: number) => {
    let x = t; if (x < 0) x += 1; if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  let r = lig; let g = lig; let b = lig;
  if (sat !== 0) {
    const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat; const p = 2 * lig - q;
    r = toRgb(p, q, hue + 1 / 3); g = toRgb(p, q, hue); b = toRgb(p, q, hue - 1 / 3);
  }
  return `#${[r, g, b].map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

const withL = (hex: string, l: number) => { const hsl = hexToHsl(hex); return hslToHex({ ...hsl, l }); };

/** Lleva `foreground` hacia `toward` hasta alcanzar `minimum` de contraste sobre `background`. */
export function ensureContrastOn(foreground: string, background: string, toward: string, minimum = WCAG_AA_TEXT): string {
  let color = foreground;
  for (let step = 0; step < 40 && contrastRatio(color, background) < minimum; step += 1) color = mixColors(color, toward, 0.9);
  return color;
}

/** Ajusta la luminosidad (conservando matiz y saturación) hasta el contraste pedido. */
function adjustLightness(hex: string, background: string, minimum: number, direction: "darker" | "lighter"): string {
  const hsl = hexToHsl(hex);
  let color = hex;
  for (let step = 0; step < 100 && contrastRatio(color, background) < minimum; step += 1) {
    hsl.l = direction === "darker" ? Math.max(0, hsl.l - 0.01) : Math.min(1, hsl.l + 0.01);
    color = hslToHex(hsl);
  }
  return color;
}

const rgbTriplet = (hex: string) => { const v = Number.parseInt(hex.slice(1), 16); return `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`; };

/** Fondo, texto y primario derivados del matiz del acento (plan FREE: un solo color). */
export function deriveBaseFromAccent(accent: string): { paper: string; ink: string; primary: string } {
  const { h, s } = hexToHsl(accent);
  const tint = Math.min(s, 0.35);
  return {
    paper: hslToHex({ h, s: tint * 0.7, l: 0.97 }),
    ink: hslToHex({ h, s: Math.min(s, 0.4), l: 0.11 }),
    primary: hslToHex({ h, s: Math.max(0.3, Math.min(s, 0.6)), l: 0.2 }),
  };
}

export function deriveTheme(input: ThemeInput): DerivedTheme {
  const accent = input.accent.toUpperCase();
  const derivedFromAccent = !input.paper && !input.ink && !input.primary;
  const base = deriveBaseFromAccent(accent);
  const paper = (input.paper ?? base.paper).toUpperCase();
  const paperRaised = mixColors(WHITE, paper, 0.6);
  const ink = ensureContrastOn((input.ink ?? base.ink).toUpperCase(), paper, BLACK); // paper es el fondo más oscuro: el más exigente para el texto
  const primary = (input.primary ?? (derivedFromAccent ? base.primary : ink)).toUpperCase();
  const hairline = mixColors(ink, paper, 0.12);
  // AA contra el más exigente de los dos fondos (paper y paper-raised).
  const inkSoft = ensureContrastOn(ensureContrastOn(mixColors(ink, paper, 0.6), paperRaised, ink), paper, ink);
  const accentDeep = adjustLightness(withL(accent, Math.max(0, hexToHsl(accent).l - 0.08)), WHITE, WCAG_AA_TEXT, "darker");
  const accentSoft = mixColors(accent, paper, 0.14);
  const onAccent = contrastRatio(WHITE, accent) >= contrastRatio(ink, accent) ? WHITE : ink;
  const onPrimary = contrastRatio(WHITE, primary) >= contrastRatio(ink, primary) ? WHITE : ink;

  // Barra lateral: primario oscuro (L ≤ 25 %) tal cual; si no, oscurecido a L 18 % con el mismo matiz.
  const primaryHsl = hexToHsl(primary);
  const sidebarHsl = primaryHsl.l <= 0.25
    ? primaryHsl
    : { h: primaryHsl.h, s: primaryHsl.s < 0.06 ? primaryHsl.s : Math.min(0.55, Math.max(0.22, primaryHsl.s)), l: 0.18 };
  const sidebarBg = hslToHex(sidebarHsl);
  const sidebarBg2 = hslToHex({ ...sidebarHsl, l: Math.min(0.3, sidebarHsl.l + 0.04) });
  const sidebarHover = hslToHex({ ...sidebarHsl, l: Math.min(0.34, sidebarHsl.l + 0.06) });
  const sidebarInk = hslToHex({ h: sidebarHsl.h, s: Math.min(0.3, sidebarHsl.s), l: 0.96 });
  const sidebarActive = mixColors(accent, sidebarBg, 0.28);
  const lightest = [sidebarBg2, sidebarHover, sidebarActive].sort((a, b) => contrastRatio(WHITE, a) - contrastRatio(WHITE, b))[0]!;
  const sidebarMuted = adjustLightness(hslToHex({ h: sidebarHsl.h, s: Math.min(0.2, sidebarHsl.s), l: 0.72 }), lightest, WCAG_AA_TEXT, "lighter");
  const sidebarIndicator = adjustLightness(accent, sidebarBg, 3, "lighter");

  // Gráficos: acento, ±30°, ±150° y el matiz del primario, legibles (≥ 3:1) sobre el fondo.
  const accentHsl = hexToHsl(accent);
  const sat = Math.max(0.42, Math.min(0.72, accentHsl.s));
  const seeds: Hsl[] = [
    accentHsl,
    { h: accentHsl.h + 30, s: sat, l: 0.42 },
    { h: accentHsl.h - 30, s: sat, l: 0.34 },
    { h: accentHsl.h + 150, s: sat * 0.9, l: 0.4 },
    { h: accentHsl.h - 150, s: sat * 0.9, l: 0.3 },
    { h: primaryHsl.h, s: Math.max(0.3, primaryHsl.s), l: 0.28 },
  ];
  const chart = seeds.map((seed) => adjustLightness(hslToHex(seed), paper, 3, "darker")) as DerivedTheme["chart"];

  return {
    paper, paperRaised, hairline, ink, inkSoft, primary, onPrimary,
    accent, accentDeep, accentSoft, onAccent,
    sidebarBg, sidebarBg2, sidebarInk, sidebarMuted, sidebarHover, sidebarActive, sidebarIndicator,
    sidebarLine: "rgba(255, 255, 255, 0.1)",
    shadowRgb: rgbTriplet(ink),
    chart,
    imageFrom: paper,
    imageTo: mixColors(accent, paper, 0.1),
    selection: mixColors(accent, paper, 0.25),
    focusRing: accentDeep,
    scrollbarThumb: mixColors(ink, paper, 0.3),
    scrollbarTrack: paper,
    ...SEMANTIC_COLORS,
    derivedFromAccent,
  };
}

/** Entrada para deriveTheme según el nivel de marca del plan: BASIC (FREE) solo aporta el acento. */
export function themeInputForBrand(brand: { tier: "BASIC" | "FULL_PALETTE" | "FULL"; palette: Pick<BrandPalette, "accent"> & Partial<BrandPalette> }): ThemeInput {
  if (brand.tier === "BASIC") return { accent: brand.palette.accent };
  return { accent: brand.palette.accent, paper: brand.palette.paper, ink: brand.palette.ink, primary: brand.palette.primary };
}

/** Variables CSS (nombres kebab) para aplicar el tema en el documento. */
export function themeCssVariables(theme: DerivedTheme): Record<string, string> {
  return {
    "--paper": theme.paper, "--paper-raised": theme.paperRaised, "--hairline": theme.hairline,
    "--ink": theme.ink, "--ink-soft": theme.inkSoft, "--primary": theme.primary, "--on-primary": theme.onPrimary,
    "--accent": theme.accent, "--accent-deep": theme.accentDeep, "--accent-soft": theme.accentSoft, "--on-accent": theme.onAccent,
    "--terracotta": theme.chart[1],
    "--sidebar-bg": theme.sidebarBg, "--sidebar-bg-2": theme.sidebarBg2, "--sidebar-ink": theme.sidebarInk,
    "--sidebar-muted": theme.sidebarMuted, "--sidebar-hover": theme.sidebarHover, "--sidebar-active": theme.sidebarActive,
    "--sidebar-indicator": theme.sidebarIndicator, "--sidebar-line": theme.sidebarLine,
    "--shadow-rgb": theme.shadowRgb,
    "--chart-1": theme.chart[0], "--chart-2": theme.chart[1], "--chart-3": theme.chart[2],
    "--chart-4": theme.chart[3], "--chart-5": theme.chart[4], "--chart-6": theme.chart[5],
    "--image-from": theme.imageFrom, "--image-to": theme.imageTo,
    "--selection": theme.selection, "--focus-ring": theme.focusRing,
    "--scrollbar-thumb": theme.scrollbarThumb, "--scrollbar-track": theme.scrollbarTrack,
    "--success": theme.success, "--success-soft": theme.successSoft,
    "--warning": theme.warning, "--warning-soft": theme.warningSoft,
    "--error": theme.error, "--error-soft": theme.errorSoft,
  };
}

/** Diferencia angular de matiz (0–180°). */
export function hueDistance(a: string, b: string): number {
  const diff = Math.abs(hexToHsl(a).h - hexToHsl(b).h) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Paletas armónicas sugeridas en el editor de marca (todas cumplen AA con deriveTheme). */
export const SUGGESTED_PALETTES: readonly { id: string; name: string; description: string; palette: { paper: string; ink: string; primary: string; accent: string } }[] = [
  { id: "sastreria", name: "Sastrería", description: "Azul medianoche y dorado viejo", palette: { paper: "#F3F1EC", ink: "#1A1C22", primary: "#1F2A3A", accent: "#8A6A2F" } },
  { id: "deportivo", name: "Deportivo", description: "Marino profundo y naranja", palette: { paper: "#F2F5F8", ink: "#0C1220", primary: "#0F1B2D", accent: "#B93A0B" } },
  { id: "verano", name: "Verano", description: "Arena clara, turquesa y coral", palette: { paper: "#FFF9F2", ink: "#2B1E16", primary: "#0E5E6F", accent: "#C03A2B" } },
  { id: "minimal", name: "Minimal", description: "Blanco, negro y grafito", palette: { paper: "#FAFAFA", ink: "#111111", primary: "#18181B", accent: "#3F3F46" } },
  { id: "bosque", name: "Bosque", description: "Verde musgo y salvia", palette: { paper: "#F1F5F1", ink: "#102016", primary: "#1B3B26", accent: "#2F7D4A" } },
  { id: "vino", name: "Vino", description: "Burdeos y rosa empolvado", palette: { paper: "#F8F1F2", ink: "#26121A", primary: "#4A1525", accent: "#8E1B3D" } },
  { id: "oceano", name: "Océano", description: "Petróleo y turquesa", palette: { paper: "#F0F6F8", ink: "#0B1F2A", primary: "#0B3B4F", accent: "#0E7490" } },
  { id: "terracota", name: "Terracota", description: "Barro cocido y crema", palette: { paper: "#FBF4EE", ink: "#2A1A12", primary: "#5A2A17", accent: "#B4532A" } },
];

export interface ThemeCheck { id: "ink" | "inkSoft" | "button" | "primary" | "sidebar"; label: string; ratio: number; minimum: number; ok: boolean; fix: Partial<ThemeInput> | null }

/**
 * Contrastes que muestra el editor de marca y la corrección propuesta para cada color que no
 * cumple AA (texto más oscuro, acento más oscuro o primario más oscuro, conservando el matiz).
 */
export function themeChecks(input: ThemeInput): ThemeCheck[] {
  const theme = deriveTheme(input);
  const paper = theme.paper;
  const darker = (hex: string, background: string, minimum = WCAG_AA_TEXT) => adjustLightness(hex, background, minimum, "darker");
  const rawInk = (input.ink ?? theme.ink).toUpperCase();
  const inkRatio = contrastRatio(rawInk, paper);
  const buttonRatio = contrastRatio(WHITE, input.accent) >= contrastRatio(theme.ink, input.accent) ? contrastRatio(WHITE, input.accent) : contrastRatio(theme.ink, input.accent);
  const rawPrimary = input.primary ? input.primary.toUpperCase() : null;
  const primaryRatio = rawPrimary ? contrastRatio(rawPrimary, paper) : 21;
  return [
    { id: "ink", label: "Texto sobre el fondo", ratio: inkRatio, minimum: WCAG_AA_TEXT, ok: inkRatio >= WCAG_AA_TEXT, fix: inkRatio >= WCAG_AA_TEXT ? null : { ink: darker(rawInk, paper) } },
    { id: "inkSoft", label: "Texto secundario (derivado)", ratio: contrastRatio(theme.inkSoft, paper), minimum: WCAG_AA_TEXT, ok: contrastRatio(theme.inkSoft, paper) >= WCAG_AA_TEXT, fix: null },
    { id: "button", label: "Texto de los botones sobre el acento", ratio: buttonRatio, minimum: WCAG_AA_TEXT, ok: buttonRatio >= WCAG_AA_TEXT, fix: buttonRatio >= WCAG_AA_TEXT ? null : { accent: darker(input.accent.toUpperCase(), WHITE) } },
    { id: "primary", label: "Primario sobre el fondo", ratio: primaryRatio, minimum: WCAG_AA_TEXT, ok: primaryRatio >= WCAG_AA_TEXT, fix: primaryRatio >= WCAG_AA_TEXT || !rawPrimary ? null : { primary: darker(rawPrimary, paper) } },
    { id: "sidebar", label: "Texto de la barra lateral", ratio: contrastRatio(theme.sidebarInk, theme.sidebarActive), minimum: WCAG_AA_TEXT, ok: contrastRatio(theme.sidebarInk, theme.sidebarActive) >= WCAG_AA_TEXT, fix: null },
  ];
}
