import { contrastRatio, mixColors, resolveBrandPalette, TRAMA_TOKENS, WCAG_AA_TEXT, type BrandPalette } from "@velora/contracts";

/**
 * Tokens del tema móvil (puro, sin react-native: se prueba con node --test).
 * Los colores de tienda salen de las MISMAS funciones de @velora/contracts que usa la web
 * (resolveBrandPalette → accent-deep y accent-soft derivados, onAccent por contraste AA).
 * Este directorio (shared/theme/) es el único lugar del móvil donde se permiten hexadecimales.
 */

export interface ThemeColors {
  paper: string; paperRaised: string; ink: string; inkSoft: string; hairline: string;
  accent: string; accentDeep: string; accentSoft: string; onAccent: string; highlight: string; primary: string;
  /** Texto sobre `primary`/`ink` (p. ej. el monograma con la inicial). */
  onPrimary: string;
  /** Alias de compatibilidad con las pantallas anteriores a la Fase 4C. */
  ivory: string; surface: string; surfaceSoft: string; card: string; cardMuted: string;
  muted: string; mutedLight: string; terracotta: string; champagne: string; roseGold: string; dustyRose: string;
  border: string; borderStrong: string; overlay: string;
  /** Semánticos: no cambian con la marca. */
  success: string; warning: string; error: string; info: string;
  successSoft: string; warningSoft: string; errorSoft: string; infoSoft: string; onSemantic: string;
}

export interface Theme {
  /** Clave estable para memoizar estilos por tema. */
  key: string;
  mode: "platform" | "store";
  colors: ThemeColors;
}

export const SEMANTIC = {
  success: "#2F6B45", successSoft: "#E3F1E8",
  warning: "#8A5A12", warningSoft: "#FBF0DC",
  error: "#9B2C2C", errorSoft: "#FBE7E7",
  info: "#3B4A63", infoSoft: "#E6EBF3",
  onSemantic: "#FFFFFF",
} as const;

const WHITE = "#FFFFFF";
const BLACK = "#000000";

/** Oscurece (o aclara) `foreground` hacia `toward` hasta alcanzar AA sobre `background`. */
export function ensureContrast(foreground: string, background: string, toward: string = BLACK, minimum = WCAG_AA_TEXT): string {
  let color = foreground;
  for (let step = 0; step < 20 && contrastRatio(color, background) < minimum; step += 1) color = mixColors(color, toward, 0.88);
  return color;
}

function withAliases(base: Omit<ThemeColors, "ivory" | "surface" | "surfaceSoft" | "card" | "cardMuted" | "muted" | "mutedLight" | "terracotta" | "champagne" | "roseGold" | "dustyRose" | "border" | "borderStrong" | "overlay" | keyof typeof SEMANTIC>): ThemeColors {
  return {
    ...base,
    ...SEMANTIC,
    ivory: base.onPrimary,
    surface: base.paper,
    surfaceSoft: mixColors(base.ink, base.paper, 0.05),
    card: base.paperRaised,
    cardMuted: mixColors(base.ink, base.paper, 0.09),
    muted: base.inkSoft,
    mutedLight: mixColors(base.ink, base.paper, 0.5),
    terracotta: base.accentDeep,
    champagne: base.accentSoft,
    roseGold: base.accent,
    dustyRose: base.accentSoft,
    border: base.hairline,
    borderStrong: mixColors(base.ink, base.paper, 0.24),
    overlay: mixColors(base.ink, BLACK, 0.7),
  };
}

/** Tema de la plataforma Trama (login, registro, tiendas, elegir empresa, mi plan). */
export function buildPlatformTheme(): Theme {
  const t = TRAMA_TOKENS;
  return {
    key: "platform",
    mode: "platform",
    colors: withAliases({
      paper: t.paper, paperRaised: t.paperRaised, ink: t.ink, inkSoft: t.inkSoft, hairline: t.hairline,
      accent: t.accent, accentDeep: t.accentDeep, accentSoft: t.accentSoft, highlight: t.highlight,
      onAccent: contrastRatio(WHITE, t.accent) >= WCAG_AA_TEXT ? WHITE : t.ink,
      primary: t.ink, onPrimary: t.paperRaised,
    }),
  };
}

/** Tema de una tienda a partir de su paleta (la misma que guarda y valida el backend). */
export function buildStoreTheme(palette: Partial<BrandPalette> | null | undefined, key = "store"): Theme {
  const resolved = resolveBrandPalette(palette);
  const ink = ensureContrast(resolved.ink, resolved.paper);
  const paperRaised = mixColors(WHITE, resolved.paper, 0.6);
  const primary = ensureContrast(resolved.primary, resolved.paper);
  return {
    key: `store:${key}:${resolved.accent}:${resolved.paper}:${resolved.ink}:${resolved.primary}`,
    mode: "store",
    colors: withAliases({
      paper: resolved.paper,
      paperRaised,
      ink,
      inkSoft: ensureContrast(resolved.inkSoft, paperRaised, ink),
      hairline: mixColors(ink, resolved.paper, 0.12),
      accent: resolved.accent,
      // accent-deep se usa como texto (enlaces, eyebrows): debe cumplir AA sobre el fondo.
      accentDeep: ensureContrast(resolved.accentDeep, resolved.paper),
      accentSoft: resolved.accentSoft,
      onAccent: resolved.onAccent,
      highlight: resolved.accentSoft,
      primary,
      onPrimary: contrastRatio(WHITE, primary) >= contrastRatio(resolved.paper, primary) ? WHITE : resolved.paper,
    }),
  };
}
