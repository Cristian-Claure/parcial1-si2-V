import { Injectable } from "@nestjs/common";
import type { PlanRow, SubscriptionRow } from "@velora/database";
import {
  loyaltyDiscountsSchema, type AdminPlanResponse, type BrandingTier, type Plan, type PlanLimitErrorCode, type ReportPolicy, type ReportTier, type Subscription,
} from "@velora/contracts";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { applyLoyaltyDiscount, NO_DISCOUNT, type DiscountResolver } from "./loyalty-discount.js";
import { PlansRepository } from "./plans.repository.js";

/** Duración del periodo de una suscripción pagada (DEMO hasta la Fase 5). */
export const SUBSCRIPTION_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResolvedPlan {
  ownerUserId: string | null;
  subscription: SubscriptionRow | null;
  subscribedPlan: PlanRow | null;
  /** Plan cuyos límites se aplican: el suscrito si está vigente; si no, el plan base (FREE). */
  effective: PlanRow;
  /** Suscripción vencida o cancelada: límites del plan base y se bloquea CREAR. */
  restricted: boolean;
}

export type ReportFeature = "AI_NARRATIVE" | "VOICE" | "STORE_FILTER" | "EXPORT" | "DYNAMIC_REPORTS" | "ML_DASHBOARDS" | "PERIOD_COMPARISON";

const FEATURE_FLAG: Record<ReportFeature, keyof PlanRow> = {
  AI_NARRATIVE: "canAiNarrative",
  VOICE: "canVoiceReports",
  STORE_FILTER: "canStoreFilter",
  EXPORT: "canExport",
  DYNAMIC_REPORTS: "canDynamicReports",
  ML_DASHBOARDS: "canMlDashboards",
  PERIOD_COMPARISON: "canPeriodComparison",
};

const FEATURE_LABEL: Record<ReportFeature, string> = {
  AI_NARRATIVE: "la narración y consultas con IA",
  VOICE: "los reportes por voz",
  STORE_FILTER: "el filtro por sucursal",
  EXPORT: "la exportación de reportes",
  DYNAMIC_REPORTS: "el constructor de reportes",
  ML_DASHBOARDS: "los dashboards de ML",
  PERIOD_COMPARISON: "la comparación de periodos",
};

const REPORT_TIER_RANK: Record<ReportTier, number> = { BASIC: 1, STANDARD: 2, ADVANCED: 3 };

export function toPlanContract(row: PlanRow): Plan {
  const discounts = loyaltyDiscountsSchema.safeParse(row.loyaltyDiscounts);
  return {
    id: row.id, code: row.code, name: row.name, description: row.description, sortOrder: row.sortOrder,
    priceMonthly: Number(row.priceMonthly), currency: row.currency, trialDays: row.trialDays,
    limits: {
      maxCompanies: row.maxCompanies, maxStoresPerCompany: row.maxStoresPerCompany,
      maxProductsPerCompany: row.maxProductsPerCompany, tryOnMonthlyPerCustomer: row.tryOnMonthlyPerCustomer,
    },
    brandingTier: row.brandingTier,
    reports: {
      tier: row.reportTier, historyDays: row.reportHistoryDays, canExport: row.canExport, canDynamicReports: row.canDynamicReports,
      canMlDashboards: row.canMlDashboards, canAiNarrative: row.canAiNarrative, canVoiceReports: row.canVoiceReports,
      canPeriodComparison: row.canPeriodComparison, canStoreFilter: row.canStoreFilter,
    },
    loyaltyDiscounts: discounts.success ? discounts.data : null,
  };
}

function toSubscriptionContract(row: SubscriptionRow, planCode: string): Subscription {
  return {
    id: row.id, ownerUserId: row.ownerUserId, companyId: row.companyId, planCode, status: row.status,
    currentPeriodStart: row.currentPeriodStart.toISOString(),
    currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
    grandfathered: row.grandfathered,
  };
}

@Injectable()
export class PlanLimitsService {
  constructor(private readonly plans: PlansRepository) {}

  // -------------------------------------------------------------------------
  // Resolución del plan
  // -------------------------------------------------------------------------

