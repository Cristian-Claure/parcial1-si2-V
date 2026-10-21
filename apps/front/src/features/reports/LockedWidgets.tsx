import { Link } from "react-router-dom";
import type { ReportOverview } from "@velora/contracts";

const KIND_LABEL = { KPI: "Indicador", CHART: "Gráfico", TABLE: "Tabla" } as const;

/** Widgets que el backend no entregó por el nivel del plan: tarjetas bloqueadas con invitación a mejorar. */
export function LockedWidgets({ overview, canUpgrade }: { overview: ReportOverview; canUpgrade: boolean }) {
  const locked = overview.locked ?? [];
  if (locked.length === 0) return null;
  return <section className="panel"><h2>Más análisis disponibles</h2><p className="field-hint">Tu plan incluye el nivel {overview.tier === "BASIC" ? "básico" : "estándar"} de reportes{overview.policy?.historyDays ? ` con ${overview.policy.historyDays} días de historial` : ""}{overview.policy?.clamped ? " (el período se ajustó a esa ventana)" : ""}.</p>
    <div className="locked-grid">{locked.map((widget) => <article key={widget.id} className="locked-card"><span>{KIND_LABEL[widget.kind]} · bloqueado</span><strong>{widget.title}</strong><span>Disponible en {widget.requiredPlan ?? "un plan superior"}</span></article>)}</div>
    {canUpgrade ? <div className="actions"><Link className="button primary small" to="/admin/mi-plan">Mejorar plan</Link></div> : null}
  </section>;
}
