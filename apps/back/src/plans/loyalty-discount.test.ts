import { describe, expect, it } from "vitest";
import { applyLoyaltyDiscount } from "./loyalty-discount.js";

const policy = { basis: "FULFILLED_AMOUNT" as const, windowDays: 365, tiers: [{ minAmount: 1500, percent: 5 }, { minAmount: 4000, percent: 10 }, { minAmount: 8000, percent: 15 }] };

describe("applyLoyaltyDiscount", () => {
  it("aplica el escalón más alto alcanzado", () => {
    expect(applyLoyaltyDiscount(policy, 1499.99, 200).amount).toBe(0);
    expect(applyLoyaltyDiscount(policy, 1500, 200)).toMatchObject({ amount: 10, percent: 5 });
    expect(applyLoyaltyDiscount(policy, 4000, 200)).toMatchObject({ amount: 20, percent: 10 });
    expect(applyLoyaltyDiscount(policy, 9000, 333.33)).toMatchObject({ amount: 50, percent: 15 });
  });

  it("sin política (plan sin descuentos) o subtotal 0 no descuenta", () => {
    expect(applyLoyaltyDiscount(null, 10_000, 200)).toMatchObject({ amount: 0, reason: null });
    expect(applyLoyaltyDiscount(policy, 10_000, 0).amount).toBe(0);
  });

  it("el motivo cabe en orders.discount_reason (120)", () => {
    expect(applyLoyaltyDiscount(policy, 9000, 100).reason!.length).toBeLessThanOrEqual(120);
  });
});
