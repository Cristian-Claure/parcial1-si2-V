import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  REPORT_BUILDER_LIMITS,
  type ReportBuilderDefinitionInput, type ReportBuilderFilter, type ReportBuilderResult, type ReportDefinition, type ReportDimensionId,
  type ReportExportFormat, type ReportMeasureId, type ReportPeriodPreset, type ReportSemanticCatalog,
} from "@velora/contracts";
import { ApiClientError } from "../../core/api/apiClient";
import { useAuthStore } from "../../core/auth/authStore";
import { useCompanyStore } from "../../core/company/companyStore";
import { Notice } from "../../shared/feedback/Notice";
import { HeatmapChart } from "./HeatmapChart";
import { ReportChartCard } from "./ReportChartCard";
import { reportsApi, saveBlob, type ReportRole } from "./reportsApi";
import "./reports.css";
import "./builder.css";

const PRESETS: { id: ReportPeriodPreset | "CUSTOM"; label: string }[] = [
  { id: "LAST_7", label: "7 días" }, { id: "LAST_30", label: "30 días" }, { id: "LAST_90", label: "90 días" },
  { id: "THIS_MONTH", label: "Este mes" }, { id: "THIS_YEAR", label: "Este año" }, { id: "LAST_365", label: "12 meses" },
  { id: "ALL", label: "Todo el historial" }, { id: "CUSTOM", label: "Personalizado" },
];
const GROUP_LABEL: Record<string, string> = { FECHA: "Fecha", OPERACION: "Operación", PRODUCTO: "Producto", CLIENTE: "Cliente" };

const money = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });
function formatMeasure(value: number | null | undefined, format: string | null): string {
  if (value === null || value === undefined) return "—";
  if (format === "CURRENCY") return `Bs ${money.format(value)}`;
  if (format === "PERCENT") return `${count.format(value)} %`;
  return count.format(value);
}
const change = (current: number, previous: number | null | undefined) =>
  previous === null || previous === undefined || previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;

function useDebounced<T>(value: T, delay = 450): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const errorMessage = (error: unknown) => (error instanceof ApiClientError || error instanceof Error ? error.message : "No fue posible completar la acción.");
const planLocked = (error: unknown) => error instanceof ApiClientError && error.status === 403 && error.code === "PLAN_LIMIT_REPORT_FEATURE";

