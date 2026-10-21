/** Mensaje claro cuando el backend responde PLAN_LIMIT_TRY_ON (cuota mensual por cliente y tienda). */
export function tryOnErrorMessage(
  error: unknown,
  companyName: string | null,
  fallback = "No se pudo iniciar el probador virtual.",
): string {
  const candidate = error as { code?: unknown; details?: { limit?: unknown } } | null;
  if (candidate && typeof candidate === "object" && candidate.code === "PLAN_LIMIT_TRY_ON") {
    const limit = typeof candidate.details?.limit === "number" ? candidate.details.limit : null;
    const store = companyName ? ` en ${companyName}` : "";
    return limit !== null
      ? `Alcanzaste tus ${limit} pruebas del probador de este mes${store}. Podrás volver a usarlo el próximo mes.`
      : `Alcanzaste el límite mensual del probador${store}.`;
  }
  return error instanceof Error ? error.message : fallback;
}
