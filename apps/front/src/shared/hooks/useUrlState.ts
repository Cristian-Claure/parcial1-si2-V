import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Filtros, orden y página guardados en la URL (?q=…&estado=…&pagina=…): sobreviven al botón
 * atrás, a recargar y se pueden compartir. Cambiar un filtro vuelve a la página 1.
 */
export function useUrlState<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ""])) as Record<K, string>;
  const set = useCallback((patch: Partial<Record<K | "pagina", string>> | { pagina: string }) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch) as [string, string | undefined][]) {
        if (value) next.set(key, value); else next.delete(key);
      }
      if (!("pagina" in patch)) next.delete("pagina");
      return next;
    }, { replace: true });
  }, [setParams]);
  const page = Number(params.get("pagina") ?? "1") || 1;
  return { values, set, page, setPage: (value: number) => set({ pagina: value > 1 ? String(value) : "" }) };
}
