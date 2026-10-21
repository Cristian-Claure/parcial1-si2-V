import { Injectable } from "@nestjs/common";
import { reportTierAllows, type ReportChart, type ReportKpi, type ReportTable, type ReportTier } from "@velora/contracts";
import { ReportAnalyticsRepository, type AnalyticsScope, type AnalyticsWindow, type PeriodKpis } from "./report-analytics.repository.js";

const DAY_MS = 86_400_000;
const DOW_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const FULFILLMENT_LABEL: Record<string, string> = { DELIVERY: "Delivery", PICKUP: "Retiro en tienda", IN_STORE: "Venta en tienda" };

export interface ExtensionInput {
  scope: AnalyticsScope;
  window: AnalyticsWindow;
  /** Días del periodo actual en orden (YYYY-MM-DD), para alinear el periodo anterior. */
  days: string[];
  tier: ReportTier;
  canCompare: boolean;
  /** Primer día permitido por la ventana de historial del plan (null = completo). */
  earliestAllowed: Date | null;
}

export interface ExtensionResult {
  kpis: ReportKpi[];
  charts: ReportChart[];
  tables: ReportTable[];
  previous: PeriodKpis | null;
  previousDaily: number[] | null;
}

const changePct = (current: number, previous: number | null | undefined) =>
  previous === null || previous === undefined || previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;

/**
 * Widgets añadidos en la Fase 3. Solo se consulta lo permitido por el nivel: los widgets
 * bloqueados no ejecutan SQL. La comparación usa el periodo inmediatamente anterior de igual
 * longitud y solo si cae dentro de la ventana de historial del plan.
 */
@Injectable()
export class ReportExtensionsService {
  constructor(private readonly analytics: ReportAnalyticsRepository) {}

  previousWindow(window: AnalyticsWindow): AnalyticsWindow {
    const length = window.endExclusive.getTime() - window.start.getTime();
    return { start: new Date(window.start.getTime() - length), endExclusive: window.start };
  }

  async build(input: ExtensionInput): Promise<ExtensionResult> {
    const standard = reportTierAllows(input.tier, "STANDARD");
    const advanced = reportTierAllows(input.tier, "ADVANCED");
    const result: ExtensionResult = { kpis: [], charts: [], tables: [], previous: null, previousDaily: null };
    if (!standard) return result;

    const previousWindow = this.previousWindow(input.window);
    const comparable = input.canCompare && (input.earliestAllowed === null || previousWindow.start.getTime() >= input.earliestAllowed.getTime());
    const [current, previous] = await Promise.all([
      this.analytics.kpis(input.scope, input.window),
      comparable ? this.analytics.kpis(input.scope, previousWindow) : Promise.resolve(null),
    ]);
    result.previous = previous;
    if (previous) {
      const daily = await this.analytics.dailyNet(input.scope, previousWindow);
      const previousDays = input.days.map((_, index) => new Date(previousWindow.start.getTime() + index * DAY_MS + 12 * 3_600_000).toISOString().slice(0, 10));
      result.previousDaily = previousDays.map((day) => daily.get(day) ?? 0);
    }

    result.kpis.push(
      { key: "CANCELLATION_RATE", label: "Tasa de cancelación", value: current.cancellationRate, format: "PERCENT", helper: "Pedidos cancelados sobre pedidos creados en el período.", previousValue: previous?.cancellationRate ?? null, changePct: changePct(current.cancellationRate, previous?.cancellationRate) },
      { key: "UNITS_SOLD", label: "Unidades vendidas", value: current.unitsSold, format: "COUNT", helper: "Prendas de pedidos con pago confirmado en el período.", previousValue: previous?.unitsSold ?? null, changePct: changePct(current.unitsSold, previous?.unitsSold) },
    );

    const [categories, mix, critical] = await Promise.all([
      this.analytics.salesByCategory(input.scope, input.window),
      this.analytics.fulfillmentMix(input.scope, input.window),
      this.analytics.criticalInventory(input.scope),
    ]);
    result.charts.push(
      { id: "sales-category", title: "Ventas por categoría (Bs, antes de descuentos)", type: "BAR", categories: categories.map((row) => row.category), series: [{ name: "Ventas", data: categories.map((row) => row.amount) }] },
      { id: "fulfillment-mix", title: "Pedidos por tipo de entrega", type: "DONUT", categories: mix.map((row) => FULFILLMENT_LABEL[row.type] ?? row.type), series: [{ name: "Pedidos", data: mix.map((row) => row.orders) }] },
    );
    result.tables.push({ id: "critical-inventory", title: "Inventario crítico (3 unidades o menos)", columns: ["Producto", "SKU", "Sucursal", "Disponible"], rows: critical.map((row) => [row.product, row.sku, row.store, String(row.available)]) });

    if (!advanced) return result;

    const [customers, trend, heat, storesNow, storesBefore] = await Promise.all([
      this.analytics.customers(input.scope, input.window),
      this.analytics.monthlyNet(input.scope, input.window.endExclusive, 12),
      this.analytics.heatmap(input.scope, input.window),
      this.analytics.netByStore(input.scope, input.window),
      this.analytics.netByStore(input.scope, previousWindow),
    ]);
    const previousNet = previous?.netSales ?? (await this.analytics.kpis(input.scope, previousWindow)).netSales;
    const repurchase = customers.buyers ? Math.round((1000 * customers.repeatBuyers) / customers.buyers) / 10 : 0;
    result.kpis.push(
      { key: "REPURCHASE_RATE", label: "Tasa de recompra", value: repurchase, format: "PERCENT", helper: "Compradores del período con dos o más compras pagadas a la fecha." },
      { key: "GROWTH_RATE", label: "Crecimiento", value: changePct(current.netSales, previousNet) ?? 0, format: "PERCENT", helper: "Venta neta frente al período anterior de igual duración." },
      { key: "NEW_CUSTOMERS", label: "Clientes nuevos", value: customers.newCustomers, format: "COUNT", helper: "Clientes cuya primera compra pagada ocurrió en el período." },
    );
    const moving = trend.map((_, index) => {
      const slice = trend.slice(Math.max(0, index - 2), index + 1);
      return Math.round((slice.reduce((sum, row) => sum + row.amount, 0) / slice.length) * 100) / 100;
    });
    result.charts.push(
      { id: "sales-trend", title: "Tendencia mensual de venta neta", type: "LINE", categories: trend.map((row) => `${MONTH_LABELS[Number(row.month.slice(5, 7)) - 1]} ${row.month.slice(2, 4)}`), series: [{ name: "Venta neta", data: trend.map((row) => row.amount) }, { name: "Promedio móvil 3 meses", data: moving }] },
      { id: "sales-heatmap", title: "Pedidos por día y hora (Bolivia)", type: "HEATMAP", categories: Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")),
        series: DOW_LABELS.map((name, index) => ({ name, data: Array.from({ length: 24 }, (_, hour) => heat.find((cell) => cell.dow === index + 1 && cell.hour === hour)?.orders ?? 0) })) },
      { id: "store-comparison", title: "Comparativa entre sucursales (venta neta)", type: "BAR", categories: [...storesNow.values()].map((store) => store.name),
        series: [{ name: "Período actual", data: [...storesNow.values()].map((store) => store.amount) }, { name: "Período anterior", data: [...storesNow.keys()].map((id) => storesBefore.get(id)?.amount ?? 0) }] },
    );
    return result;
  }
}
