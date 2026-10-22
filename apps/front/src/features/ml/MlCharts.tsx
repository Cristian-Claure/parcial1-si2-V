import type { MlAnomalies, MlForecast, MlSegments } from "@velora/contracts";
import { SEGMENT_COLORS } from "./mlFormat";

/** Gráficos SVG del módulo de ML (sin librerías): pronóstico con banda, dispersión PCA, barras, matriz y anomalías. */

const W = 760;
const H = 260;
const PAD = { left: 56, right: 16, top: 14, bottom: 30 };

const money = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const scale = (min: number, max: number, from: number, to: number) => (value: number) => (max === min ? (from + to) / 2 : from + ((value - min) / (max - min)) * (to - from));
const path = (points: [number, number][]) => points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const shortDay = (day: string) => `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`;

function Axes({ yMin, yMax, labels }: { yMin: number; yMax: number; labels: { x: number; text: string }[] }) {
  const y = scale(yMin, yMax, H - PAD.bottom, PAD.top);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) => yMin + (yMax - yMin) * step);
  return (
    <g className="ml-axes">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="ml-grid" />
          <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end">{money.format(tick)}</text>
        </g>
      ))}
      {labels.map((label) => <text key={`${label.x}-${label.text}`} x={label.x} y={H - 8} textAnchor="middle">{label.text}</text>)}
    </g>
  );
}

export function ForecastChart({ points }: { points: MlForecast["points"] }) {
  if (!points.length) return null;
  const values = points.flatMap((point) => [point.actual ?? 0, point.predicted, point.upper ?? point.predicted, point.lower ?? point.predicted]);
  const yMax = Math.max(...values) * 1.05;
  const x = scale(0, points.length - 1, PAD.left, W - PAD.right);
  const y = scale(0, yMax, H - PAD.bottom, PAD.top);
  const band = points.filter((point) => point.lower !== null && point.upper !== null);
  const bandPath = band.length ? `${path(band.map((point) => [x(points.indexOf(point)), y(point.upper!)]))} ${path(band.slice().reverse().map((point) => [x(points.indexOf(point)), y(point.lower!)])).replace(/^M/, "L")} Z` : "";
  const actual = points.map((point, index) => [point, index] as const).filter(([point]) => point.actual !== null);
  const split = points.findIndex((point) => point.kind === "FORECAST");
  const every = Math.max(1, Math.round(points.length / 8));
  return (
    <svg className="ml-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Venta real frente a la predicha, con banda de incertidumbre">
      <Axes yMin={0} yMax={yMax} labels={points.filter((_, index) => index % every === 0).map((point) => ({ x: x(points.indexOf(point)), text: shortDay(point.day) }))} />
      {bandPath ? <path d={bandPath} className="ml-band" /> : null}
      {split > 0 ? <line x1={x(split)} x2={x(split)} y1={PAD.top} y2={H - PAD.bottom} className="ml-split" /> : null}
      <path d={path(actual.map(([point, index]) => [x(index), y(point.actual!)]))} className="ml-line actual" />
      <path d={path(points.map((point, index) => [x(index), y(point.predicted)]))} className="ml-line predicted" />
    </svg>
  );
}

export function AnomalyChart({ days }: { days: MlAnomalies["days"] }) {
  if (!days.length) return null;
  const yMax = Math.max(...days.map((day) => Math.max(day.actual, day.expected))) * 1.05;
  const x = scale(0, days.length - 1, PAD.left, W - PAD.right);
  const y = scale(0, yMax, H - PAD.bottom, PAD.top);
  const every = Math.max(1, Math.round(days.length / 8));
  return (
    <svg className="ml-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Venta diaria con anomalías marcadas">
      <Axes yMin={0} yMax={yMax} labels={days.filter((_, index) => index % every === 0).map((day) => ({ x: x(days.indexOf(day)), text: shortDay(day.day) }))} />
      <path d={path(days.map((day, index) => [x(index), y(day.expected)]))} className="ml-line predicted" />
      <path d={path(days.map((day, index) => [x(index), y(day.actual)]))} className="ml-line actual thin" />
      {days.map((day, index) => day.isAnomaly ? (
        <circle key={day.day} cx={x(index)} cy={y(day.actual)} r={5} className={`ml-marker ${day.direction === "ALZA" ? "up" : "down"}`}>
          <title>{`${day.day}: Bs ${money.format(day.actual)} (esperado ${money.format(day.expected)}) · ${day.explanation ?? "sin explicación en el calendario"}`}</title>
        </circle>
      ) : null)}
    </svg>
  );
}

export function SegmentScatter({ customers, names }: { customers: MlSegments["customers"]; names: string[] }) {
  if (!customers.length) return null;
  const size = 320;
  const xs = customers.map((customer) => customer.pc1);
  const ys = customers.map((customer) => customer.pc2);
  const x = scale(Math.min(...xs), Math.max(...xs), 24, W - 24);
  const y = scale(Math.min(...ys), Math.max(...ys), size - 24, 24);
  return (
    <svg className="ml-chart" viewBox={`0 0 ${W} ${size}`} role="img" aria-label="Clientes proyectados en dos componentes principales, coloreados por segmento">
      <line x1={24} x2={W - 24} y1={y(0)} y2={y(0)} className="ml-grid" />
      <line x1={x(0)} x2={x(0)} y1={24} y2={size - 24} className="ml-grid" />
      {customers.map((customer) => (
        <circle key={customer.customerId} cx={x(customer.pc1)} cy={y(customer.pc2)} r={4} className="ml-dot" style={{ fill: SEGMENT_COLORS[names.indexOf(customer.segmentName) % SEGMENT_COLORS.length] }}>
          <title>{`${customer.name} · ${customer.segmentName} · ${customer.frequency} pedidos · Bs ${money.format(customer.monetary)}`}</title>
        </circle>
      ))}
      <text x={W - 24} y={y(0) - 6} textAnchor="end" className="ml-axis-label">Componente 1</text>
      <text x={x(0) + 6} y={30} className="ml-axis-label">Componente 2</text>
    </svg>
  );
}

export function BarList({ items, format = (value) => value.toFixed(3) }: { items: { label: string; value: number }[]; format?: (value: number) => string }) {
  const max = Math.max(...items.map((item) => Math.abs(item.value)), 1e-9);
  return (
    <ul className="ml-bars">
      {items.map((item) => (
        <li key={item.label}>
          <span>{item.label}</span>
          <div><i style={{ width: `${Math.max(2, (Math.abs(item.value) / max) * 100)}%` }} /></div>
          <b>{format(item.value)}</b>
        </li>
      ))}
    </ul>
  );
}

export function ConfusionMatrix({ confusion }: { confusion: { tn: number; fp: number; fn: number; tp: number } }) {
  const cell = (label: string, value: number, good: boolean) => <div className={`ml-cm-cell ${good ? "good" : "bad"}`}><b>{value}</b><span>{label}</span></div>;
  return (
    <div className="ml-cm" role="table" aria-label="Matriz de confusión en el conjunto de prueba">
      <span />
      <span className="ml-cm-head">Predijo: se completa</span>
      <span className="ml-cm-head">Predijo: se cancela</span>
      <span className="ml-cm-head side">Real: se completó</span>
      {cell("verdaderos negativos", confusion.tn, true)}
      {cell("falsas alarmas", confusion.fp, false)}
      <span className="ml-cm-head side">Real: se canceló</span>
      {cell("cancelaciones no detectadas", confusion.fn, false)}
      {cell("cancelaciones detectadas", confusion.tp, true)}
    </div>
  );
}
