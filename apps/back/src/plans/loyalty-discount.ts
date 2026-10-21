import type { LoyaltyDiscounts } from "@velora/contracts";

export interface AppliedDiscount {
  amount: number;
  percent: number;
  reason: string | null;
}

export const NO_DISCOUNT: AppliedDiscount = { amount: 0, percent: 0, reason: null };

/** Resuelve el descuento de una orden; lo calcula PlanLimitsService y lo aplica el repositorio en su transacción. */
export type DiscountResolver = (input: { companyId: string; customerId: string | null; subtotal: number }) => Promise<AppliedDiscount>;

export const noDiscountResolver: DiscountResolver = async () => NO_DISCOUNT;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Escalón más alto alcanzado por el monto de compras entregadas del cliente en la ventana del plan.
 * Los escalones vienen del seed del plan (nada hardcodeado aquí).
 */
export function applyLoyaltyDiscount(policy: LoyaltyDiscounts | null, fulfilledAmount: number, subtotal: number, currency = "BOB"): AppliedDiscount {
  if (!policy || subtotal <= 0) return NO_DISCOUNT;
  const tier = [...policy.tiers].sort((a, b) => b.minAmount - a.minAmount).find((candidate) => fulfilledAmount >= candidate.minAmount);
  if (!tier) return NO_DISCOUNT;
  const amount = Math.min(roundMoney((subtotal * tier.percent) / 100), subtotal);
  if (amount <= 0) return NO_DISCOUNT;
  return {
    amount,
    percent: tier.percent,
    reason: `Fidelidad ${tier.percent}%: compras entregadas >= ${tier.minAmount} ${currency} en ${policy.windowDays} días`.slice(0, 120),
  };
}
