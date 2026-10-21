import { z } from "zod";
import { companyIdSchema } from "./companies.js";
import { userProfileSchema } from "./auth.js";

export const adminCompanyQuerySchema = z.object({
  companyId: companyIdSchema,
});
export type AdminCompanyQuery = z.infer<typeof adminCompanyQuerySchema>;

export const createManagerRequestSchema = z.object({
  companyId: companyIdSchema,
  firstName: z.string().trim().min(1, "El nombre es obligatorio.").max(80),
  lastName: z.string().trim().min(1, "El apellido es obligatorio.").max(100),
  email: z.string().trim().min(1, "El correo es obligatorio.").email({ message: "Ingrese un correo válido." }).max(180),
  password: z.string().min(8).max(72).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, "La contraseña debe incluir mayúscula, minúscula y número."),
  storeId: z.string().uuid({ message: "Debe asignar una sucursal válida." }),
});
export type CreateManagerRequest = z.infer<typeof createManagerRequestSchema>;

export const managerResponseSchema = userProfileSchema.extend({
  companyId: companyIdSchema,
});
export type ManagerResponse = z.infer<typeof managerResponseSchema>;

/**
 * Asigna o reemplaza el encargado de una sucursal (un encargado activo por sucursal).
 * - `userId`: reasigna un encargado existente de la misma compañía.
 * - datos de cuenta: crea un encargado nuevo.
 * El encargado activo anterior pasa a INACTIVE en la misma transacción.
 */
export const assignStoreManagerRequestSchema = z.union([
  z.object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/, "Encargado inválido.") }),
  createManagerRequestSchema.omit({ companyId: true, storeId: true }),
]);
export type AssignStoreManagerRequest = z.infer<typeof assignStoreManagerRequestSchema>;

export const assignStoreManagerResponseSchema = z.object({
  manager: managerResponseSchema,
  replacedManagerId: z.string().nullable(),
});
export type AssignStoreManagerResponse = z.infer<typeof assignStoreManagerResponseSchema>;
