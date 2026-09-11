import { z } from "zod";

export const pushPlatformSchema = z.enum(["ANDROID", "WEB"]);
export type PushPlatform = z.infer<typeof pushPlatformSchema>;

export const registerPushInstallationRequestSchema = z.object({
  installationId: z.string().trim().min(1).max(255),
  platform: pushPlatformSchema,
  deviceLabel: z.string().trim().max(160).nullable().optional(),
});
export type RegisterPushInstallationRequest = z.infer<typeof registerPushInstallationRequestSchema>;

export const revokePushInstallationQuerySchema = z.object({
  installationId: z.string().trim().min(1).max(255),
  platform: pushPlatformSchema,
});
export type RevokePushInstallationQuery = z.infer<typeof revokePushInstallationQuerySchema>;

export const pushInstallationResponseSchema = z.object({
  id: z.string().uuid(),
  installationId: z.string(),
  platform: pushPlatformSchema,
  deviceLabel: z.string().nullable(),
  active: z.boolean(),
  lastSeenAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PushInstallationResponse = z.infer<typeof pushInstallationResponseSchema>;
