/** Paginación accesible para listas largas (la página vive en la URL de la pantalla que la usa). */
export function Pagination({ page, pageCount, total, onPage, label = "resultados" }: { page: number; pageCount: number; total: number; onPage: (page: number) => void; label?: string }) {
  if (pageCount <= 1) return total ? <p className="pagination-summary">{total} {label}</p> : null;
  return <nav className="pagination" aria-label="Paginación">
    <button type="button" className="button secondary small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
    <span aria-live="polite">Página {page} de {pageCount} · {total} {label}</span>
    <button type="button" className="button secondary small" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Siguiente</button>
  </nav>;
}
