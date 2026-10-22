import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import {
  REPORT_BUILDER_LIMITS, REPORT_DIMENSIONS, REPORT_MEASURES, reportPeriodPresetSchema, reportTierAllows,
  type ReportBuilderDefinition, type ReportBuilderResult, type ReportChart, type ReportDimensionId, type ReportMeasureId,
  type ReportSemanticCatalog, type ReportTier,
} from "@velora/contracts";
import type { AuthPrincipal } from "../../auth/security.js";
import { ApiHttpError } from "../../common/http/api-http.error.js";
import { DatabaseService } from "../../database/database.service.js";
import { PlanLimitsService } from "../../plans/plan-limits.service.js";
import { REPORT_ZONE, storeScopeSql } from "../report-facts.js";
import { ReportsService } from "../reports.service.js";
import { DIMENSION_SQL, dimensionLabel, dimensionMeta, enumOptions, hourOptions, measureMeta, weekdayOptions } from "./semantic-layer.js";
import { SemanticQueryRepository, type SemanticQuery } from "./semantic-query.repository.js";

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export interface BuilderRun {
  result: ReportBuilderResult;
  companyId: string;
}

/**
 * Constructor dinámico. Alcance SIEMPRE desde ReportsService.reportContext (TenantScopeService):
 * el ADMIN solo ve sus compañías y el encargado queda fijado a su sucursal. El nivel del plan
 * habilita el constructor, cada dimensión/medida y la ventana de historial (recorte en backend).
 */
@Injectable()
export class ReportBuilderService {
  constructor(
    private readonly reports: ReportsService,
    private readonly limits: PlanLimitsService,
    private readonly semantic: SemanticQueryRepository,
    private readonly database: DatabaseService,
  ) {}

  async catalog(principal: AuthPrincipal, companyId: string | null): Promise<ReportSemanticCatalog> {
    const context = await this.reports.reportContext(principal, companyId, null, null, null);
    await this.limits.assertReportFeature(context.scope.companyId, "DYNAMIC_REPORTS", 403);
    const tier = context.policy.tier;
    const required = await this.requiredPlans();
    const access = (minTier: ReportTier) => ({ minTier, locked: !reportTierAllows(tier, minTier), requiredPlan: reportTierAllows(tier, minTier) ? null : required[minTier] });
    const scope = context.scope;
    const options = async (query: ReturnType<typeof sql>) => ((await this.database.db.execute(query)).rows as { value: string; label: string }[]).map((row) => ({ value: String(row.value), label: String(row.label) }));
    const [stores, categories, brands, sizes, colors] = await Promise.all([
      options(sql`select s.id::text value, s.name label from stores s where ${storeScopeSql(scope)} order by s.name`),
      options(sql`select c.id::text value, c.name label from categories c where c.company_id = ${scope.companyId}::uuid order by c.name`),
      options(sql`select distinct coalesce(nullif(btrim(pr.brand), ''), 'Sin marca') value, coalesce(nullif(btrim(pr.brand), ''), 'Sin marca') label from products pr where pr.company_id = ${scope.companyId}::uuid order by 1 limit 100`),
      options(sql`select distinct coalesce(nullif(btrim(pv.size), ''), 'Sin talla') value, coalesce(nullif(btrim(pv.size), ''), 'Sin talla') label from product_variants pv join products pr on pr.id = pv.product_id where pr.company_id = ${scope.companyId}::uuid order by 1 limit 100`),
      options(sql`select distinct coalesce(nullif(btrim(pv.color), ''), 'Sin color') value, coalesce(nullif(btrim(pv.color), ''), 'Sin color') label from product_variants pv join products pr on pr.id = pv.product_id where pr.company_id = ${scope.companyId}::uuid order by 1 limit 100`),
    ]);
    return {
      tier,
      policy: { ...context.policy, clamped: false },
      dimensions: REPORT_DIMENSIONS.map((dimension) => ({ id: dimension.id, label: dimension.label, group: dimension.group, filterable: dimension.filterable, inventory: dimension.inventory, ...access(dimension.minTier) })),
      measures: REPORT_MEASURES.map((measure) => ({ id: measure.id, label: measure.label, format: measure.format, description: measure.description, ...access(measure.minTier) })),
      filterOptions: {
        STORE: stores, CATEGORY: categories, BRAND: brands, SIZE: sizes, COLOR: colors,
        CHANNEL: enumOptions("CHANNEL"), FULFILLMENT: enumOptions("FULFILLMENT"), ORDER_STATUS: enumOptions("ORDER_STATUS"), PAYMENT_METHOD: enumOptions("PAYMENT_METHOD"),
        ...(reportTierAllows(tier, "ADVANCED") ? { WEEKDAY: weekdayOptions(), HOUR: hourOptions() } : {}),
      },
      limits: { maxDimensions: REPORT_BUILDER_LIMITS.maxDimensions, maxMeasures: REPORT_BUILDER_LIMITS.maxMeasures, maxFilters: REPORT_BUILDER_LIMITS.maxFilters, maxRows: REPORT_BUILDER_LIMITS.maxRows },
      presets: [...reportPeriodPresetSchema.options],
    };
  }

