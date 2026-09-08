import { z } from "zod";

export const userRoleSchema = z.enum([
  "ADMIN",
  "STORE_MANAGER",
  "CUSTOMER",
]);

export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
  "BLOCKED",
]);

export type UserStatus = z.infer<typeof userStatusSchema>;

export const customerTypeSchema = z.enum([
  "B2C",
  "B2B",
]);

export type CustomerType = z.infer<typeof customerTypeSchema>;

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
  customerType: customerTypeSchema.nullable(),
  phone: z.string().nullable(),
  businessName: z.string().nullable(),
  taxId: z.string().nullable(),
  status: userStatusSchema,
  storeId: z.string().uuid().nullable(),
  storeName: z.string().nullable(),
});

export type UserProfile =
  z.infer<typeof userProfileSchema>;

export const loginRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, {
      message: "El correo es obligatorio.",
    })
    .email({
      message: "Ingrese un correo válido.",
    }),

  password: z
    .string()
    .min(1, {
      message: "La contraseña es obligatoria.",
    }),
});

export type LoginRequest =
  z.infer<typeof loginRequestSchema>;

export const registerRequestSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, {
      message: "El nombre es obligatorio.",
    })
    .max(80, {
      message: "El nombre es demasiado largo.",
    }),

  lastName: z
    .string()
    .trim()
    .min(1, {
      message: "El apellido es obligatorio.",
    })
    .max(100, {
      message: "El apellido es demasiado largo.",
    }),

  email: z
    .string()
    .trim()
    .min(1, {
      message: "El correo es obligatorio.",
    })
    .max(180, {
      message: "El correo es demasiado largo.",
    })
    .email({
      message: "Ingrese un correo válido.",
    }),

  password: z
    .string()
    .min(1, {
      message: "La contraseña es obligatoria.",
    })
    .min(8, {
      message:
        "La contraseña debe tener entre 8 y 72 caracteres.",
    })
    .max(72, {
      message:
        "La contraseña debe tener entre 8 y 72 caracteres.",
    })
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
      {
        message:
          "La contraseña debe incluir mayúscula, minúscula y número.",
      },
    ),
});

export type RegisterRequest =
  z.infer<typeof registerRequestSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
  user: userProfileSchema,
});

export type AuthResponse =
  z.infer<typeof authResponseSchema>;

export const apiErrorSchema = z.object({
  timestamp: z.string(),
  status: z.number().int(),
  message: z.string(),
  errors: z.record(
    z.string(),
    z.string(),
  ),
});

export type ApiError =
  z.infer<typeof apiErrorSchema>;

export const VELORA_API_CONTRACT_VERSION =
  "legacy-parity-v1" as const;