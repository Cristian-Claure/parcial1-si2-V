import { z } from "zod";
import { customerTypeSchema, userProfileSchema } from "./auth.js";

const nullableTrimmed = (max: number) =>
  z.string().trim().max(max).nullable().optional();

export const customerProfileUpdateRequestSchema = z.object({
  firstName: z.string().trim().min(1, "El nombre es obligatorio.").max(80),
  lastName: z.string().trim().min(1, "El apellido es obligatorio.").max(100),
  phone: nullableTrimmed(40),
  customerType: customerTypeSchema,
  businessName: nullableTrimmed(160),
  taxId: nullableTrimmed(40),
}).superRefine((value, context) => {
  if (value.customerType === "B2B") {
    if (!value.businessName?.trim()) {
      context.addIssue({ code: "custom", path: ["businessName"], message: "Los clientes B2B deben registrar razón social." });
    }
    if (!value.taxId?.trim()) {
      context.addIssue({ code: "custom", path: ["taxId"], message: "Los clientes B2B deben registrar NIT." });
    }
  }
});

export type CustomerProfileUpdateRequest = z.infer<typeof customerProfileUpdateRequestSchema>;
export const customerProfileResponseSchema = userProfileSchema;
export type CustomerProfileResponse = z.infer<typeof customerProfileResponseSchema>;

export const customerAddressRequestSchema = z.object({
  label: z.string().trim().min(1, "El alias de la dirección es obligatorio.").max(60),
  recipientName: z.string().trim().min(1, "El destinatario es obligatorio.").max(180),
  recipientPhone: z.string().trim().min(1, "El teléfono del destinatario es obligatorio.").max(40),
  department: z.string().trim().min(1, "El departamento es obligatorio.").max(100),
  city: z.string().trim().min(1, "La ciudad es obligatoria.").max(100),
  zone: nullableTrimmed(120),
  addressLine: z.string().trim().min(1, "La dirección es obligatoria.").max(240),
  reference: nullableTrimmed(300),
  defaultAddress: z.boolean(),
});
export type CustomerAddressRequest = z.infer<typeof customerAddressRequestSchema>;

export const customerAddressResponseSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  recipientName: z.string(),
  recipientPhone: z.string(),
  department: z.string(),
  city: z.string(),
  zone: z.string().nullable(),
  addressLine: z.string(),
  reference: z.string().nullable(),
  defaultAddress: z.boolean(),
});
export type CustomerAddressResponse = z.infer<typeof customerAddressResponseSchema>;

export const customerFavoriteResponseSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type CustomerFavoriteResponse = z.infer<typeof customerFavoriteResponseSchema>;
