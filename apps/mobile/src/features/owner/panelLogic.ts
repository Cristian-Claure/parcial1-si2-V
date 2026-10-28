import { formatMoney, formatNumberBo, type OperationalOrderListItem, type ProductRequest, type ProductResponse, type ReportChart, type ReportKpi, type ReportLockedWidget, type VariantRequest, type VariantResponse } from "@velora/contracts";

/**
 * Lógica pura del panel móvil (propietario y encargado). Las acciones disponibles replican las de
 * la web; el backend vuelve a validar estado y alcance en cada una.
 */

/** PUT /catalog/manage/products/:id exige el producto completo: se reconstruye desde la respuesta. */
export function productUpdateBody(product: ProductResponse, status: "ACTIVE" | "INACTIVE"): ProductRequest {
  return {
    companyId: product.companyId,
    categoryId: product.categoryId,
    name: product.name,
    slug: product.slug,
    description: product.description,
    brand: product.brand,
    composition: product.composition,
    careInstructions: product.careInstructions,
    fitNotes: product.fitNotes,
    status,
    tryOnEnabled: product.tryOnEnabled,
    tryOnCategory: product.tryOnCategory,
  };
}

/** PUT /catalog/manage/variants/:id: solo cambia el precio; el resto se conserva. */
export function variantPriceBody(variant: VariantResponse, price: number): VariantRequest {
  return {
    sku: variant.sku,
    barcode: variant.barcode,
    size: variant.size,
    color: variant.color,
    colorHex: variant.colorHex,
    price,
    compareAtPrice: variant.compareAtPrice,
    currency: variant.currency,
    active: variant.active,
  };
}

/** Acepta "1.234,50", "1234,5" o "1234.50". Devuelve null si no es un precio válido (> 0). */
export function parsePrice(text: string): number | null {
  const clean = text.trim().replace(/\s|Bs/gi, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value > 0 ? value : null;
}

/** Fecha aaaa-mm-dd en La Paz (UTC−4, sin horario de verano). */
export function laPazDate(now: Date): string {
  return new Date(now.getTime() - 4 * 3_600_000).toISOString().slice(0, 10);
}

/** Rango de N días que termina hoy (inclusive), en fechas de La Paz. */
export function rangeFor(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = laPazDate(now);
  const from = laPazDate(new Date(now.getTime() - (days - 1) * 86_400_000));
  return { from, to };
}

export function formatKpiValue(kpi: Pick<ReportKpi, "value" | "format">): string {
  if (kpi.format === "CURRENCY") return formatMoney(kpi.value);
  if (kpi.format === "PERCENT") return `${formatNumberBo(kpi.value, 1)} %`;
  return formatNumberBo(kpi.value, 0);
}

/** "▲ 12,5 % vs. periodo anterior" o null si no hay comparación (FREE). */
export function formatChange(changePct: number | null | undefined): { text: string; trend: "up" | "down" | "flat" } | null {
  if (changePct === null || changePct === undefined || !Number.isFinite(changePct)) return null;
  const trend = changePct > 0.05 ? "up" : changePct < -0.05 ? "down" : "flat";
  const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "＝";
  return { text: `${arrow} ${formatNumberBo(Math.abs(changePct), 1)} % vs. periodo anterior`, trend };
}

/** Barras de la primera serie de un gráfico, con alto relativo al máximo (0..1). */
export function chartBars(chart: Pick<ReportChart, "categories" | "series">): { label: string; value: number; ratio: number }[] {
  const data = chart.series[0]?.data ?? [];
  const max = Math.max(0, ...data);
  return chart.categories.map((label, index) => {
    const value = data[index] ?? 0;
    return { label, value, ratio: max > 0 ? Math.max(0, value) / max : 0 };
  });
}

export function lockedLabel(widget: Pick<ReportLockedWidget, "requiredPlan" | "minTier">): string {
  const plan = widget.requiredPlan ?? (widget.minTier === "ADVANCED" ? "MAX" : "PLUS");
  return plan === "PLUS" ? "Disponible en PLUS/MAX" : `Disponible en ${plan}`;
}

export interface OrderActions {
  /** Pago pendiente (no Stripe) que se puede confirmar o marcar fallido. */
  pendingPaymentId: string | null;
  /** Pedido pagado y reservado: se puede entregar o reembolsar. */
  canFulfill: boolean;
  refundPaymentId: string | null;
}

/** Las mismas reglas que la web (OperationalOrdersPage). */
export function orderActions(order: Pick<OperationalOrderListItem, "status" | "payments">): OrderActions {
  const latest = order.payments[0] ?? null;
  const paid = order.payments.find((payment) => payment.status === "PAID") ?? null;
  const reservedAndPaid = Boolean(paid && order.status === "RESERVED");
  return {
    pendingPaymentId: latest?.status === "PENDING" && latest.provider !== "STRIPE" ? latest.id : null,
    canFulfill: reservedAndPaid,
    refundPaymentId: reservedAndPaid ? paid!.id : null,
  };
}
