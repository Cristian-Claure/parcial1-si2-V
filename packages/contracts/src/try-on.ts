import { z } from "zod";

import { companyIdSchema } from "./companies.js";

export const tryOnProviderSchema = z.enum([
  "LOCAL",
  "REPLICATE",
]);

export type TryOnProvider = z.infer<
  typeof tryOnProviderSchema
>;

export const tryOnJobStatusSchema = z.enum([
  "QUEUED",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export type TryOnJobStatus = z.infer<
  typeof tryOnJobStatusSchema
>;

export const tryOnJobResponseSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  provider: tryOnProviderSchema,
  status: tryOnJobStatusSchema,
  resultUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});

export type TryOnJobResponse = z.infer<
  typeof tryOnJobResponseSchema
>;

export const productAssistantHistoryItemSchema = z.object({
  role: z.enum([
    "user",
    "assistant",
  ]),
  content: z.string()
    .trim()
    .min(1)
    .max(1200),
});

export type ProductAssistantHistoryItem = z.infer<
  typeof productAssistantHistoryItemSchema
>;

export const productAssistantRequestSchema = z.object({
  companyId: companyIdSchema,
  message: z.string()
    .trim()
    .min(
      2,
      "Escriba al menos dos caracteres para consultar al asistente.",
    )
    .max(
      800,
      "La consulta no puede superar 800 caracteres.",
    ),
  history: z.array(
    productAssistantHistoryItemSchema,
  )
    .max(
      8,
      "El historial no puede superar 8 mensajes.",
    )
    .optional(),
});

export type ProductAssistantRequest = z.infer<
  typeof productAssistantRequestSchema
>;

export const productAssistantRecommendationSchema = z.object({
  productId: z.string().uuid(),
  reason: z.string()
    .trim()
    .min(1)
    .max(420),
  variantIds: z.array(
    z.string().uuid(),
  )
    .max(8),
});

export type ProductAssistantRecommendation = z.infer<
  typeof productAssistantRecommendationSchema
>;

export const productAssistantResponseSchema = z.object({
  reply: z.string()
    .trim()
    .min(1)
    .max(1400),
  recommendations: z.array(
    productAssistantRecommendationSchema,
  )
    .max(4),
  model: z.string()
    .trim()
    .min(1),
});

export type ProductAssistantResponse = z.infer<
  typeof productAssistantResponseSchema
>;
