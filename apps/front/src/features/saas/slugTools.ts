import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { veloraApi } from "../../core/api/veloraApi";

export function slugify(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/** Muestra si el enlace está libre (consulta con un pequeño retardo para no saturar la API). */
export function useSlugAvailability(slug: string) {
  const [debounced, setDebounced] = useState(slug);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(slug), 350); return () => window.clearTimeout(timer); }, [slug]);
  return useQuery({ queryKey: ["slug", debounced], queryFn: () => veloraApi.slugAvailability(debounced), enabled: debounced.length >= 3 });
}