  /** Plan base (el de menor orden): se aplica sin suscripción vigente. */
  async basePlan(): Promise<PlanRow> {
    const [base] = await this.plans.listActivePlans();
    if (!base) throw new ApiHttpError(500, "No hay planes configurados (ejecute las migraciones V28+).");
    return base;
  }

  async resolveForOwner(ownerUserId: string, companyId: string | null = null): Promise<ResolvedPlan> {
    const now = new Date();
    let subscription = await this.plans.currentSubscription(ownerUserId, companyId);
    if (subscription && (subscription.status === "ACTIVE" || subscription.status === "TRIAL")
      && subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() <= now.getTime()) {
      await this.plans.markPastDue(subscription.id, now);
      subscription = { ...subscription, status: "PAST_DUE", updatedAt: now };
    }
    const subscribedPlan = subscription ? await this.plans.planById(subscription.planId) : null;
    const current = subscription !== null && (subscription.status === "ACTIVE" || subscription.status === "TRIAL");
    const effective = current && subscribedPlan ? subscribedPlan : await this.basePlan();
    return { ownerUserId, subscription, subscribedPlan, effective, restricted: subscription !== null && !current };
  }

  /** Compañía sin propietario (solo visible para PLATFORM_ADMIN): plan base. */
  async resolveForCompany(companyId: string): Promise<ResolvedPlan> {
    const owner = await this.plans.companyOwner(companyId);
    if (!owner) return { ownerUserId: null, subscription: null, subscribedPlan: null, effective: await this.basePlan(), restricted: false };
    return this.resolveForOwner(owner, companyId);
  }

  /** Primer plan (por orden) que cumple la condición; para "Disponible en PLUS/MAX". */
  async requiredPlanFor(predicate: (plan: PlanRow) => boolean): Promise<string | null> {
    return (await this.plans.listActivePlans()).find(predicate)?.code ?? null;
  }

  // -------------------------------------------------------------------------
  // Límites de creación
  // -------------------------------------------------------------------------

  async assertCanCreateCompany(ownerUserId: string): Promise<void> {
    const plan = await this.resolveForOwner(ownerUserId);
    this.assertNotRestricted(plan);
    const used = (await this.plans.ownedCompanies(ownerUserId)).length;
    await this.assertWithin(plan, "PLAN_LIMIT_COMPANIES", plan.effective.maxCompanies, used, (limit) => `tu plan ${plan.effective.name} permite ${limit} tienda(s)`, (candidate) => candidate.maxCompanies);
  }

  async assertCanCreateStore(companyId: string): Promise<void> {
    const plan = await this.resolveForCompany(companyId);
    this.assertNotRestricted(plan);
    const used = await this.plans.activeStoreCount(companyId);
    await this.assertWithin(plan, "PLAN_LIMIT_STORES", plan.effective.maxStoresPerCompany, used, (limit) => `tu plan ${plan.effective.name} permite ${limit} sucursal(es) por tienda`, (candidate) => candidate.maxStoresPerCompany);
  }

  async assertCanCreateProduct(companyId: string): Promise<void> {
    const plan = await this.resolveForCompany(companyId);
    this.assertNotRestricted(plan);
    const used = await this.plans.productCount(companyId);
    await this.assertWithin(plan, "PLAN_LIMIT_PRODUCTS", plan.effective.maxProductsPerCompany, used, (limit) => `tu plan ${plan.effective.name} permite ${limit} productos por tienda`, (candidate) => candidate.maxProductsPerCompany);
  }

  /** Cuota del probador por cliente, compañía y mes calendario. No es "crear" del propietario: aplica aunque esté vencido (con límites base). */
  async assertTryOnQuota(customerId: string, companyId: string): Promise<void> {
    const plan = await this.resolveForCompany(companyId);
    const used = await this.plans.tryOnUsesThisMonth(customerId, companyId);
    const limit = plan.effective.tryOnMonthlyPerCustomer;
    if (limit === null || used < limit) return;
    throw ApiHttpError.coded(402, "PLAN_LIMIT_TRY_ON", `Alcanzaste tus ${limit} pruebas del probador de este mes en esta tienda.`, {
      limit, used, requiredPlan: await this.nextPlanAbove(plan.effective, (candidate) => candidate.tryOnMonthlyPerCustomer),
    });
  }

