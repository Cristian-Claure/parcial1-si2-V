import { describe, expect, it } from "vitest";
import type { Plan } from "@velora/contracts";
import { limitLabel, PLAN_ROWS, priceLabel } from "../planCopy";
import { slugify } from "../slugTools";

const plan: Plan = {
  id: "20000000-0000-0000-0000-000000000003", code: "MAX", name: "Max", description: null, sortOrder: 3, priceMonthly: 249, currency: "BOB", trialDays: 14,
  limits: { maxCompanies: 5, maxStoresPerCompany: 10, maxProductsPerCompany: null, tryOnMonthlyPerCustomer: null },
  brandingTier: "FULL",
  reports: { tier: "ADVANCED", historyDays: null, canExport: true, canDynamicReports: true, canMlDashboards: true, canAiNarrative: true, canVoiceReports: true, canPeriodComparison: true, canStoreFilter: true },
  loyaltyDiscounts: { basis: "FULFILLED_AMOUNT", windowDays: 365, tiers: [{ minAmount: 1500, percent: 5 }] },
};

describe("helpers SaaS", () => {
  it("slugify produce enlaces válidos desde nombres con acentos", () => {
    expect(slugify("  Bella Moda Ñandú — Santa Cruz ")).toBe("bella-moda-nandu-santa-cruz");
  });
  it("la comparación se construye solo con datos del plan", () => {
    const rows = Object.fromEntries(PLAN_ROWS.map((row) => [row.label, row.value(plan)]));
    expect(rows["Productos por tienda"]).toBe("Ilimitado");
    expect(rows["Historial de reportes"]).toBe("Completo");
    expect(rows["Descuentos automáticos por compras"]).toContain("5% desde 1500 BOB");
    expect(limitLabel(3, " usos")).toBe("3 usos");
    expect(priceLabel(plan)).toBe("249 BOB");
  });
});
