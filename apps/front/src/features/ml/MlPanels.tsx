import type { ReactNode } from "react";
import type { MlAnomalies, MlCancelRisk, MlForecast, MlRun, MlSegments } from "@velora/contracts";
import { AnomalyChart, BarList, ConfusionMatrix, ForecastChart, SegmentScatter } from "./MlCharts";
import { SEGMENT_COLORS, featureLabel } from "./mlFormat";

/* eslint-disable @typescript-eslint/no-explicit-any -- las métricas son JSON propio de cada modelo */
type Metrics = Record<string, any>;

const money = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 });
const bs = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `Bs ${money.format(value)}`);
const pct = (value: number | null | undefined, digits = 1) => (value === null || value === undefined ? "—" : `${(value * 100).toLocaleString("es-BO", { maximumFractionDigits: digits })} %`);

const BASELINE_LABELS: Record<string, string> = { naive: "Ingenuo (último día)", seasonal_naive_7: "Ingenuo estacional (7 días)", moving_average_28: "Promedio móvil 28 días" };
const PAYMENT_LABELS: Record<string, string> = { CASH: "Efectivo", CARD: "Tarjeta", QR: "QR", COD: "Contra entrega", WEB: "Pago web", NONE: "Sin pago" };
const FULFILLMENT_LABELS: Record<string, string> = { DELIVERY: "Delivery", PICKUP: "Retiro en tienda" };

export function HowToRead({ children }: { children: ReactNode }) {
  return <aside className="ml-howto"><strong>Cómo leerlo</strong><p>{children}</p></aside>;
}

/** Estados vacíos, sin datos suficientes o fallidos de un modelo. */
export function RunState({ run, label }: { run: MlRun | null; label: string }) {
  if (!run) return <div className="ml-empty"><h3>Aún no hay resultados de {label.toLowerCase()}</h3><p>Pulsa "Entrenar de nuevo" para entrenar los modelos con el historial de esta tienda.</p></div>;
  if (run.status === "INSUFFICIENT_DATA") return <div className="ml-empty warn"><h3>Datos insuficientes</h3><p>{run.error ?? "La tienda todavía no tiene historial suficiente para este modelo."}</p></div>;
  return null;
}

function MetricCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return <article className={`ml-metric${tone ? ` ${tone}` : ""}`}><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</article>;
}

export function RunFooter({ run }: { run: MlRun }) {
  return <p className="ml-footnote">Corrida {run.id.slice(0, 8)} · {run.rowsUsed ?? 0} filas{run.dataFrom ? ` · datos ${run.dataFrom} a ${run.dataTo}` : ""} · {run.finishedAt ? new Date(run.finishedAt).toLocaleString("es-BO") : ""} · {run.artifactVersion}</p>;
}

// --- Pronóstico ------------------------------------------------------------------------------

export function ForecastPanel({ data }: { data: MlForecast }) {
  const empty = <RunState run={data.run} label="Pronóstico" />;
  if (!data.run || data.run.status !== "SUCCEEDED") return empty;
  const m = data.run.metrics as Metrics;
  const test = m.test ?? {};
  const best = test.baselines?.[m.best_baseline] ?? {};
  const future = data.points.filter((point) => point.kind === "FORECAST");
  const total30 = future.reduce((sum, point) => sum + point.predicted, 0);
  const rows: [string, any][] = [[`${m.selected?.name} (elegido)`, test.model], [test.alternative?.name, test.alternative], ...Object.entries(test.baselines ?? {}).map(([key, value]): [string, any] => [BASELINE_LABELS[key] ?? key, value])];
  return (
    <div className="ml-panel">
      <div className="ml-metrics">
        <MetricCard label="Venta neta pronosticada · 30 días" value={bs(total30)} hint={`${future[0]?.day ?? ""} a ${future.at(-1)?.day ?? ""}`} />
        <MetricCard label="Error medio (MAE) en prueba" value={bs(test.model?.mae)} hint={`Mejor referencia: ${bs(best.mae)}`} tone={m.beats_baselines ? "good" : "bad"} />
        <MetricCard label="sMAPE en prueba" value={`${number.format(test.model?.smape ?? 0)} %`} hint={`Referencia: ${number.format(best.smape ?? 0)} %`} />
        <MetricCard label="Cobertura de la banda (80 %)" value={pct(m.interval?.coverage_test)} hint="Días de prueba dentro de la banda" />
      </div>
      <section className="ml-card">
        <h3>Venta real frente a la predicha</h3>
        <ForecastChart points={data.points} />
        <p className="ml-legend"><i className="actual" />Real <i className="predicted" />Predicho <i className="band" />Banda 80 % · a la izquierda de la línea vertical, los {test.days} días de prueba; a la derecha, el pronóstico.</p>
      </section>
      <div className="ml-grid-2">
        <section className="ml-card">
          <h3>Modelo frente a referencias ({test.from} a {test.to})</h3>
          <table className="ml-table">
            <thead><tr><th>Modelo</th><th className="num">MAE</th><th className="num">RMSE</th><th className="num">sMAPE</th></tr></thead>
            <tbody>{rows.filter(([name, value]) => name && value).map(([name, value]) => <tr key={name}><td>{name}</td><td className="num">{bs(value.mae)}</td><td className="num">{bs(value.rmse)}</td><td className="num">{number.format(value.smape)} %</td></tr>)}</tbody>
          </table>
          <p className="ml-footnote">{m.beats_baselines ? "El modelo supera a la mejor referencia en el período de prueba." : "El modelo NO supera a la mejor referencia en el período de prueba; se reporta tal cual."}</p>
        </section>
        <section className="ml-card">
          <h3>Variables más importantes</h3>
          <BarList items={(m.importances ?? []).map((item: any) => ({ label: featureLabel(item.feature), value: item.importance }))} format={(value) => `Bs ${money.format(value)}`} />
          <p className="ml-footnote">Cuánto empeora el error (Bs) si se desordena la variable.</p>
        </section>
      </div>
      <HowToRead>La línea oscura es la venta neta real (pagos confirmados menos reembolsos) y la de color, la que predijo el modelo sin ver esos días. La zona sombreada contiene el 80 % de los resultados esperables. El modelo se eligió en {m.validation?.folds?.length ?? 3} pliegues de validación y se evalúa en los últimos {test.days} días, pronosticando de a 30 días como en producción.</HowToRead>
      <RunFooter run={data.run} />
    </div>
  );
}

