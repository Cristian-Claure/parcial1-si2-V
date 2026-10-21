import type { Plan } from "@velora/contracts";

export const limitLabel = (value: number | null, unit = ""): string => value === null ? "Ilimitado" : `${value}${unit}`;

const BRANDING_LABEL: Record<Plan["brandingTier"], string> = {
  BASIC: "Nombre, logo y 1 color",
  FULL_PALETTE: "Paleta completa",
  FULL: "Marca completa (banner, tagline y redes)",
};

const TIER_LABEL: Record<Plan["reports"]["tier"], string> = { BASIC: "Básico", STANDARD: "Estándar", ADVANCED: "Avanzado" };

const yes = (value: boolean) => value ? "Incluido" : "—";

/** Filas de la comparación, construidas solo con datos del plan (nada hardcodeado por plan). */
export const PLAN_ROWS: { label: string; value: (plan: Plan) => string }[] = [
  { label: "Tiendas", value: (plan) => limitLabel(plan.limits.maxCompanies) },
  { label: "Sucursales por tienda", value: (plan) => limitLabel(plan.limits.maxStoresPerCompany) },
  { label: "Productos por tienda", value: (plan) => limitLabel(plan.limits.maxProductsPerCompany) },
  { label: "Probador virtual (por cliente/mes)", value: (plan) => limitLabel(plan.limits.tryOnMonthlyPerCustomer, " usos") },
  { label: "Descuentos automáticos por compras", value: (plan) => plan.loyaltyDiscounts ? plan.loyaltyDiscounts.tiers.map((tier) => `${tier.percent}% desde ${tier.minAmount} ${plan.currency}`).join(" · ") : "—" },
  { label: "Marca de la tienda", value: (plan) => BRANDING_LABEL[plan.brandingTier] },
  { label: "Reportes y dashboard", value: (plan) => TIER_LABEL[plan.reports.tier] },
  { label: "Historial de reportes", value: (plan) => plan.reports.historyDays === null ? "Completo" : plan.reports.historyDays >= 365 ? "12 meses" : `${plan.reports.historyDays} días` },
  { label: "Filtro por sucursal y comparación", value: (plan) => yes(plan.reports.canStoreFilter && plan.reports.canPeriodComparison) },
  { label: "Constructor y exportación Excel/PDF", value: (plan) => yes(plan.reports.canDynamicReports && plan.reports.canExport) },
  { label: "Narración con IA", value: (plan) => yes(plan.reports.canAiNarrative) },
  { label: "Reportes por voz", value: (plan) => yes(plan.reports.canVoiceReports) },
  { label: "Dashboards de ML", value: (plan) => yes(plan.reports.canMlDashboards) },
];

export const priceLabel = (plan: Plan): string => plan.priceMonthly === 0 ? "Gratis" : `${plan.priceMonthly} ${plan.currency}`;

export function planHighlights(plan: Plan): string[] {
  return [
    `${limitLabel(plan.limits.maxCompanies)} tienda(s) · ${limitLabel(plan.limits.maxStoresPerCompany)} sucursal(es) por tienda`,
    `${limitLabel(plan.limits.maxProductsPerCompany)} productos por tienda`,
    `Reportes ${TIER_LABEL[plan.reports.tier].toLowerCase()}`,
    plan.trialDays > 0 ? `${plan.trialDays} días de prueba sin cargo` : "Sin tarjeta para empezar",
  ];
}
