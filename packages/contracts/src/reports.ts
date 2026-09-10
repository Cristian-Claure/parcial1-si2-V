import {
  z,
} from "zod";


export const reportEntityIdSchema =
  z
    .string()
    .regex(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
      "ID inválido.",
    );

export const reportDateSchema =
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "La fecha debe usar YYYY-MM-DD.",
    );

export const reportKpiFormatSchema =
  z.enum([
    "CURRENCY",
    "COUNT",
  ]);

export type ReportKpiFormat =
  z.infer<
    typeof reportKpiFormatSchema
  >;

export const reportChartTypeSchema =
  z.enum([
    "LINE",
    "BAR",
    "DONUT",
  ]);

export type ReportChartType =
  z.infer<
    typeof reportChartTypeSchema
  >;

export const reportKpiSchema =
  z.object({
    key:
      z.string(),
    label:
      z.string(),
    value:
      z.number(),
    format:
      reportKpiFormatSchema,
    helper:
      z.string(),
  });

export type ReportKpi =
  z.infer<
    typeof reportKpiSchema
  >;

export const reportChartSeriesSchema =
  z.object({
    name:
      z.string(),
    data:
      z.array(
        z.number(),
      ),
  });

export type ReportChartSeries =
  z.infer<
    typeof reportChartSeriesSchema
  >;

export const reportChartSchema =
  z.object({
    id:
      z.string(),
    title:
      z.string(),
    type:
      reportChartTypeSchema,
    categories:
      z.array(
        z.string(),
      ),
    series:
      z.array(
        reportChartSeriesSchema,
      ),
  });

export type ReportChart =
  z.infer<
    typeof reportChartSchema
  >;

export const reportTableSchema =
  z.object({
    id:
      z.string(),
    title:
      z.string(),
    columns:
      z.array(
        z.string(),
      ),
    rows:
      z.array(
        z.array(
          z.string(),
        ),
      ),
  });

export type ReportTable =
  z.infer<
    typeof reportTableSchema
  >;

export const reportPeriodBoundsSchema =
  z.object({
    minDate:
      reportDateSchema,
    maxDate:
      reportDateSchema,
  });

export type ReportPeriodBounds =
  z.infer<
    typeof reportPeriodBoundsSchema
  >;

export const reportOverviewSchema =
  z.object({
    title:
      z.string(),
    scopeLabel:
      z.string(),
    from:
      reportDateSchema,
    to:
      reportDateSchema,
    generatedAt:
      z.string().datetime(),
    kpis:
      z.array(
        reportKpiSchema,
      ),
    charts:
      z.array(
        reportChartSchema,
      ),
    tables:
      z.array(
        reportTableSchema,
      ),
    deterministicInsights:
      z.array(
        z.string(),
      ),
  });

export type ReportOverview =
  z.infer<
    typeof reportOverviewSchema
  >;

export const reportFocusSchema =
  z.enum([
    "OVERVIEW",
    "SALES",
    "ORDERS",
    "PAYMENTS",
    "INVENTORY",
    "PRODUCTS",
  ]);

export type ReportFocus =
  z.infer<
    typeof reportFocusSchema
  >;

export const reportChartPreferenceSchema =
  z.enum([
    "AUTO",
    "LINE",
    "BAR",
    "DONUT",
    "TABLE",
  ]);

export type ReportChartPreference =
  z.infer<
    typeof reportChartPreferenceSchema
  >;

export const reportAiIntentSchema =
  z.object({
    focus:
      reportFocusSchema,
    fromDate:
      reportDateSchema
        .nullable(),
    toDate:
      reportDateSchema
        .nullable(),
    storeId:
      reportEntityIdSchema
        .nullable(),
    requestedChart:
      reportChartPreferenceSchema,
  });

export type ReportAiIntent =
  z.infer<
    typeof reportAiIntentSchema
  >;

export const reportAiNarrativeResponseSchema =
  z.object({
    summary:
      z.string(),
    insights:
      z
        .array(
          z.string(),
        )
        .max(6),
    assessment:
      z.string(),
    recommendations:
      z
        .array(
          z.string(),
        )
        .max(4),
    model:
      z.string(),
  });

export type ReportAiNarrativeResponse =
  z.infer<
    typeof reportAiNarrativeResponseSchema
  >;

const reportAiQuestionFields = {
  question:
    z
      .string()
      .trim()
      .min(
        2,
        "Escriba una consulta.",
      )
      .max(
        800,
        "La consulta supera 800 caracteres.",
      ),
  fromDate:
    reportDateSchema
      .nullable()
      .optional(),
  toDate:
    reportDateSchema
      .nullable()
      .optional(),
} as const;

export const adminReportAiQueryRequestSchema =
  z.object({
    ...reportAiQuestionFields,
    companyId:
      reportEntityIdSchema,
  });

export type AdminReportAiQueryRequest =
  z.infer<
    typeof adminReportAiQueryRequestSchema
  >;

export const managerReportAiQueryRequestSchema =
  z.object({
    ...reportAiQuestionFields,
  });

export type ManagerReportAiQueryRequest =
  z.infer<
    typeof managerReportAiQueryRequestSchema
  >;

export const adminReportAiNarrativeRequestSchema =
  z.object({
    ...reportAiQuestionFields,
    companyId:
      reportEntityIdSchema,
    storeId:
      reportEntityIdSchema
        .nullable()
        .optional(),
  });

export type AdminReportAiNarrativeRequest =
  z.infer<
    typeof adminReportAiNarrativeRequestSchema
  >;

export const managerReportAiNarrativeRequestSchema =
  z.object({
    ...reportAiQuestionFields,
    storeId:
      reportEntityIdSchema
        .nullable()
        .optional(),
  });

export type ManagerReportAiNarrativeRequest =
  z.infer<
    typeof managerReportAiNarrativeRequestSchema
  >;

export const reportAiQueryResponseSchema =
  z.object({
    question:
      z.string(),
    intent:
      reportAiIntentSchema,
    report:
      reportOverviewSchema,
    narrative:
      reportAiNarrativeResponseSchema,
    model:
      z.string(),
  });

export type ReportAiQueryResponse =
  z.infer<
    typeof reportAiQueryResponseSchema
  >;

export const reportVoiceTranscriptionResponseSchema =
  z.object({
    text:
      z.string(),
    model:
      z.string(),
  });

export type ReportVoiceTranscriptionResponse =
  z.infer<
    typeof reportVoiceTranscriptionResponseSchema
  >;

export const adminReportQuerySchema =
  z.object({
    companyId:
      reportEntityIdSchema,
    storeId:
      reportEntityIdSchema
        .optional(),
    from:
      reportDateSchema
        .optional(),
    to:
      reportDateSchema
        .optional(),
  });

export type AdminReportQuery =
  z.infer<
    typeof adminReportQuerySchema
  >;

export const managerReportQuerySchema =
  z.object({
    from:
      reportDateSchema
        .optional(),
    to:
      reportDateSchema
        .optional(),
  });

export type ManagerReportQuery =
  z.infer<
    typeof managerReportQuerySchema
  >;
