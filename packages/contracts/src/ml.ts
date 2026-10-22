import { z } from "zod";

/** Fase 4 · Machine Learning local (solo plan MAX). Contratos aditivos. */

export const mlModelKeySchema = z.enum(["SALES_FORECAST", "CANCEL_RISK", "CUSTOMER_SEGMENTS", "SALES_ANOMALIES"]);
export type MlModelKey = z.infer<typeof mlModelKeySchema>;

export const ML_MODEL_LABELS: Record<MlModelKey, string> = {
  SALES_FORECAST: "Pronóstico de ventas",
  CANCEL_RISK: "Riesgo de cancelación",
  CUSTOMER_SEGMENTS: "Segmentos de clientes",
  SALES_ANOMALIES: "Anomalías en ventas",
};

export const mlRunStatusSchema = z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "INSUFFICIENT_DATA"]);
export type MlRunStatus = z.infer<typeof mlRunStatusSchema>;

const uuid = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "ID inválido.");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const mlRunSchema = z.object({
  id: uuid,
  companyId: uuid,
  modelKey: mlModelKeySchema,
  status: mlRunStatusSchema,
  rowsUsed: z.number().int().nullable(),
  dataFrom: day.nullable(),
  dataTo: day.nullable(),
  /** Métricas del modelo frente a sus referencias, importancias y perfiles (forma propia de cada modelo). */
  metrics: z.record(z.string(), z.unknown()),
  params: z.record(z.string(), z.unknown()),
  artifactVersion: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
});
export type MlRun = z.infer<typeof mlRunSchema>;

export const mlOverviewSchema = z.object({
  companyId: uuid,
  service: z.object({ available: z.boolean(), busy: z.boolean() }),
  training: z.boolean(),
  models: z.array(z.object({
    modelKey: mlModelKeySchema,
    label: z.string(),
    latest: mlRunSchema.nullable(),
    lastSuccess: mlRunSchema.nullable(),
  })),
});
export type MlOverview = z.infer<typeof mlOverviewSchema>;

export const mlCompanyQuerySchema = z.object({ companyId: uuid });
export type MlCompanyQuery = z.infer<typeof mlCompanyQuerySchema>;

export const startMlRunsRequestSchema = z.object({
  companyId: uuid,
  models: z.array(mlModelKeySchema).min(1).optional(),
}).strict();
export type StartMlRunsRequest = z.infer<typeof startMlRunsRequestSchema>;

export const startMlRunsResponseSchema = z.object({ runIds: z.record(z.string(), uuid) });
export type StartMlRunsResponse = z.infer<typeof startMlRunsResponseSchema>;

/** Resultado de un modelo: su última corrida terminada (exitosa o INSUFFICIENT_DATA) y sus filas. */
const withRun = { run: mlRunSchema.nullable() };

export const mlForecastSchema = z.object({
  ...withRun,
  points: z.array(z.object({ day, kind: z.enum(["BACKTEST", "FORECAST"]), actual: z.number().nullable(), predicted: z.number(), lower: z.number().nullable(), upper: z.number().nullable() })),
});
export type MlForecast = z.infer<typeof mlForecastSchema>;

export const mlSegmentsSchema = z.object({
  ...withRun,
  customers: z.array(z.object({
    customerId: uuid, name: z.string(), segment: z.number().int(), segmentName: z.string(),
    recencyDays: z.number().int(), frequency: z.number().int(), monetary: z.number(), pc1: z.number(), pc2: z.number(),
  })),
});
export type MlSegments = z.infer<typeof mlSegmentsSchema>;

export const mlCancelRiskSchema = z.object({
  ...withRun,
  orders: z.array(z.object({
    orderId: uuid, orderNumber: z.string(), createdAt: z.string().datetime(), total: z.number(),
    probability: z.number(), riskLevel: z.enum(["ALTO", "MEDIO", "BAJO"]), features: z.record(z.string(), z.unknown()),
  })),
});
export type MlCancelRisk = z.infer<typeof mlCancelRiskSchema>;

export const mlAnomaliesSchema = z.object({
  ...withRun,
  days: z.array(z.object({
    day, actual: z.number(), expected: z.number(), score: z.number(), isAnomaly: z.boolean(),
    direction: z.enum(["ALZA", "BAJA"]).nullable(), explanation: z.string().nullable(),
  })),
});
export type MlAnomalies = z.infer<typeof mlAnomaliesSchema>;
