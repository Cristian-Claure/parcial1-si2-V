/**
 * Fase 4C · Formatos es-BO compartidos por la web y el móvil: `Bs 1.234,50` y `dd/mm/aaaa`.
 * Se arma a mano porque el ICU de es-* no agrupa los miles en números de 4 cifras
 * (minimumGroupingDigits = 2) y Hermes (Android) no siempre trae todos los locales.
 */

const CURRENCY_SYMBOLS: Record<string, string> = { BOB: "Bs", USD: "US$", EUR: "€" };

/** 1234.5 → "1.234,50" (o sin decimales con `decimals = 0`). */
export function formatNumberBo(value: number, decimals = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  const negative = safe < 0;
  const [integer = "0", fraction] = Math.abs(safe).toFixed(decimals).split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped}${fraction ? `,${fraction}` : ""}`;
}

/** 1234.5 → "Bs 1.234,50". */
export function formatMoney(value: number, currency = "BOB"): string {
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();
  return `${symbol} ${formatNumberBo(value, 2)}`;
}

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "2026-10-28T14:05:00Z" → "28/10/2026" (hora local). Fechas "aaaa-mm-dd" se leen sin desfase. */
export function formatDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  const date = toDate(value);
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : "—";
}

/** "28/10/2026 14:05". */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = toDate(value);
  return date ? `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}` : "—";
}

/** Estados en español para mostrar (los códigos del backend no cambian). */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  RESERVED: "Reservado",
  PAID: "Pagado",
  FULFILLED: "Entregado",
  CANCELLED: "Cancelado",
  EXPIRED: "Vencido",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PENDING_REVIEW: "En revisión",
  PAID: "Pagado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
  EXPIRED: "Vencido",
  REFUNDED: "Reembolsado",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  COD: "Contra entrega",
  CASH: "Efectivo",
  CARD: "Tarjeta",
  WEB: "Pago en línea",
  QR: "QR",
  TRANSFER: "Transferencia",
  DEMO: "Demo",
};

export const FULFILLMENT_LABELS: Record<string, string> = { PICKUP: "Retiro en sucursal", DELIVERY: "Envío a domicilio", IN_STORE: "Venta en tienda" };

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  ENTRY: "Entrada",
  ADJUSTMENT_IN: "Ajuste (suma)",
  ADJUSTMENT_OUT: "Ajuste (resta)",
  RETURN: "Devolución",
  RESERVE: "Reserva",
  RELEASE: "Liberación",
  SALE: "Venta",
  TRANSFER_IN: "Transferencia (entrada)",
  TRANSFER_OUT: "Transferencia (salida)",
};

/** Etiqueta en español o el código tal cual si no hay traducción. */
export function labelFor(labels: Record<string, string>, code: string | null | undefined): string {
  if (!code) return "—";
  return labels[code] ?? code;
}

/** Semáforo de stock compartido (web y móvil): agotado ≤ 0, bajo ≤ umbral. */
export const LOW_STOCK_THRESHOLD = 5;
export function stockLevel(available: number, threshold = LOW_STOCK_THRESHOLD): "agotado" | "bajo" | "normal" {
  if (available <= 0) return "agotado";
  if (available <= threshold) return "bajo";
  return "normal";
}
