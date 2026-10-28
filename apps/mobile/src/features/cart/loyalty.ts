import type { LoyaltyDiscounts, OrderResponse } from "@velora/contracts";

export interface LoyaltyEstimate {
  /** Monto entregado (FULFILLED) del cliente en la tienda dentro de la ventana del plan. */
  fulfilledAmount: number;
  percent: number;
  amount: number;
  /** Siguiente escalón: cuánto falta comprar para subir de porcentaje. */
  next: { percent: number; missing: number } | null;
}

/**
 * Estimación del descuento por compras (tiendas MAX) para mostrar en bolsa y checkout. El monto
 * real lo calcula el backend al confirmar el pedido (PlanLimitsService.loyaltyDiscount) y queda
 * en `discountAmount`; esto solo anticipa la misma regla con los pedidos del propio cliente.
 */
export function estimateLoyaltyDiscount(
  rules: LoyaltyDiscounts | null | undefined,
  orders: readonly Pick<OrderResponse, "status" | "total" | "storeId" | "fulfilledAt" | "createdAt">[],
  storeIds: ReadonlySet<string>,
  subtotal: number,
  now: Date = new Date(),
): LoyaltyEstimate | null {
  if (!rules || rules.tiers.length === 0) return null;
  const since = now.getTime() - rules.windowDays * 86_400_000;
  const fulfilledAmount = orders
    .filter((order) => order.status === "FULFILLED" && storeIds.has(order.storeId) && new Date(order.fulfilledAt ?? order.createdAt).getTime() >= since)
    .reduce((sum, order) => sum + order.total, 0);
  const tiers = [...rules.tiers].sort((a, b) => a.minAmount - b.minAmount);
  const reached = tiers.filter((tier) => fulfilledAmount >= tier.minAmount).at(-1) ?? null;
  const upcoming = tiers.find((tier) => fulfilledAmount < tier.minAmount) ?? null;
  const percent = reached?.percent ?? 0;
  return {
    fulfilledAmount: Math.round(fulfilledAmount * 100) / 100,
    percent,
    amount: Math.min(Math.round(subtotal * percent) / 100, subtotal),
    next: upcoming ? { percent: upcoming.percent, missing: Math.round((upcoming.minAmount - fulfilledAmount) * 100) / 100 } : null,
  };
}
