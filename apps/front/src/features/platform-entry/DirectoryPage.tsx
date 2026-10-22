import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { COMPANY_SEGMENT_LABELS, companySegmentSchema, type CompanySegment, type DirectoryEntry } from "@velora/contracts";
import { veloraApi } from "../../core/api/veloraApi";
import { Notice } from "../../shared/feedback/Notice";
import { PLATFORM_NAME } from "../../shared/platform/PlatformBrand";

const SEGMENTS = companySegmentSchema.options;

/** Cada tarjeta se pinta con la paleta de su tienda (variables inline, sin pelear especificidad). */
function storeStyle(entry: DirectoryEntry): CSSProperties {
  return {
    "--store-paper": entry.palette.paper, "--store-ink": entry.palette.ink,
    "--store-primary": entry.palette.primary, "--store-accent": entry.palette.accent,
  } as CSSProperties;
}

export function StoreCard({ entry }: { entry: DirectoryEntry }) {
  return (
    <Link className="store-card" to={`/t/${entry.slug}`} style={storeStyle(entry)}>
      <div className="store-banner" style={entry.bannerUrl ? { backgroundImage: `url(${entry.bannerUrl})` } : undefined} />
      <div className="store-body">
        <span className="store-logo">{entry.logoUrl ? <img src={entry.logoUrl} alt="" /> : entry.name.slice(0, 1).toUpperCase()}</span>
        <strong>{entry.name}</strong>
        {entry.tagline ? <small>{entry.tagline}</small> : null}
        {entry.segment ? <span className="store-segment">{COMPANY_SEGMENT_LABELS[entry.segment]}</span> : null}
        <span className="store-enter">Visitar tienda →</span>
      </div>
    </Link>
  );
}

/** /tiendas: directorio público con buscador y filtro por segmento. */
export function DirectoryPage() {
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<CompanySegment | null>(null);
  const directory = useQuery({ queryKey: ["directory", q.trim(), segment], queryFn: () => veloraApi.directory({ q, segment }), placeholderData: (previous) => previous });
  return (
    <main className="platform-main">
      <div className="directory-head">
        <span className="eyebrow">TIENDAS EN {PLATFORM_NAME.toUpperCase()}</span>
        <h1>Encuentra tu próxima tienda favorita</h1>
        <p>Marcas de moda con catálogo propio, envíos y retiro en sucursal. Elige una tienda para empezar a comprar.</p>
      </div>
      <div className="directory-tools">
        <input type="search" placeholder="Buscar por nombre o estilo…" value={q} onChange={(event) => setQ(event.target.value)} aria-label="Buscar tiendas" />
        <button type="button" className={`chip${segment === null ? " active" : ""}`} onClick={() => setSegment(null)}>Todas</button>
        {SEGMENTS.map((value) => <button key={value} type="button" className={`chip${segment === value ? " active" : ""}`} onClick={() => setSegment(value)}>{COMPANY_SEGMENT_LABELS[value]}</button>)}
      </div>
      {directory.isError ? <Notice kind="error">No se pudo cargar el directorio de tiendas.</Notice> : null}
      {directory.data && directory.data.length === 0 ? <Notice>No hay tiendas que coincidan con la búsqueda.</Notice> : null}
      <div className="store-grid">{directory.data?.map((entry) => <StoreCard key={entry.slug} entry={entry} />)}</div>
    </main>
  );
}