/** Constructor dinámico: selección guiada de dimensiones, medidas y filtros con vista previa en vivo. */
export function ReportBuilderPage() {
  const user = useAuthStore((state) => state.user);
  const companyId = useCompanyStore((state) => state.adminCompanyId);
  const role: ReportRole = user?.role === "STORE_MANAGER" ? "STORE_MANAGER" : "ADMIN";
  const reportsPath = role === "ADMIN" ? "/admin/reportes" : "/sucursal/reportes";
  const queryClient = useQueryClient();

  const [preset, setPreset] = useState<ReportPeriodPreset | "CUSTOM">("LAST_90");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dimensions, setDimensions] = useState<ReportDimensionId[]>(["DATE_MONTH"]);
  const [measures, setMeasures] = useState<ReportMeasureId[]>(["NET_SALES", "ORDERS"]);
  const [filters, setFilters] = useState<ReportBuilderFilter[]>([]);
  const [filterDimension, setFilterDimension] = useState<ReportDimensionId | "">("");
  const [sortBy, setSortBy] = useState<string>("");
  const [direction, setDirection] = useState<"ASC" | "DESC">("DESC");
  const [limit, setLimit] = useState(50);
  const [compare, setCompare] = useState(false);
  const [active, setActive] = useState<ReportDefinition | null>(null);
  const [name, setName] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const enabled = role === "STORE_MANAGER" || Boolean(companyId);
  const catalog = useQuery({
    queryKey: ["report-catalog", role, companyId],
    queryFn: () => reportsApi.catalog(role, companyId),
    enabled,
    retry: (failures, error) => !planLocked(error) && failures < 1,
  });
  const definitions = useQuery({
    queryKey: ["report-definitions", companyId],
    queryFn: () => reportsApi.definitions(companyId!),
    enabled: role === "ADMIN" && Boolean(companyId) && catalog.isSuccess,
  });

  const definition: ReportBuilderDefinitionInput = useMemo(() => ({
    dimensions, measures, filters, limit, compareWithPrevious: compare,
    ...(sortBy ? { sort: { by: sortBy as ReportDimensionId | ReportMeasureId, direction } } : {}),
    ...(preset === "CUSTOM" ? (from && to ? { from, to } : { preset: "LAST_30" as const }) : { preset }),
  }), [dimensions, measures, filters, limit, compare, sortBy, direction, preset, from, to]);
  const debounced = useDebounced(definition);

  const result = useQuery({
    queryKey: ["report-builder", role, companyId, debounced],
    queryFn: () => reportsApi.query(role, companyId, debounced),
    enabled: enabled && catalog.isSuccess && debounced.measures.length > 0,
    retry: false,
    placeholderData: (previous) => previous,
  });

  const exporter = useMutation({
    mutationFn: async (format: ReportExportFormat) => {
      const blob = await reportsApi.exportQuery(role, companyId, definition, format);
      saveBlob(blob, result.data?.title ?? "reporte", format);
    },
    onError: (error) => setFeedback({ kind: "error", text: errorMessage(error) }),
  });

  const saver = useMutation({
    mutationFn: async (mode: "create" | "update" | "delete") => {
      if (mode === "delete") { await reportsApi.deleteDefinition(active!.id); return null; }
      if (mode === "update") return reportsApi.updateDefinition(active!.id, { name: name.trim(), definition });
      return reportsApi.createDefinition(companyId!, name.trim(), definition);
    },
    onSuccess: async (saved, mode) => {
      setActive(saved);
      if (mode === "delete") setName("");
      setFeedback({ kind: "success", text: mode === "delete" ? "Reporte eliminado." : mode === "update" ? "Cambios guardados." : "Reporte guardado." });
      await queryClient.invalidateQueries({ queryKey: ["report-definitions", companyId] });
    },
    onError: (error) => setFeedback({ kind: "error", text: errorMessage(error) }),
  });

  const load = (saved: ReportDefinition) => {
    const value = saved.definition;
    setActive(saved);
    setName(saved.name);
    setDimensions(value.dimensions);
    setMeasures(value.measures);
    setFilters(value.filters);
    setLimit(value.limit);
    setCompare(value.compareWithPrevious);
    setSortBy(value.sort?.by ?? "");
    setDirection(value.sort?.direction ?? "DESC");
    if (value.from && value.to && !value.preset) { setPreset("CUSTOM"); setFrom(value.from); setTo(value.to); } else setPreset(value.preset ?? "LAST_30");
    setFeedback(null);
  };

  const toggleDimension = (id: ReportDimensionId) => {
    setDimensions((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length >= REPORT_BUILDER_LIMITS.maxDimensions ? current : [...current, id]));
    if (sortBy === id) setSortBy("");
  };
  const toggleMeasure = (id: ReportMeasureId) => {
    setMeasures((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length >= REPORT_BUILDER_LIMITS.maxMeasures ? current : [...current, id]));
    if (sortBy === id) setSortBy("");
  };
  const toggleFilterValue = (dimension: ReportDimensionId, value: string) => setFilters((current) => {
    const existing = current.find((filter) => filter.dimension === dimension);
    if (!existing) return [...current, { dimension, values: [value] }];
    const values = existing.values.includes(value) ? existing.values.filter((item) => item !== value) : [...existing.values, value];
    return values.length ? current.map((filter) => (filter.dimension === dimension ? { ...filter, values } : filter)) : current.filter((filter) => filter.dimension !== dimension);
  });

  const heading = (
    <div className="page-heading report-heading">
      <div>
        <span className="eyebrow">{role === "ADMIN" ? "REPORTES · CONSTRUCTOR" : "SUCURSAL · CONSTRUCTOR"}</span>
        <h1>Arma tu reporte</h1>
        <p>Cruza ventas, pedidos, productos, clientes e inventario con hasta tres agrupaciones. Las cifras salen del backend con la misma definición del resumen.</p>
      </div>
      <Link className="button" to={reportsPath}>Volver al resumen</Link>
    </div>
  );

  if (!enabled) {
    return <section className="page builder-page">{heading}<Notice>Selecciona una compañía en el menú lateral para usar el constructor.</Notice></section>;
  }
  if (catalog.isError) {
    return (
      <section className="page builder-page">
        {heading}
        {planLocked(catalog.error) ? (
          <article className="builder-locked">
            <span className="builder-locked-badge">Disponible en PLUS/MAX</span>
            <h2>Constructor dinámico y exportación a Excel y PDF</h2>
            <p>Tu plan actual incluye el resumen básico de 30 días. Mejora tu plan para cruzar tablas, guardar reportes y exportarlos con tu marca.</p>
            {role === "ADMIN" ? <Link className="button primary" to="/admin/mi-plan">Mejorar plan</Link> : <p className="field-hint">Pide al propietario que mejore el plan.</p>}
          </article>
        ) : <Notice kind="error">{errorMessage(catalog.error)}</Notice>}
      </section>
    );
  }
  if (!catalog.data) return <section className="page builder-page">{heading}<p className="report-empty">Cargando catálogo…</p></section>;

  const meta: ReportSemanticCatalog = catalog.data;
  const inventoryOnly = measures.includes("INVENTORY_VALUE");
  const groups = [...new Set(meta.dimensions.map((dimension) => dimension.group))];
  const filterable = meta.dimensions.filter((dimension) => dimension.filterable && !dimension.locked && (meta.filterOptions[dimension.id]?.length ?? 0) > 0);
  const data: ReportBuilderResult | undefined = result.data;
  const measureColumns = data?.columns.filter((column) => column.kind === "MEASURE") ?? [];
  const dimensionColumns = data?.columns.filter((column) => column.kind === "DIMENSION") ?? [];
  const lockBadge = (requiredPlan: string | null) => <span className="builder-lock" title={`Disponible en ${requiredPlan ?? "un plan superior"}`}>{requiredPlan ?? "PLUS"}</span>;

  return (
    <section className="page reports-page builder-page">
      {heading}
      {feedback ? <Notice kind={feedback.kind}>{feedback.text}</Notice> : null}

      <div className="builder-layout">
        <aside className="builder-config">
          {role === "ADMIN" ? (
            <section className="builder-step">
              <h2><span>0</span>Reportes guardados</h2>
              <select aria-label="Abrir reporte guardado" value={active?.id ?? ""} onChange={(event) => {
                const saved = definitions.data?.find((item) => item.id === event.target.value);
                if (saved) load(saved); else { setActive(null); setName(""); }
              }}>
                <option value="">Nuevo reporte</option>
                {definitions.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <div className="builder-save">
                <input aria-label="Nombre del reporte" placeholder="Nombre del reporte" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
                <button className="button primary small" type="button" disabled={name.trim().length < 2 || !measures.length || saver.isPending} onClick={() => saver.mutate(active ? "update" : "create")}>{active ? "Guardar cambios" : "Guardar"}</button>
                {active ? <button className="button small" type="button" disabled={saver.isPending} onClick={() => saver.mutate("delete")}>Eliminar</button> : null}
              </div>
            </section>
          ) : null}

          <section className="builder-step">
            <h2><span>1</span>Período</h2>
            <div className="period-presets">
              {PRESETS.map((item) => <button key={item.id} type="button" className={`chip${preset === item.id ? " active" : ""}`} onClick={() => setPreset(item.id)}>{item.label}</button>)}
            </div>
            {preset === "CUSTOM" ? (
              <div className="builder-dates">
                <label>Desde<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
                <label>Hasta<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
              </div>
            ) : null}
            <label className="builder-check"><input type="checkbox" checked={compare} disabled={!meta.policy.canPeriodComparison} onChange={(event) => setCompare(event.target.checked)} />Comparar con el período anterior</label>
            {meta.policy.historyDays ? <p className="field-hint">Tu plan consulta hasta {meta.policy.historyDays} días de historial; el backend ajusta el período si te pasas.</p> : null}
          </section>

          <section className="builder-step">
            <h2><span>2</span>Agrupar por <small>{dimensions.length}/{meta.limits.maxDimensions}</small></h2>
            {groups.map((group) => (
              <div key={group} className="builder-group">
                <h3>{GROUP_LABEL[group] ?? group}</h3>
                <div className="builder-chips">
                  {meta.dimensions.filter((dimension) => dimension.group === group).map((dimension) => {
                    const position = dimensions.indexOf(dimension.id);
                    const blocked = dimension.locked || (inventoryOnly && !dimension.inventory) || (position < 0 && dimensions.length >= meta.limits.maxDimensions);
                    return (
                      <button key={dimension.id} type="button" disabled={blocked} className={`chip${position >= 0 ? " active" : ""}${dimension.locked ? " locked" : ""}`} onClick={() => toggleDimension(dimension.id)}>
                        {position >= 0 ? <b>{position + 1}</b> : null}{dimension.label}{dimension.locked ? lockBadge(dimension.requiredPlan) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          <section className="builder-step">
            <h2><span>3</span>Medidas <small>{measures.length}/{meta.limits.maxMeasures}</small></h2>
            <div className="builder-chips">
              {meta.measures.map((measure) => (
                <button key={measure.id} type="button" title={measure.description} disabled={measure.locked} className={`chip${measures.includes(measure.id) ? " active" : ""}${measure.locked ? " locked" : ""}`} onClick={() => toggleMeasure(measure.id)}>
                  {measure.label}{measure.locked ? lockBadge(measure.requiredPlan) : null}
                </button>
              ))}
            </div>
            {inventoryOnly ? <p className="field-hint">El valor de inventario es una foto actual: solo se combina con sucursal y atributos de producto.</p> : null}
          </section>

          <section className="builder-step">
            <h2><span>4</span>Filtros</h2>
            <select aria-label="Agregar filtro" value={filterDimension} onChange={(event) => setFilterDimension(event.target.value as ReportDimensionId | "")}>
              <option value="">Elegir un campo para filtrar…</option>
              {filterable.map((dimension) => <option key={dimension.id} value={dimension.id}>{dimension.label}</option>)}
            </select>
            {filterDimension ? (
              <div className="builder-options">
                {meta.filterOptions[filterDimension]?.map((option) => {
                  const checked = filters.find((filter) => filter.dimension === filterDimension)?.values.includes(option.value) ?? false;
                  return <label key={option.value} className="builder-check"><input type="checkbox" checked={checked} onChange={() => toggleFilterValue(filterDimension, option.value)} />{option.label}</label>;
                })}
              </div>
            ) : null}
            {filters.length ? (
              <ul className="builder-active-filters">
                {filters.map((filter) => {
                  const label = meta.dimensions.find((dimension) => dimension.id === filter.dimension)?.label;
                  const names = filter.values.map((value) => meta.filterOptions[filter.dimension]?.find((option) => option.value === value)?.label ?? value);
                  return <li key={filter.dimension}><span><b>{label}:</b> {names.join(", ")}</span><button type="button" aria-label={`Quitar filtro ${label}`} onClick={() => setFilters((current) => current.filter((item) => item.dimension !== filter.dimension))}>×</button></li>;
                })}
              </ul>
            ) : <p className="field-hint">Sin filtros: todo el alcance.</p>}
          </section>

          <section className="builder-step">
            <h2><span>5</span>Orden y top N</h2>
            <div className="builder-dates">
              <label>Ordenar por
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="">Automático</option>
                  {[...dimensions, ...measures].map((id) => <option key={id} value={id}>{meta.dimensions.find((item) => item.id === id)?.label ?? meta.measures.find((item) => item.id === id)?.label}</option>)}
                </select>
              </label>
              <label>Sentido
                <select value={direction} disabled={!sortBy} onChange={(event) => setDirection(event.target.value as "ASC" | "DESC")}>
                  <option value="DESC">Mayor a menor</option>
                  <option value="ASC">Menor a mayor</option>
                </select>
              </label>
              <label>Top N
                <input type="number" min={1} max={meta.limits.maxRows} value={limit} onChange={(event) => setLimit(Math.min(meta.limits.maxRows, Math.max(1, Number(event.target.value) || 1)))} />
              </label>
            </div>
          </section>
        </aside>

        <div className="builder-preview">
          <div className="builder-preview-head">
            <div>
              <span className="eyebrow">Vista previa {result.isFetching ? "· actualizando…" : "en vivo"}</span>
              <h2>{data?.title ?? "Elige al menos una medida"}</h2>
              {data ? <p className="field-hint">{data.scopeLabel} · {data.from} a {data.to}{data.previousFrom ? ` · vs ${data.previousFrom} a ${data.previousTo}` : ""}</p> : null}
            </div>
            <div className="actions">
              <button className="button small" type="button" disabled={!data || exporter.isPending} onClick={() => exporter.mutate("xlsx")}>Excel</button>
              <button className="button primary small" type="button" disabled={!data || exporter.isPending} onClick={() => exporter.mutate("pdf")}>PDF</button>
            </div>
          </div>

          {result.isError ? <Notice kind="error">{errorMessage(result.error)}</Notice> : null}
          {data?.notes.map((note) => <p key={note} className="builder-note">{note}</p>)}

          {data ? (
            <div className="builder-totals">
              {measureColumns.map((column, index) => {
                const delta = data.previousTotals ? change(data.totals[index]!, data.previousTotals[index]) : null;
                return (
                  <article key={column.id} className="report-kpi">
                    <span>{column.label}</span>
                    <strong>{formatMeasure(data.totals[index], column.format)}</strong>
                    {data.previousTotals ? <small>Anterior: {formatMeasure(data.previousTotals[index], column.format)}{delta !== null ? ` · ${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} %` : ""}</small> : null}
                  </article>
                );
              })}
            </div>
          ) : null}

          {data?.suggestedChart ? (data.suggestedChart.type === "HEATMAP" ? <HeatmapChart chart={data.suggestedChart} /> : <ReportChartCard chart={data.suggestedChart} />) : null}

          {data && dimensionColumns.length ? (
            <div className="builder-table-wrap">
              <table className="builder-table">
                <thead>
                  <tr>{data.columns.map((column) => <th key={column.id} className={column.kind === "MEASURE" ? "num" : undefined}>{column.label}</th>)}</tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? <tr><td colSpan={data.columns.length} className="report-empty">Sin datos para esta combinación.</td></tr> : null}
                  {data.rows.map((row) => (
                    <tr key={row.keys.join("|")}>
                      {row.labels.map((label, index) => <td key={index}>{label}</td>)}
                      {row.values.map((value, index) => {
                        const previous = row.previous?.[index];
                        const delta = row.previous ? change(value, previous) : null;
                        return (
                          <td key={index} className="num">
                            {formatMeasure(value, measureColumns[index]!.format)}
                            {row.previous ? <small className={delta !== null && delta < 0 ? "down" : "up"}>{delta === null ? "nuevo" : `${delta >= 0 ? "+" : ""}${delta} %`}</small> : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    {dimensionColumns.map((column, index) => <td key={column.id}>{index === 0 ? "Total" : ""}</td>)}
                    {data.totals.map((value, index) => <td key={index} className="num">{formatMeasure(value, measureColumns[index]!.format)}</td>)}
                  </tr>
                </tfoot>
              </table>
              {data.truncated ? <p className="field-hint">Se muestran las primeras {data.rows.length} filas. Ajusta el top N o el orden.</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
