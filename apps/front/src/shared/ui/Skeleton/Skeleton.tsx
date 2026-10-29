interface SkeletonProps {
  width?: string;
  height?: string;
}

/** Bloque de carga con el pulso del tema (respeta prefers-reduced-motion). */
export function Skeleton({ width = "100%", height = "20px" }: SkeletonProps) {
  return <div className="skeleton-card" style={{ width, height, minHeight: height }} aria-hidden="true" />;
}

/** Esqueleto de página: encabezado y tarjetas (P3 · UX_AUDIT, en lugar del spinner genérico). */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return <section className="page" aria-busy="true" aria-label="Cargando">
    <div className="page-heading"><Skeleton width="120px" height="14px" /><Skeleton width="min(420px, 80%)" height="34px" /></div>
    <div className="skeleton-grid">{Array.from({ length: cards }, (_, index) => <Skeleton key={index} height="140px" />)}</div>
  </section>;
}
