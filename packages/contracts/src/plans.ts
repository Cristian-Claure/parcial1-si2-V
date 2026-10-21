import { z } from "zod";
import { dbIdSchema } from "./shared.js";

export const planCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,19}$/);
export type PlanCode = z.infer<typeof planCodeSchema>;

export const reportTierSchema = z.enum(["BASIC", "STANDARD", "ADVANCED"]);
export type ReportTier = z.infer<typeof reportTierSchema>;

export const REPORT_TIER_ORDER: Record<ReportTier, number> = { BASIC: 1, STANDARD: 2, ADVANCED: 3 };

export function reportTierAllows(current: ReportTier, required: ReportTier): boolean {
  return REPORT_TIER_ORDER[current] >= REPORT_TIER_ORDER[required];
}

export const brandingTierSchema = z.enum(["BASIC", "FULL_PALETTE", "FULL"]);
export type BrandingTier = z.infer<typeof brandingTierSchema>;

export const loyaltyDiscountsSchema = z.object({
  basis: z.literal("FULFILLED_AMOUNT"),
  windowDays: z.number().int().positive(),
  tiers: z.array(z.object({
    minAmount: z.number().nonnegative(),
    percent: z.number().positive().max(100),
  })).min(1),
});
export type LoyaltyDiscounts = z.infer<typeof loyaltyDiscountsSchema>;

export const planSchema = z.object({
  id: dbIdSchema,
  code: planCodeSchema,
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  priceMonthly: z.number().nonnegative(),
  currency: z.string().length(3),
  trialDays: z.number().int().nonnegative(),
  limits: z.object({
    maxCompanies: z.number().int().nullable(),
    maxStoresPerCompany: z.number().int().nullable(),
    maxProductsPerCompany: z.number().int().nullable(),
    tryOnMonthlyPerCustomer: z.number().int().nullable(),
  }),
  brandingTier: brandingTierSchema,
  reports: z.object({
    tier: reportTierSchema,
    historyDays: z.number().int().nullable(),
    canExport: z.boolean(),
    canDynamicReports: z.boolean(),
    canMlDashboards: z.boolean(),
    canAiNarrative: z.boolean(),
    canVoiceReports: z.boolean(),
    canPeriodComparison: z.boolean(),
    canStoreFilter: z.boolean(),
  }),
  loyaltyDiscounts: loyaltyDiscountsSchema.nullable(),
});
export type Plan = z.infer<typeof planSchema>;

export const subscriptionStatusSchema = z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED"]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionSchema = z.object({
  id: dbIdSchema,
  ownerUserId: dbIdSchema,
  companyId: dbIdSchema.nullable(),
  planCode: planCodeSchema,
  status: subscriptionStatusSchema,
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string().nullable(),
  grandfathered: z.boolean(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const planUsageSchema = z.object({
  companies: z.number().int(),
  storesByCompany: z.array(z.object({ companyId: dbIdSchema, companyName: z.string(), stores: z.number().int(), products: z.number().int() })),
});
export type PlanUsage = z.infer<typeof planUsageSchema>;

/** Plan efectivo: si la suscripción no está vigente aplican los límites de FREE. */
export const adminPlanResponseSchema = z.object({
  subscription: subscriptionSchema.nullable(),
  subscribedPlan: planSchema.nullable(),
  effectivePlan: planSchema,
  restricted: z.boolean(),
  usage: planUsageSchema,
});
export type AdminPlanResponse = z.infer<typeof adminPlanResponseSchema>;

export const changePlanRequestSchema = z.object({ planCode: planCodeSchema });
export type ChangePlanRequest = z.infer<typeof changePlanRequestSchema>;

export const planLimitErrorCodeSchema = z.enum([
  "PLAN_LIMIT_COMPANIES",
  "PLAN_LIMIT_STORES",
  "PLAN_LIMIT_PRODUCTS",
  "PLAN_LIMIT_TRY_ON",
  "PLAN_LIMIT_BRANDING",
  "PLAN_LIMIT_REPORT_FEATURE",
  "PLAN_LIMIT_REPORT_HISTORY",
  "PLAN_DOWNGRADE_EXCEEDS",
  "SUBSCRIPTION_INACTIVE",
  "PAYMENT_REQUIRED",
  "PAYMENT_DECLINED",
]);
export type PlanLimitErrorCode = z.infer<typeof planLimitErrorCodeSchema>;

export const planLimitErrorDetailsSchema = z.object({
  limit: z.number().int().nullable().optional(),
  used: z.number().int().optional(),
  requiredPlan: planCodeSchema.nullable().optional(),
  feature: z.string().optional(),
  excess: z.array(z.object({ resource: z.string(), limit: z.number().int(), used: z.number().int(), companyId: dbIdSchema.optional() })).optional(),
});
export type PlanLimitErrorDetails = z.infer<typeof planLimitErrorDetailsSchema>;
