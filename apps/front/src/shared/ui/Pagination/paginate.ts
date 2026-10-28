/** Recorta una lista a la página pedida (1-based) y acota la página al rango válido. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1), pageCount);
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pageCount };
}
