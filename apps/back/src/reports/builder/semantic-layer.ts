import { REPORT_DIMENSIONS, REPORT_MEASURES, type ReportDimensionId, type ReportMeasureId } from "@velora/contracts";
import { REPORT_ZONE } from "../report-facts.js";

/**
 * Capa semántica del constructor: LISTA BLANCA identificador → fragmento SQL constante.
 * Ningún texto del cliente llega a estos fragmentos; los valores de filtros y fechas viajan
 * siempre como parámetros. Alias disponibles en la consulta final:
 *   g  = hechos unificados (eventos de pago, de pedido y filas de stock)
 *   o  = orders · cu = app_users (cliente) · pv/pr/c = variante, producto y categoría
 *   fp = primera compra pagada por cliente (para nuevos y recurrentes)
 */

const LOCAL_TS = `(g.ts at time zone '${REPORT_ZONE}')`;

export interface DimensionSql {
  key: string;
  label: string;
  /** Requiere bajar al grano de ítem/variante (categoría, producto, marca, talla, color). */
  item?: boolean;
  /** Requiere el cliente del pedido. */
  customer?: boolean;
  /** Para eventos de pedido (creado/cancelado) usa el último método de pago del pedido. */
  payment?: boolean;
  /** Forma de los valores de filtro aceptados. */
  values?: "uuid" | "weekday" | "hour";
  date?: boolean;
}

export const DIMENSION_SQL: Record<ReportDimensionId, DimensionSql> = {
  DATE_DAY: { key: `to_char(${LOCAL_TS}, 'YYYY-MM-DD')`, label: `to_char(${LOCAL_TS}, 'YYYY-MM-DD')`, date: true },
  DATE_WEEK: { key: `to_char(date_trunc('week', ${LOCAL_TS}), 'YYYY-MM-DD')`, label: `to_char(date_trunc('week', ${LOCAL_TS}), 'YYYY-MM-DD')`, date: true },
  DATE_MONTH: { key: `to_char(${LOCAL_TS}, 'YYYY-MM')`, label: `to_char(${LOCAL_TS}, 'YYYY-MM')`, date: true },
  DATE_QUARTER: { key: `to_char(${LOCAL_TS}, 'YYYY-"T"Q')`, label: `to_char(${LOCAL_TS}, 'YYYY-"T"Q')`, date: true },
  DATE_YEAR: { key: `to_char(${LOCAL_TS}, 'YYYY')`, label: `to_char(${LOCAL_TS}, 'YYYY')`, date: true },
  WEEKDAY: { key: `extract(isodow from ${LOCAL_TS})::int::text`, label: `extract(isodow from ${LOCAL_TS})::int::text`, values: "weekday" },
  HOUR: { key: `lpad(extract(hour from ${LOCAL_TS})::int::text, 2, '0')`, label: `lpad(extract(hour from ${LOCAL_TS})::int::text, 2, '0')`, values: "hour" },
  STORE: { key: "g.store_id::text", label: "g.store_name", values: "uuid" },
  CHANNEL: { key: "o.order_channel", label: "o.order_channel" },
  FULFILLMENT: { key: "o.fulfillment_type", label: "o.fulfillment_type" },
  ORDER_STATUS: { key: "o.status", label: "o.status" },
  PAYMENT_METHOD: { key: "g.method", label: "g.method", payment: true },
  CATEGORY: { key: "c.id::text", label: "c.name", item: true, values: "uuid" },
  PRODUCT: { key: "pr.id::text", label: "pr.name", item: true, values: "uuid" },
  BRAND: { key: "coalesce(nullif(btrim(pr.brand), ''), 'Sin marca')", label: "coalesce(nullif(btrim(pr.brand), ''), 'Sin marca')", item: true },
  SIZE: { key: "coalesce(nullif(btrim(pv.size), ''), 'Sin talla')", label: "coalesce(nullif(btrim(pv.size), ''), 'Sin talla')", item: true },
  COLOR: { key: "coalesce(nullif(btrim(pv.color), ''), 'Sin color')", label: "coalesce(nullif(btrim(pv.color), ''), 'Sin color')", item: true },
  CUSTOMER: {
    key: "o.customer_id::text",
    label: "coalesce(nullif(btrim(concat_ws(' ', cu.first_name, cu.last_name)), ''), cu.email, 'Cliente')",
    customer: true, values: "uuid",
  },
};

export interface MeasureSql {
  /** Expresión agregada (sin redondear). */
  expr: string;
  item?: boolean;
  orderEvents?: boolean;
  sales?: boolean;
  inventory?: boolean;
  firstPurchase?: boolean;
  decimals: 0 | 2;
}

const GROSS = "coalesce(sum(g.amount * g.share) filter (where g.kind = 'SALE'), 0)";
const REFUNDS = "coalesce(sum(g.amount * g.share) filter (where g.kind = 'REFUND'), 0)";
const PAID_ORDERS = "count(distinct g.order_id) filter (where g.kind = 'SALE')";

