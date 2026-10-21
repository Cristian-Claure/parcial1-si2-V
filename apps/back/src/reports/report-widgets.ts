import { reportTierAllows, type ReportLockedWidget, type ReportOverview, type ReportTier } from "@velora/contracts";

export type ReportWidgetKind = "KPI" | "CHART" | "TABLE";

export interface ReportWidgetDefinition {
  id: string;
  kind: ReportWidgetKind;
  title: string;
  minTier: ReportTier;
}

/**
 * Catálogo de widgets del dashboard con su nivel mínimo. El backend filtra según el
 * report_tier del plan: lo no permitido se devuelve en `locked` (sin datos).
 * Fase 3 amplía este catálogo (ventas por categoría, mapa de calor, comparativas, ML).
 */
export const REPORT_WIDGETS: readonly ReportWidgetDefinition[] = [
  { id: "NET_SALES", kind: "KPI", title: "Venta neta", minTier: "BASIC" },
  { id: "PAID_ORDERS", kind: "KPI", title: "Pedidos pagados", minTier: "BASIC" },
  { id: "AVERAGE_TICKET", kind: "KPI", title: "Ticket promedio", minTier: "BASIC" },
  { id: "LOW_STOCK_VARIANTS", kind: "KPI", title: "Variantes críticas", minTier: "BASIC" },
  { id: "sales-daily", kind: "CHART", title: "Ventas por día", minTier: "BASIC" },
  { id: "top-products", kind: "TABLE", title: "Top productos", minTier: "BASIC" },

  { id: "GROSS_SALES", kind: "KPI", title: "Venta bruta", minTier: "STANDARD" },
  { id: "FULFILLED_ORDERS", kind: "KPI", title: "Pedidos completados", minTier: "STANDARD" },
  { id: "REFUNDS", kind: "KPI", title: "Reembolsos", minTier: "STANDARD" },
  { id: "AVAILABLE_UNITS", kind: "KPI", title: "Stock disponible", minTier: "STANDARD" },
  { id: "sales-store", kind: "CHART", title: "Venta neta por sucursal", minTier: "STANDARD" },
  { id: "orders-channel", kind: "CHART", title: "Pedidos por canal", minTier: "STANDARD" },
  { id: "payments-method", kind: "CHART", title: "Cobros por método", minTier: "STANDARD" },
  { id: "inventory-store", kind: "CHART", title: "Stock disponible por sucursal", minTier: "STANDARD" },

  { id: "TICKET_PER_CUSTOMER", kind: "KPI", title: "Ticket por cliente", minTier: "ADVANCED" },
  { id: "REPEAT_CUSTOMERS", kind: "KPI", title: "Clientes recurrentes", minTier: "ADVANCED" },
];

const BASIC_TOP_ROWS = 5;

/** Widgets fuera del catálogo se consideran ADVANCED (falla cerrada ante widgets nuevos sin clasificar). */
export function widgetMinTier(id: string): ReportTier {
  return REPORT_WIDGETS.find((widget) => widget.id === id)?.minTier ?? "ADVANCED";
}

export function applyReportTier(
  overview: ReportOverview,
  tier: ReportTier,
  requiredPlanFor: (minTier: ReportTier) => string | null,
): ReportOverview {
  const allowed = (id: string) => reportTierAllows(tier, widgetMinTier(id));
  const locked: ReportLockedWidget[] = REPORT_WIDGETS
    .filter((widget) => !reportTierAllows(tier, widget.minTier))
    .map((widget) => ({ id: widget.id, kind: widget.kind, title: widget.title, minTier: widget.minTier, requiredPlan: requiredPlanFor(widget.minTier) }));
  return {
    ...overview,
    tier,
    kpis: overview.kpis.filter((kpi) => allowed(kpi.key)).map((kpi) => ({ ...kpi, minTier: widgetMinTier(kpi.key) })),
    charts: overview.charts.filter((chart) => allowed(chart.id)).map((chart) => ({ ...chart, minTier: widgetMinTier(chart.id) })),
    tables: overview.tables
      .filter((table) => allowed(table.id))
      .map((table) => ({ ...table, minTier: widgetMinTier(table.id), rows: tier === "BASIC" ? table.rows.slice(0, BASIC_TOP_ROWS) : table.rows })),
    locked,
  };
}
