import { z } from "zod";

export const userRoleSchema = z.enum([
  "ADMIN",
  "STORE_MANAGER",
  "CUSTOMER"
]);

export type UserRole = z.infer<typeof userRoleSchema>;

export const apiErrorSchema = z.object({
  status: z.number().int(),
  message: z.string(),
  code: z.string().optional()
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const VELORA_API_CONTRACT_VERSION =
  "legacy-parity-v1" as const;