  async run(principal: AuthPrincipal, companyId: string | null, definition: ReportBuilderDefinition): Promise<BuilderRun> {
    // 1) Alcance y política antes de mirar la definición: un companyId ajeno corta aquí (404/403).
    const probe = await this.reports.reportContext(principal, companyId, null, null, null);
    await this.limits.assertReportFeature(probe.scope.companyId, "DYNAMIC_REPORTS", 403);
    await this.assertTier(probe.policy.tier, definition);
    this.validate(definition);

    const { from, to } = await this.period(principal, companyId, definition);
    const context = await this.reports.reportContext(principal, companyId, null, from, to);
    const { scope, policy, period } = context;
    const sort = definition.sort ?? this.defaultSort(definition);
    const query: SemanticQuery = {
      scope: { companyId: scope.companyId, storeId: scope.storeId },
      window: { start: period.start, endExclusive: period.endExclusive },
      dimensions: definition.dimensions, measures: definition.measures, filters: definition.filters,
      sort, limit: definition.limit,
    };
    const current = await this.semantic.run(query);

    // 2) Periodo anterior de igual duración, solo si el plan lo permite y cae en la ventana de historial.
    const notes: string[] = [];
    if (context.clamped) notes.push(`El período se ajustó a la ventana de historial de tu plan (${policy.historyDays} días).`);
    const length = period.endExclusive.getTime() - period.start.getTime();
    const previousWindow = { start: new Date(period.start.getTime() - length), endExclusive: period.start };
    const comparable = definition.compareWithPrevious && definition.preset !== "ALL" && policy.canPeriodComparison
      && (context.earliestAllowed === null || previousWindow.start.getTime() >= context.earliestAllowed.getTime());
    if (definition.compareWithPrevious && !comparable) notes.push("La comparación no está disponible: el período anterior queda fuera de la ventana de historial de tu plan.");
    const dateGrouped = definition.dimensions.some((id) => DIMENSION_SQL[id].date);
    let previous: { rows: Map<string, number[]>; totals: number[] } | null = null;
    if (comparable) {
      previous = await this.semantic.valuesForKeys({ ...query, window: previousWindow }, dateGrouped ? [] : current.rows.map((row) => row.keys));
      if (dateGrouped) notes.push("Con agrupación por fecha se compara solo el total del período.");
    }
    if (definition.measures.includes("INVENTORY_VALUE")) notes.push("El valor de inventario es la foto actual del stock (no depende del período).");
    if (definition.dimensions.some((id) => DIMENSION_SQL[id].item) && definition.measures.some((id) => ["NET_SALES", "GROSS_SALES", "REFUNDS", "DISCOUNT", "AVERAGE_TICKET"].includes(id))) {
      notes.push("Con dimensiones de producto, cada pago se reparte entre los ítems del pedido según su subtotal; los totales no cambian.");
    }
    if (current.truncated) notes.push(`Se muestran las primeras ${definition.limit} filas según el orden elegido.`);

    const rows = current.rows.map((row) => ({
      keys: row.keys,
      labels: row.keys.map((key, index) => dimensionLabel(definition.dimensions[index]!, key, row.rawLabels[index] ?? null)),
      values: row.values,
      previous: previous && !dateGrouped ? (previous.rows.get(SemanticQueryRepository.rowKey(row.keys)) ?? definition.measures.map(() => 0)) : null,
    }));
    const days = Math.round(length / DAY_MS);
    const result: ReportBuilderResult = {
      title: this.title(definition),
      scopeLabel: scope.label,
      from: period.from, to: period.to,
      previousFrom: previous ? shift(period.from, -days) : null,
      previousTo: previous ? shift(period.from, -1) : null,
      generatedAt: new Date().toISOString(),
      columns: [
        ...definition.dimensions.map((id) => ({ id, label: dimensionMeta(id).label, kind: "DIMENSION" as const, format: null })),
        ...definition.measures.map((id) => ({ id, label: measureMeta(id).label, kind: "MEASURE" as const, format: measureMeta(id).format })),
      ],
      rows,
      totals: current.totals,
      previousTotals: previous?.totals ?? null,
      truncated: current.truncated,
      filtersApplied: await this.filterLabels(scope.companyId, definition),
      suggestedChart: this.suggestChart(definition, rows),
      policy: { ...policy, clamped: context.clamped },
      notes,
    };
    return { result, companyId: scope.companyId };
  }

  // ---------------------------------------------------------------------------

