import { z } from "zod";
import { authResponseSchema } from "./auth.js";
import { hexColorSchema } from "./branding.js";
import { companyResponseSchema } from "./companies.js";
import { planCodeSchema, planSchema, subscriptionSchema } from "./plans.js";

export const companySlugSchema = z.string().trim().toLowerCase()
  .min(3, "El enlace debe tener al menos 3 caracteres.")
  .max(60, "El enlace es demasiado largo.")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/, "Use letras minúsculas, números y guiones (sin guion al inicio o al final).");

const passwordSchema = z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, "La contraseña debe incluir mayúscula, minúscula y número.");

/** Datos de la tienda (compañía) al crearla; la marca completa se edita después (bloque 5). */
export const companyProvisionSchema = z.object({
  name: z.string().trim().min(2, "Ingrese el nombre de la tienda.").max(160),
  slug: companySlugSchema,
  tagline: z.string().trim().max(200).nullable().optional(),
  accentColor: hexColorSchema.nullable().optional(),
  storeName: z.string().trim().min(2).max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
});
export type CompanyProvision = z.infer<typeof companyProvisionSchema>;

/** Tarjeta DEMO (Fase 5 traerá QR): nunca se almacena el número, solo los 4 últimos dígitos. */
export const demoCardSchema = z.object({
  cardNumber: z.string().transform((value) => value.replace(/\s+/g, "")).pipe(z.string().regex(/^\d{12,19}$/, "Número de tarjeta DEMO inválido.")),
  holderName: z.string().trim().min(2, "Ingrese el titular.").max(120),
});
export type DemoCard = z.input<typeof demoCardSchema>;

export const registerOwnerStoreRequestSchema = z.object({
  owner: z.object({
    firstName: z.string().trim().min(1, "El nombre es obligatorio.").max(80),
    lastName: z.string().trim().min(1, "El apellido es obligatorio.").max(100),
    email: z.string().trim().email("Ingrese un correo válido.").max(180),
    password: passwordSchema,
  }),
  company: companyProvisionSchema,
  planCode: planCodeSchema,
  /** Requerida solo para planes pagos sin periodo de prueba. */
  card: demoCardSchema.nullable().optional(),
});
export type RegisterOwnerStoreRequest = z.input<typeof registerOwnerStoreRequestSchema>;

export const onboardingResponseSchema = z.object({
  auth: authResponseSchema,
  company: companyResponseSchema,
  subscription: subscriptionSchema,
  plan: planSchema,
});
export type OnboardingResponse = z.infer<typeof onboardingResponseSchema>;

export const slugAvailabilityResponseSchema = z.object({
  slug: z.string(),
  available: z.boolean(),
  suggestion: z.string().nullable(),
});
export type SlugAvailabilityResponse = z.infer<typeof slugAvailabilityResponseSchema>;

/** Crear otra tienda (compañía) desde el panel del propietario. */
export const createCompanyRequestSchema = companyProvisionSchema;
export type CreateCompanyRequest = z.infer<typeof createCompanyRequestSchema>;

/** Cambio de plan con pago DEMO (opcional para planes gratuitos). */
export const changePlanWithPaymentRequestSchema = z.object({
  planCode: planCodeSchema,
  card: demoCardSchema.nullable().optional(),
});
export type ChangePlanWithPaymentRequest = z.input<typeof changePlanWithPaymentRequestSchema>;

export const DEMO_DECLINED_CARD = "4000000000000002";
