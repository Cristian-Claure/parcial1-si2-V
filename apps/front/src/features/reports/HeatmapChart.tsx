import type { ReportChart } from "@velora/contracts";

/** Mapa de calor día × hora en SVG (sin librerías): intensidad con el acento de la marca. */
export function HeatmapChart({ chart }: { chart: ReportChart }) {
  const max = Math.max(1, ...chart.series.flatMap((series) => series.data));
  const cell = 22; const gap = 3; const left = 38; const top = 22;
  const width = left + chart.categories.length * (cell + gap);
  const height = top + chart.series.length * (cell + gap);
  const peak = chart.series.flatMap((series) => series.data.map((value, hour) => ({ day: series.name, hour: chart.categories[hour], value }))).sort((a, b) => b.value - a.value)[0];
  return (
    <article className="report-chart-card report-heatmap">
      <h3>{chart.title}</h3>
      {max <= 1 && !peak?.value ? <p className="report-empty">Sin pedidos en el período.</p> : (
        <>
          <div className="report-heatmap-scroll">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${chart.title}. Mayor actividad: ${peak?.day ?? ""} ${peak?.hour ?? ""} h con ${peak?.value ?? 0} pedidos.`}>
              {chart.categories.map((hour, index) => index % 3 === 0 ? <text key={hour} x={left + index * (cell + gap) + cell / 2} y={top - 8} textAnchor="middle" className="report-heatmap-axis">{hour}</text> : null)}
              {chart.series.map((series, row) => (
                <g key={series.name}>
                  <text x={left - 8} y={top + row * (cell + gap) + cell / 2 + 4} textAnchor="end" className="report-heatmap-axis">{series.name}</text>
                  {series.data.map((value, column) => (
                    <rect key={column} x={left + column * (cell + gap)} y={top + row * (cell + gap)} width={cell} height={cell} rx={4}
                      className="report-heatmap-cell" style={{ opacity: value === 0 ? 0.06 : 0.15 + 0.85 * (value / max) }}>
                      <title>{`${series.name} ${chart.categories[column]}:00 · ${value} pedidos`}</title>
                    </rect>
                  ))}
                </g>
              ))}
            </svg>
          </div>
          {peak ? <p className="report-heatmap-note">Mayor actividad: <strong>{peak.day} {peak.hour}:00</strong> ({peak.value} pedidos).</p> : null}
        </>
      )}
    </article>
  );
}