  async brandingTier(companyId: string): Promise<BrandingTier> {
    return (await this.resolveForCompany(companyId)).effective.brandingTier;
  }

  // -------------------------------------------------------------------------
  // Reportes
  // -------------------------------------------------------------------------

  async reportPolicy(companyId: string): Promise<Omit<ReportPolicy, "clamped">> {
    const plan = (await this.resolveForCompany(companyId)).effective;
    return {
      tier: plan.reportTier, historyDays: plan.reportHistoryDays, canExport: plan.canExport, canDynamicReports: plan.canDynamicReports,
      canMlDashboards: plan.canMlDashboards, canAiNarrative: plan.canAiNarrative, canVoiceReports: plan.canVoiceReports,
      canPeriodComparison: plan.canPeriodComparison, canStoreFilter: plan.canStoreFilter,
    };
  }

  requiredPlanForTier(tier: ReportTier): Promise<string | null> {
    return this.requiredPlanFor((plan) => REPORT_TIER_RANK[plan.reportTier] >= REPORT_TIER_RANK[tier]);
  }

  /** `status`: 402 histórico (IA, voz, filtros); el constructor y la exportación responden 403. */
  async assertReportFeature(companyId: string, feature: ReportFeature, status: 402 | 403 = 402): Promise<void> {
    const plan = (await this.resolveForCompany(companyId)).effective;
    if (plan[FEATURE_FLAG[feature]] === true) return;
    const requiredPlan = await this.requiredPlanFor((candidate) => candidate[FEATURE_FLAG[feature]] === true);
    throw ApiHttpError.coded(status, "PLAN_LIMIT_REPORT_FEATURE", `Tu plan ${plan.name} no incluye ${FEATURE_LABEL[feature]}.${requiredPlan ? ` Disponible en ${requiredPlan}.` : ""}`, { feature, requiredPlan });
  }

  // -------------------------------------------------------------------------
  // Descuento automático por compras (MAX)
  // -------------------------------------------------------------------------

  readonly discountResolver: DiscountResolver = async ({ companyId, customerId, subtotal }) => {
    if (!customerId) return NO_DISCOUNT;
    const plan = (await this.resolveForCompany(companyId)).effective;
    const policy = loyaltyDiscountsSchema.safeParse(plan.loyaltyDiscounts);
    if (!policy.success) return NO_DISCOUNT;
    const fulfilled = await this.plans.fulfilledAmount(customerId, companyId, policy.data.windowDays);
    return applyLoyaltyDiscount(policy.data, fulfilled, subtotal);
  };

  // -------------------------------------------------------------------------
  // "Mi plan" y cambio de plan
  // -------------------------------------------------------------------------

  async listPlans(): Promise<Plan[]> {
    return (await this.plans.listActivePlans()).map(toPlanContract);
  }

  async adminPlan(ownerUserId: string): Promise<AdminPlanResponse> {
    const plan = await this.resolveForOwner(ownerUserId);
    return {
      subscription: plan.subscription && plan.subscribedPlan ? toSubscriptionContract(plan.subscription, plan.subscribedPlan.code) : null,
      subscribedPlan: plan.subscribedPlan ? toPlanContract(plan.subscribedPlan) : null,
      effectivePlan: toPlanContract(plan.effective),
      restricted: plan.restricted,
      usage: await this.usage(ownerUserId),
    };
  }

  /**
   * Upgrade inmediato (nuevo periodo). Downgrade solo si el uso actual cabe en el plan
   * destino; si no, 409 PLAN_DOWNGRADE_EXCEEDS con los excedentes (D2). El cobro DEMO llega en el bloque 4.
   */
  async changePlan(ownerUserId: string, planCode: string): Promise<AdminPlanResponse> {
    const target = await this.validatePlanChange(ownerUserId, planCode);
    const now = new Date();
    await this.plans.changeOwnerPlan({ ownerUserId, planId: target.id, status: "ACTIVE", periodStart: now, periodEnd: this.periodEndFor(target, now) });
    return this.adminPlan(ownerUserId);
  }

