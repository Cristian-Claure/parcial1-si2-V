import { z } from "zod";

export const serverRuntimeConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  VELORA_JWT_SECRET: z.string().min(32),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional()
});

export type ServerRuntimeConfig =
  z.infer<typeof serverRuntimeConfigSchema>;

export function parseServerRuntimeConfig(
  env: Record<string, string | undefined>
): ServerRuntimeConfig {
  return serverRuntimeConfigSchema.parse(env);
}