  private async requiredPlans(): Promise<Record<ReportTier, string | null>> {
    const [basic, standard, advanced] = await Promise.all((["BASIC", "STANDARD", "ADVANCED"] as const).map((tier) => this.limits.requiredPlanForTier(tier)));
    return { BASIC: basic ?? null, STANDARD: standard ?? null, ADVANCED: advanced ?? null };
  }

  /** Cada identificador pedido (dimensión, medida o filtro) debe estar habilitado por el nivel. */
  async assertTier(tier: ReportTier, definition: ReportBuilderDefinition): Promise<void> {
    const requested = [
      ...definition.dimensions.map((id) => ({ id, label: dimensionMeta(id).label, minTier: dimensionMeta(id).minTier })),
      ...definition.filters.map((filter) => ({ id: filter.dimension, label: dimensionMeta(filter.dimension).label, minTier: dimensionMeta(filter.dimension).minTier })),
      ...definition.measures.map((id) => ({ id, label: measureMeta(id).label, minTier: measureMeta(id).minTier })),
    ];
    const blocked = requested.find((item) => !reportTierAllows(tier, item.minTier));
    if (!blocked) return;
    const requiredPlan = await this.limits.requiredPlanForTier(blocked.minTier);
    throw ApiHttpError.coded(403, "PLAN_LIMIT_REPORT_FEATURE", `"${blocked.label}" no está incluido en tu plan.${requiredPlan ? ` Disponible en ${requiredPlan}.` : ""}`, { feature: blocked.id, requiredPlan });
  }

  validate(definition: ReportBuilderDefinition): void {
    const invalid = (message: string, field: string) => { throw new ApiHttpError(400, message, { [field]: message }); };
    if (definition.measures.includes("INVENTORY_VALUE")) {
      const incompatible = [...definition.dimensions, ...definition.filters.map((filter) => filter.dimension)].find((id) => !dimensionMeta(id).inventory);
      if (incompatible) invalid(`El valor de inventario es una foto actual: no se puede combinar con "${dimensionMeta(incompatible).label}".`, "measures");
    }
    const seen = new Set<string>();
    for (const filter of definition.filters) {
      const meta = dimensionMeta(filter.dimension);
      if (!meta.filterable) invalid(`"${meta.label}" no se usa como filtro; ajusta el período.`, "filters");
      if (seen.has(filter.dimension)) invalid(`Filtro repetido: "${meta.label}".`, "filters");
      seen.add(filter.dimension);
      const shape = DIMENSION_SQL[filter.dimension].values;
      const ok = (value: string) => shape === "uuid" ? UUID.test(value) : shape === "weekday" ? /^[1-7]$/.test(value) : shape === "hour" ? /^([01]\d|2[0-3])$/.test(value) : !/[\u0000-\u001f]/.test(value);
      if (!filter.values.every(ok)) invalid(`Valor de filtro inválido para "${meta.label}".`, "filters");
    }
    if (definition.sort && ![...definition.dimensions, ...definition.measures].includes(definition.sort.by as never)) {
      invalid("Solo se puede ordenar por una dimensión o medida seleccionada.", "sort");
    }
    if ((definition.from && !definition.to) || (!definition.from && definition.to)) invalid("Indica fecha inicial y final.", "from");
    if (definition.from && definition.to && definition.from > definition.to) invalid("La fecha inicial no puede ser posterior a la final.", "from");
  }

  private async period(principal: AuthPrincipal, companyId: string | null, definition: ReportBuilderDefinition): Promise<{ from: string; to: string }> {
    if (definition.from && definition.to && !definition.preset) return { from: definition.from, to: definition.to };
    const today = todayLocal();
    switch (definition.preset ?? "LAST_30") {
      case "LAST_7": return { from: shift(today, -6), to: today };
      case "LAST_90": return { from: shift(today, -89), to: today };
      case "LAST_365": return { from: shift(today, -364), to: today };
      case "THIS_MONTH": return { from: `${today.slice(0, 8)}01`, to: today };
      case "THIS_YEAR": return { from: `${today.slice(0, 5)}01-01`, to: today };
      case "ALL": return { from: (await this.reports.periodBounds(principal, companyId, null)).minDate, to: today };
      default: return { from: shift(today, -29), to: today };
    }
  }

  private defaultSort(definition: ReportBuilderDefinition): { by: ReportDimensionId | ReportMeasureId; direction: "ASC" | "DESC" } {
    const first = definition.dimensions[0];
    if (first && (DIMENSION_SQL[first].date || first === "WEEKDAY" || first === "HOUR")) return { by: first, direction: "ASC" };
    return { by: definition.measures[0]!, direction: "DESC" };
  }

