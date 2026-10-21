import type { useSlugAvailability } from "./slugTools";

export function SlugHint({ slug, availability }: { slug: string; availability: ReturnType<typeof useSlugAvailability> }) {
  if (slug.length < 3) return <span className="field-hint">Mínimo 3 caracteres: letras, números y guiones.</span>;
  if (!availability.data) return <span className="field-hint">Verificando…</span>;
  if (availability.data.available) return <span className="field-hint ok">Disponible: /t/{slug}</span>;
  return <span className="field-hint bad">No disponible.{availability.data.suggestion ? ` Prueba “${availability.data.suggestion}”.` : ""}</span>;
}
