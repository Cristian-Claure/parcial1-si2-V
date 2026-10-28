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

/** Bolivia no usa horario de verano: el mes calendario del backend (America/La_Paz) es UTC−4. */
const LA_PAZ_OFFSET_MS = -4 * 3_600_000;

/** Inicio del mes calendario en La Paz, expresado como instante UTC. */
export function monthStartLaPaz(now: Date): number {
  const local = new Date(now.getTime() + LA_PAZ_OFFSET_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - LA_PAZ_OFFSET_MS;
}

/**
 * Pruebas restantes del mes en la tienda: misma regla que PlanLimitsService.assertTryOnQuota
 * (trabajos del cliente sobre productos de la tienda, sin FAILED ni CANCELLED, desde el inicio del
 * mes en La Paz). `limit` null = ilimitado. El backend sigue siendo quien decide.
 */
export function remainingTryOns(
  limit: number | null | undefined,
  jobs: readonly { productId: string; status: string; createdAt: string }[],
  companyProductIds: ReadonlySet<string>,
  now: Date = new Date(),
): { limit: number; used: number; remaining: number } | null {
  if (limit === null || limit === undefined) return null;
  const since = monthStartLaPaz(now);
  const used = jobs.filter((job) => companyProductIds.has(job.productId) && job.status !== "FAILED" && job.status !== "CANCELLED" && new Date(job.createdAt).getTime() >= since).length;
  return { limit, used, remaining: Math.max(0, limit - used) };
}
