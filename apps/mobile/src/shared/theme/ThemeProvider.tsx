import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { BrandPalette } from "@velora/contracts";
import { buildPlatformTheme, buildStoreTheme, type Theme } from "./tokens";

const platformTheme = buildPlatformTheme();
const ThemeContext = createContext<Theme>(platformTheme);

/** Tema actual (Trama o la tienda/empresa activa). */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Tema de la tienda o empresa activa. Sin paleta (aún no hay tienda) se usa el de Trama.
 * Cambia al cambiar de tienda porque `palette`/`brandKey` cambian.
 */
export function StoreThemeProvider({ palette, brandKey, children }: { palette: Partial<BrandPalette> | null | undefined; brandKey: string | null | undefined; children: ReactNode }) {
  const accent = palette?.accent; const paper = palette?.paper; const ink = palette?.ink; const primary = palette?.primary;
  const theme = useMemo(
    () => (accent ? buildStoreTheme({ accent, paper, ink, primary }, brandKey ?? "store") : platformTheme),
    [accent, paper, ink, primary, brandKey],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Pantallas de plataforma (login, registro, tiendas, elegir empresa, mi plan): siempre Trama. */
export function PlatformTheme({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={platformTheme}>{children}</ThemeContext.Provider>;
}