  /** Fin del periodo pagado (null = sin vencimiento para planes gratuitos). */
  periodEndFor(plan: PlanRow, start: Date): Date | null {
    return Number(plan.priceMonthly) > 0 ? new Date(start.getTime() + SUBSCRIPTION_PERIOD_DAYS * DAY_MS) : null;
  }

  /**
   * Reglas del cambio de plan (sin cobrar). Se permite "cambiar" al mismo plan si está en
   * TRIAL (activar) o vencido (renovar). Downgrade solo si el uso cabe en el destino (D2).
   */
  async validatePlanChange(ownerUserId: string, planCode: string): Promise<PlanRow> {
    const target = await this.plans.planByCode(planCode);
    if (!target || !target.active) throw new ApiHttpError(404, "Plan no encontrado.");
    const current = await this.resolveForOwner(ownerUserId);
    if (current.subscribedPlan?.id === target.id && !current.restricted && current.subscription?.status === "ACTIVE") {
      throw new ApiHttpError(409, `Ya tienes el plan ${target.name}.`);
    }

    const usage = await this.usage(ownerUserId);
    const excess: { resource: string; limit: number; used: number; companyId?: string }[] = [];
    if (target.maxCompanies !== null && usage.companies > target.maxCompanies) excess.push({ resource: "companies", limit: target.maxCompanies, used: usage.companies });
    for (const company of usage.storesByCompany) {
      if (target.maxStoresPerCompany !== null && company.stores > target.maxStoresPerCompany) excess.push({ resource: "stores", limit: target.maxStoresPerCompany, used: company.stores, companyId: company.companyId });
      if (target.maxProductsPerCompany !== null && company.products > target.maxProductsPerCompany) excess.push({ resource: "products", limit: target.maxProductsPerCompany, used: company.products, companyId: company.companyId });
    }
    if (excess.length > 0) {
      throw ApiHttpError.coded(409, "PLAN_DOWNGRADE_EXCEEDS", `Tu uso actual excede los límites del plan ${target.name}. Reduce tiendas, sucursales o productos antes de cambiar.`, { excess });
    }
    return target;
  }

  // -------------------------------------------------------------------------

  private async usage(ownerUserId: string): Promise<AdminPlanResponse["usage"]> {
    const owned = await this.plans.ownedCompanies(ownerUserId);
    const storesByCompany = await Promise.all(owned.map(async (company) => ({
      companyId: company.id, companyName: company.name,
      stores: await this.plans.activeStoreCount(company.id), products: await this.plans.productCount(company.id),
    })));
    return { companies: owned.length, storesByCompany };
  }

  private assertNotRestricted(plan: ResolvedPlan): void {
    if (!plan.restricted) return;
    throw ApiHttpError.coded(402, "SUBSCRIPTION_INACTIVE", "Tu suscripción no está vigente: aplican los límites del plan base y no puedes crear nuevos recursos. Renueva o mejora tu plan.", {
      status: plan.subscription?.status ?? null,
    });
  }

  private async assertWithin(
    plan: ResolvedPlan,
    code: PlanLimitErrorCode,
    limit: number | null,
    used: number,
    describe: (limit: number) => string,
    limitOf: (candidate: PlanRow) => number | null,
  ): Promise<void> {
    if (limit === null || used < limit) return;
    const requiredPlan = await this.nextPlanAbove(plan.effective, limitOf);
    throw ApiHttpError.coded(402, code, `Límite alcanzado: ${describe(limit)}.${requiredPlan ? ` Mejora a ${requiredPlan} para crear más.` : ""}`, { limit, used, requiredPlan });
  }

  /** Siguiente plan (por orden) con un límite mayor (o ilimitado) que el actual. */
  private nextPlanAbove(current: PlanRow, limitOf: (candidate: PlanRow) => number | null): Promise<string | null> {
    const currentLimit = limitOf(current);
    return this.requiredPlanFor((candidate) => candidate.sortOrder > current.sortOrder
      && (limitOf(candidate) === null || (currentLimit !== null && (limitOf(candidate) ?? 0) > currentLimit)));
  }
}
