import { z } from "zod";
import { dbIdSchema } from "./shared.js";
import { planCodeSchema, subscriptionStatusSchema } from "./plans.js";

/** Área de plataforma (solo PLATFORM_ADMIN). */
export const transferCompanyOwnerRequestSchema = z.object({
  ownerEmail: z.string().trim().email("Ingrese un correo válido.").max(180),
});
export type TransferCompanyOwnerRequest = z.infer<typeof transferCompanyOwnerRequestSchema>;

export const platformCompanySchema = z.object({
  id: dbIdSchema,
  code: z.string(),
  name: z.string(),
  slug: z.string(),
  active: z.boolean(),
  ownerUserId: dbIdSchema.nullable(),
  ownerEmail: z.string().nullable(),
  stores: z.number().int(),
  products: z.number().int(),
  createdAt: z.string(),
});
export type PlatformCompany = z.infer<typeof platformCompanySchema>;

export const platformOwnerSchema = z.object({
  id: dbIdSchema,
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  status: z.string(),
  companies: z.number().int(),
  planCode: planCodeSchema.nullable(),
  subscriptionStatus: subscriptionStatusSchema.nullable(),
  createdAt: z.string(),
});
export type PlatformOwner = z.infer<typeof platformOwnerSchema>;

export const platformSubscriptionSchema = z.object({
  id: dbIdSchema,
  ownerUserId: dbIdSchema,
  ownerEmail: z.string(),
  companyId: dbIdSchema.nullable(),
  planCode: planCodeSchema,
  status: subscriptionStatusSchema,
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string().nullable(),
  grandfathered: z.boolean(),
  updatedAt: z.string(),
});
export type PlatformSubscription = z.infer<typeof platformSubscriptionSchema>;

/** Cambio de plan de un propietario hecho por la plataforma (soporte). */
export const platformChangePlanRequestSchema = z.object({ planCode: planCodeSchema });
export type PlatformChangePlanRequest = z.infer<typeof platformChangePlanRequestSchema>;

/** Ajuste de fechas/estado para demostrar vencimientos (D6). */
export const platformAdjustSubscriptionRequestSchema = z.object({
  status: subscriptionStatusSchema.optional(),
  currentPeriodStart: z.string().datetime({ offset: true }).optional(),
  currentPeriodEnd: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((value) => value.status !== undefined || value.currentPeriodStart !== undefined || value.currentPeriodEnd !== undefined, "Indique al menos un cambio.");
export type PlatformAdjustSubscriptionRequest = z.infer<typeof platformAdjustSubscriptionRequestSchema>;