/**
 * Medidas. Venta bruta/neta y reembolsos salen de los eventos de `paymentEventsSql` (la misma
 * fuente del resumen); con dimensiones de producto, el importe de cada pago se reparte entre los
 * ítems del pedido en proporción a su subtotal, de modo que los totales no cambian.
 */
export const MEASURE_SQL: Record<ReportMeasureId, MeasureSql> = {
  GROSS_SALES: { expr: GROSS, sales: true, decimals: 2 },
  REFUNDS: { expr: REFUNDS, sales: true, decimals: 2 },
  NET_SALES: { expr: `(${GROSS} - ${REFUNDS})`, sales: true, decimals: 2 },
  DISCOUNT: { expr: "coalesce(sum(coalesce(o.discount_amount, 0) * g.share) filter (where g.kind = 'SALE' and g.rn_any = 1), 0)", sales: true, decimals: 2 },
  ORDERS: { expr: PAID_ORDERS, sales: true, decimals: 0 },
  UNITS: { expr: "coalesce(sum(g.quantity) filter (where g.kind = 'SALE' and g.pay_status = 'PAID' and g.rn_status = 1), 0)", sales: true, item: true, decimals: 0 },
  AVERAGE_TICKET: { expr: `coalesce(${GROSS} / nullif(${PAID_ORDERS}, 0), 0)`, sales: true, decimals: 2 },
  CANCELLATION_RATE: {
    expr: "coalesce(100.0 * count(distinct g.order_id) filter (where g.kind = 'CANCELLED') / nullif(count(distinct g.order_id) filter (where g.kind = 'CREATED'), 0), 0)",
    orderEvents: true, decimals: 2,
  },
  UNIQUE_CUSTOMERS: { expr: "count(distinct o.customer_id) filter (where g.kind = 'SALE')", sales: true, decimals: 0 },
  NEW_CUSTOMERS: { expr: "count(distinct o.customer_id) filter (where g.kind = 'SALE' and fp.first_paid >= {START})", sales: true, firstPurchase: true, decimals: 0 },
  RETURNING_CUSTOMERS: { expr: "count(distinct o.customer_id) filter (where g.kind = 'SALE' and fp.first_paid < {START})", sales: true, firstPurchase: true, decimals: 0 },
  INVENTORY_VALUE: { expr: "coalesce(sum(g.stock_value) filter (where g.kind = 'STOCK'), 0)", inventory: true, decimals: 2 },
};

export const dimensionMeta = (id: ReportDimensionId) => REPORT_DIMENSIONS.find((dimension) => dimension.id === id)!;
export const measureMeta = (id: ReportMeasureId) => REPORT_MEASURES.find((measure) => measure.id === id)!;

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ENUM_LABELS: Partial<Record<ReportDimensionId, Record<string, string>>> = {
  CHANNEL: { ECOMMERCE: "Tienda online", POS: "Punto de venta" },
  FULFILLMENT: { DELIVERY: "Delivery", PICKUP: "Retiro en tienda", IN_STORE: "Venta en tienda" },
  ORDER_STATUS: { RESERVED: "Reservado", FULFILLED: "Completado", CANCELLED: "Cancelado" },
  PAYMENT_METHOD: { CASH: "Efectivo", CARD: "Tarjeta", QR: "QR", COD: "Contra entrega", WEB: "Pago web" },
};

/** Valor nulo de una dimensión (pedido sin cliente, evento sin método de pago, etc.). */
export const EMPTY_KEY = "∅";

/** Etiqueta legible en español para la clave/etiqueta cruda de una dimensión. */
export function dimensionLabel(id: ReportDimensionId, key: string, raw: string | null): string {
  if (key === EMPTY_KEY) return id === "CUSTOMER" ? "Sin cliente" : id === "PAYMENT_METHOD" ? "Sin pago" : "Sin dato";
  const mapped = ENUM_LABELS[id]?.[key];
  if (mapped) return mapped;
  switch (id) {
    case "DATE_DAY": return `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
    case "DATE_WEEK": return `Semana del ${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
    case "DATE_MONTH": return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
    case "DATE_QUARTER": return `${key.slice(5)} ${key.slice(0, 4)}`;
    case "WEEKDAY": return WEEKDAYS[Number(key) - 1] ?? key;
    case "HOUR": return `${key}:00`;
    default: return raw ?? key;
  }
}

export const enumOptions = (id: ReportDimensionId) => Object.entries(ENUM_LABELS[id] ?? {}).map(([value, label]) => ({ value, label }));
export const weekdayOptions = () => WEEKDAYS.map((label, index) => ({ value: String(index + 1), label }));
export const hourOptions = () => Array.from({ length: 24 }, (_, hour) => ({ value: String(hour).padStart(2, "0"), label: `${String(hour).padStart(2, "0")}:00` }));