// --- Segmentos -------------------------------------------------------------------------------

export function SegmentsPanel({ data }: { data: MlSegments }) {
  if (!data.run || data.run.status !== "SUCCEEDED") return <RunState run={data.run} label="Segmentos" />;
  const m = data.run.metrics as Metrics;
  const profiles: any[] = m.profiles ?? [];
  const names = profiles.map((profile) => profile.name);
  const seeded = m.seeded_comparison;
  return (
    <div className="ml-panel">
      <div className="ml-metrics">
        <MetricCard label="Segmentos (k)" value={String(m.k)} hint={`Silhouette ${number.format(m.silhouette)}`} />
        <MetricCard label="Clientes segmentados" value={String(data.customers.length)} hint={`RFM al ${m.cutoff}`} />
        <MetricCard label="Varianza explicada (PCA 2D)" value={pct((m.pca_explained ?? []).reduce((sum: number, value: number) => sum + value, 0))} />
        {seeded ? <MetricCard label="Coincidencia con lo sembrado (ARI)" value={number.format(seeded.ari)} hint={`${seeded.matched} clientes comparados`} /> : null}
      </div>
      <div className="ml-profiles">
        {profiles.map((profile, index) => (
          <article key={profile.segment} className="ml-profile" style={{ borderTopColor: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }}>
            <h4>{profile.name}</h4>
            <strong>{profile.customers} clientes · {pct(profile.share_customers, 0)}</strong>
            <dl>
              <div><dt>Ingresos</dt><dd>{pct(profile.revenue_share)}</dd></div>
              <div><dt>Última compra</dt><dd>hace {Math.round(profile.recency_days)} días</dd></div>
              <div><dt>Pedidos</dt><dd>{number.format(profile.frequency)}</dd></div>
              <div><dt>Gasto medio</dt><dd>{bs(profile.monetary)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <section className="ml-card">
        <h3>Mapa de clientes (PCA)</h3>
        <SegmentScatter customers={data.customers} names={names} />
        <p className="ml-legend">{names.map((name, index) => <span key={name}><i style={{ background: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }} />{name}</span>)}</p>
      </section>
      <div className="ml-grid-2">
        <section className="ml-card">
          <h3>Elección de k</h3>
          <table className="ml-table">
            <thead><tr><th>k</th><th className="num">Silhouette</th><th className="num">Estabilidad</th><th className="num">Inercia</th></tr></thead>
            <tbody>{(m.k_selection ?? []).map((row: any) => <tr key={row.k} className={row.k === m.k ? "selected" : undefined}><td>{row.k}{row.elbow ? " · codo" : ""}{row.k === m.k ? " · elegido" : ""}</td><td className="num">{number.format(row.silhouette)}</td><td className="num">{number.format(row.stability)}</td><td className="num">{number.format(row.inertia)}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="ml-card">
          <h3>Clientes de mayor valor</h3>
          <table className="ml-table">
            <thead><tr><th>Cliente</th><th>Segmento</th><th className="num">Pedidos</th><th className="num">Gasto</th></tr></thead>
            <tbody>{data.customers.slice(0, 10).map((customer) => <tr key={customer.customerId}><td>{customer.name}</td><td>{customer.segmentName}</td><td className="num">{customer.frequency}</td><td className="num">{bs(customer.monetary)}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
      <HowToRead>Cada punto es un cliente ubicado según qué tan reciente, frecuente y alto es su gasto (RFM). Los colores son los segmentos que encontró el algoritmo sin etiquetas previas; los nombres salen de reglas sobre esos perfiles. Usa "En riesgo" para campañas de reactivación y "Leales" para beneficios.</HowToRead>
      <RunFooter run={data.run} />
    </div>
  );
}

// --- Riesgo de cancelación -------------------------------------------------------------------

export function CancelRiskPanel({ data }: { data: MlCancelRisk }) {
  if (!data.run || data.run.status !== "SUCCEEDED") return <RunState run={data.run} label="Riesgo de cancelación" />;
  const m = data.run.metrics as Metrics;
  const test = m.test ?? {};
  const model = test.model ?? {};
  const compare: [string, any][] = [[`${m.selected?.name} (elegido)`, model], ["Regresión logística", test.logistic], ["Clase mayoritaria", test.majority]];
  return (
    <div className="ml-panel">
      <div className="ml-metrics">
        <MetricCard label="ROC-AUC en prueba" value={number.format(model.roc_auc ?? 0)} hint="0,5 = azar · 1 = perfecto" tone={m.beats_baselines ? "good" : "bad"} />
        <MetricCard label="PR-AUC en prueba" value={number.format(model.pr_auc ?? 0)} hint={`Azar = tasa de cancelación ${pct(m.prevalence?.test)}`} />
        <MetricCard label="Recall / precisión" value={`${pct(model.recall, 0)} / ${pct(model.precision, 0)}`} hint={`Umbral ${number.format(model.threshold ?? 0)} elegido en validación`} />
        <MetricCard label="Pedidos abiertos puntuados" value={String(m.open_orders ?? data.orders.length)} hint={`${data.orders.filter((order) => order.riskLevel === "ALTO").length} con riesgo alto`} />
      </div>
      <div className="ml-grid-2">
        <section className="ml-card">
          <h3>Matriz de confusión (prueba: {m.split?.test} pedidos)</h3>
          {model.confusion ? <ConfusionMatrix confusion={model.confusion} /> : null}
        </section>
        <section className="ml-card">
          <h3>Modelo frente a referencias</h3>
          <table className="ml-table">
            <thead><tr><th>Modelo</th><th className="num">ROC-AUC</th><th className="num">PR-AUC</th><th className="num">F1</th><th className="num">Brier</th></tr></thead>
            <tbody>{compare.filter(([, value]) => value).map(([name, value]) => <tr key={name}><td>{name}</td><td className="num">{number.format(value.roc_auc ?? 0)}</td><td className="num">{number.format(value.pr_auc ?? 0)}</td><td className="num">{number.format(value.f1 ?? 0)}</td><td className="num">{number.format(value.brier ?? 0)}</td></tr>)}</tbody>
          </table>
          <p className="ml-footnote">Partición temporal: entrena hasta {String(m.split?.train_until ?? "").slice(0, 10)} y prueba desde {String(m.split?.test_from ?? "").slice(0, 10)}.{m.calibration?.brier_calibrated !== undefined ? ` Probabilidades calibradas (Platt en validación): Brier ${number.format(m.calibration.brier_uncalibrated)} sin calibrar → ${number.format(m.calibration.brier_calibrated)}; el orden (ROC-AUC) no cambia.` : " El Brier alto refleja los pesos de clase (probabilidades no calibradas)."}</p>
        </section>
      </div>
      <div className="ml-grid-2">
        <section className="ml-card">
          <h3>Qué variables pesan más</h3>
          <BarList items={(m.importances ?? []).slice(0, 8).map((item: any) => ({ label: featureLabel(item.feature), value: item.importance }))} />
          <p className="ml-footnote">Caída del ROC-AUC al desordenar la variable (importancia por permutación).</p>
        </section>
        <section className="ml-card">
          <h3>Tasa histórica de cancelación</h3>
          <BarList items={Object.entries(m.cancel_rate_by_fulfillment ?? {}).map(([key, value]) => ({ label: FULFILLMENT_LABELS[key] ?? key, value: Number(value) }))} format={(value) => pct(value)} />
        </section>
      </div>
      <section className="ml-card">
        <h3>Pedidos abiertos con mayor riesgo</h3>
        {data.orders.length === 0 ? <p className="ml-footnote">No hay pedidos online abiertos en este momento.</p> : (
          <table className="ml-table">
            <thead><tr><th>Pedido</th><th>Creado</th><th>Entrega</th><th>Pago</th><th className="num">Total</th><th className="num">Probabilidad</th><th>Riesgo</th></tr></thead>
            <tbody>{data.orders.slice(0, 15).map((order) => (
              <tr key={order.orderId}>
                <td>{order.orderNumber}</td><td>{new Date(order.createdAt).toLocaleString("es-BO")}</td>
                <td>{FULFILLMENT_LABELS[String(order.features.fulfillment_type)] ?? String(order.features.fulfillment_type)}</td>
                <td>{PAYMENT_LABELS[String(order.features.payment_method)] ?? String(order.features.payment_method)}</td>
                <td className="num">{bs(order.total)}</td><td className="num">{pct(order.probability)}</td>
                <td><span className={`ml-risk ${order.riskLevel.toLowerCase()}`}>{order.riskLevel === "ALTO" ? "Alto" : order.riskLevel === "MEDIO" ? "Medio" : "Bajo"}</span></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
      <HowToRead>El modelo estima, en el momento del checkout, la probabilidad de que un pedido online termine cancelado. Solo usa lo que se sabe en ese instante: entrega, método de pago, total, ítems, hora y antigüedad del cliente. Llama primero a los pedidos de riesgo alto para confirmar la entrega o el pago.</HowToRead>
      <RunFooter run={data.run} />
    </div>
  );
}

// --- Anomalías -------------------------------------------------------------------------------

export function AnomaliesPanel({ data }: { data: MlAnomalies }) {
  if (!data.run || data.run.status !== "SUCCEEDED") return <RunState run={data.run} label="Anomalías" />;
  const m = data.run.metrics as Metrics;
  const flagged = data.days.filter((day) => day.isAnomaly);
  // Iteración de la Parte B: la serie es de pedidos por día (corridas anteriores: venta en Bs).
  const orders = m.unit === "ORDERS";
  const value = (amount: number) => (orders ? `${Math.round(amount)} pedidos` : bs(amount));
  return (
    <div className="ml-panel">
      <div className="ml-metrics">
        <MetricCard label="Días atípicos" value={String(m.anomalies)} hint={`${m.up} al alza · ${m.down} a la baja`} />
        <MetricCard label="Fechas especiales detectadas" value={`${m.seeded_detected} de ${m.seeded_special_days}`} hint="Black Friday, Madre, Padre, Nochebuena, Navidad" />
        <MetricCard label="Explicadas por el calendario" value={String(m.explained)} hint={`${m.unexplained_false_positives} sin explicación`} />
        <MetricCard label="Umbral" value={`|z| ≥ ${m.threshold}`} hint="z robusto (mediana y MAD)" />
      </div>
      <section className="ml-card">
        <h3>{orders ? "Pedidos por día y días atípicos" : "Venta diaria y días atípicos"}</h3>
        <AnomalyChart days={data.days} />
        <p className="ml-legend"><i className="actual" />Real <i className="predicted" />Esperado <i className="marker up" />Alza <i className="marker down" />Baja</p>
      </section>
      <section className="ml-card">
        <h3>Días marcados</h3>
        {flagged.length === 0 ? <p className="ml-footnote">No hay días atípicos con el umbral actual.</p> : (
          <table className="ml-table">
            <thead><tr><th>Día</th><th className="num">Real</th><th className="num">Esperado</th><th className="num">z</th><th>Explicación</th></tr></thead>
            <tbody>{flagged.map((day) => <tr key={day.day}><td>{day.day}</td><td className="num">{value(day.actual)}</td><td className="num">{value(day.expected)}</td><td className="num">{number.format(day.score)}</td><td>{day.explanation ?? "Sin explicación en el calendario"}</td></tr>)}</tbody>
          </table>
        )}
      </section>
      <section className="ml-card">
        <h3>Fechas especiales del calendario</h3>
        <table className="ml-table">
          <thead><tr><th>Fecha</th><th>Evento</th><th className="num">z</th><th>Detectada</th></tr></thead>
          <tbody>{(m.seeded_detail ?? []).map((row: any) => <tr key={row.day}><td>{row.day}</td><td>{row.label}</td><td className="num">{number.format(row.z)}</td><td>{row.detected ? "Sí" : "No"}</td></tr>)}</tbody>
        </table>
      </section>
      <HowToRead>La línea de color es {orders ? "la cantidad de pedidos esperada" : "la venta esperada"} para ese día de la semana y ese nivel de ventas. Un punto marca un día que se aleja demasiado de lo esperado (|z| ≥ {m.threshold}). Cada uno se explica con el calendario comercial; los que no tienen explicación merecen revisión (quiebre de stock, cierre, error de carga).</HowToRead>
      <RunFooter run={data.run} />
    </div>
  );
}
