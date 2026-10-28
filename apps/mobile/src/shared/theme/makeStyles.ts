import { StyleSheet } from "react-native";
import type { Theme } from "./tokens";
import { useTheme } from "./ThemeProvider";

/**
 * Estilos que dependen del tema: `const useStyles = makeStyles(({ colors }) => ({ … }))` a nivel
 * de módulo y `const styles = useStyles()` dentro del componente. Se crean una sola vez por tema
 * (caché por objeto Theme, que el provider memoiza por paleta).
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): () => T {
  const cache = new WeakMap<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}