  private title(definition: ReportBuilderDefinition): string {
    const measures = definition.measures.map((id) => measureMeta(id).label).join(", ");
    const dims = definition.dimensions.map((id) => dimensionMeta(id).label.toLowerCase());
    return dims.length ? `${measures} por ${dims.join(", ")}` : measures;
  }

  private async filterLabels(companyId: string, definition: ReportBuilderDefinition): Promise<ReportBuilderResult["filtersApplied"]> {
    return Promise.all(definition.filters.map(async (filter) => {
      const names = new Map<string, string>();
      const lookup = {
        STORE: sql`select id::text id, name label from stores where company_id = ${companyId}::uuid and id::text = any(${sql.param(filter.values)}::text[])`,
        CATEGORY: sql`select id::text id, name label from categories where company_id = ${companyId}::uuid and id::text = any(${sql.param(filter.values)}::text[])`,
        PRODUCT: sql`select id::text id, name label from products where company_id = ${companyId}::uuid and id::text = any(${sql.param(filter.values)}::text[])`,
        CUSTOMER: sql`select distinct u.id::text id, coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email, 'Cliente') label
          from app_users u join orders o on o.customer_id = u.id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
          where s.company_id = ${companyId}::uuid and u.id::text = any(${sql.param(filter.values)}::text[])`,
      } as Partial<Record<ReportDimensionId, ReturnType<typeof sql>>>;
      const query = lookup[filter.dimension];
      if (query) for (const row of (await this.database.db.execute(query)).rows as { id: string; label: string }[]) names.set(row.id, row.label);
      return {
        dimension: filter.dimension,
        label: dimensionMeta(filter.dimension).label,
        values: filter.values.map((value) => (query ? names.get(value) ?? "(sin coincidencias)" : dimensionLabel(filter.dimension, value, value))),
      };
    }));
  }

  /** Gráfico sugerido según la forma del resultado (líneas para fechas, barras, dona o mapa de calor). */
  private suggestChart(definition: ReportBuilderDefinition, rows: ReportBuilderResult["rows"]): ReportChart | null {
    if (!definition.dimensions.length || !rows.length) return null;
    const measure = definition.measures[0]!;
    const first = definition.dimensions[0]!;
    const title = `${measureMeta(measure).label} por ${definition.dimensions.map((id) => dimensionMeta(id).label.toLowerCase()).join(" y ")}`;
    if (definition.dimensions.length === 1) {
      const top = DIMENSION_SQL[first].date ? rows : rows.slice(0, 15);
      const series = [{ name: measureMeta(measure).label, data: top.map((row) => row.values[0]!) }];
      if (top.some((row) => row.previous)) series.push({ name: "Período anterior", data: top.map((row) => row.previous?.[0] ?? 0) });
      const donut = ["CHANNEL", "FULFILLMENT", "PAYMENT_METHOD", "ORDER_STATUS"].includes(first) && top.length <= 6 && measureMeta(measure).format !== "PERCENT" && series.length === 1;
      return { id: "builder-chart", title, type: DIMENSION_SQL[first].date || first === "HOUR" ? "LINE" : donut ? "DONUT" : "BAR", categories: top.map((row) => row.labels[0]!), series };
    }
    const [a, b] = [definition.dimensions[0]!, definition.dimensions[1]!];
    if ((a === "WEEKDAY" && b === "HOUR") || (a === "HOUR" && b === "WEEKDAY")) {
      const dayIndex = a === "WEEKDAY" ? 0 : 1;
      const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
      return {
        id: "builder-chart", title, type: "HEATMAP", categories: hours,
        series: weekdayOptions().map((day) => ({ name: day.label.slice(0, 3), data: hours.map((hour) => rows.find((row) => row.keys[dayIndex] === day.value && row.keys[1 - dayIndex] === hour)?.values[0] ?? 0) })),
      };
    }
    // Dos o más dimensiones: categorías de la primera y una serie por cada valor principal de la segunda.
    const categories = [...new Map(rows.map((row) => [row.keys[0]!, row.labels[0]!])).entries()].slice(0, DIMENSION_SQL[a].date ? 60 : 12);
    const totals = new Map<string, { label: string; total: number }>();
    for (const row of rows) {
      const entry = totals.get(row.keys[1]!) ?? { label: row.labels[1]!, total: 0 };
      entry.total += row.values[0]!;
      totals.set(row.keys[1]!, entry);
    }
    const seriesKeys = [...totals.entries()].sort((x, y) => y[1].total - x[1].total).slice(0, 6);
    return {
      id: "builder-chart", title, type: DIMENSION_SQL[a].date ? "LINE" : "BAR",
      categories: categories.map(([, label]) => label),
      series: seriesKeys.map(([key, entry]) => ({
        name: entry.label,
        data: categories.map(([category]) => rows.filter((row) => row.keys[0] === category && row.keys[1] === key).reduce((sum, row) => sum + row.values[0]!, 0)),
      })),
    };
  }
}
