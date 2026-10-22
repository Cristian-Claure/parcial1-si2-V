import { z } from "zod";
import { planCodeSchema, reportTierSchema, type ReportTier } from "./plans.js";
import { reportChartSchema, reportDateSchema, reportEntityIdSchema, reportKpiFormatSchema, reportPolicySchema } from "./reports.js";

/**
 * Fase 3 · Constructor dinámico de reportes. El cliente solo envía IDENTIFICADORES de esta
 * lista blanca (nunca SQL ni nombres de columna); el backend los traduce a SQL parametrizado.
 */

export const reportDimensionIdSchema = z.enum([
  "DATE_DAY", "DATE_WEEK", "DATE_MONTH", "DATE_QUARTER", "DATE_YEAR", "WEEKDAY", "HOUR",
  "STORE", "CHANNEL", "FULFILLMENT", "ORDER_STATUS", "PAYMENT_METHOD",
  "CATEGORY", "PRODUCT", "BRAND", "SIZE", "COLOR", "CUSTOMER",
]);
export type ReportDimensionId = z.infer<typeof reportDimensionIdSchema>;

export const reportMeasureIdSchema = z.enum([
  "GROSS_SALES", "NET_SALES", "REFUNDS", "DISCOUNT", "ORDERS", "UNITS", "AVERAGE_TICKET",
  "CANCELLATION_RATE", "UNIQUE_CUSTOMERS", "NEW_CUSTOMERS", "RETURNING_CUSTOMERS", "INVENTORY_VALUE",
]);
export type ReportMeasureId = z.infer<typeof reportMeasureIdSchema>;

export type ReportDimensionGroup = "FECHA" | "OPERACION" | "PRODUCTO" | "CLIENTE";

export interface ReportDimensionMeta {
  id: ReportDimensionId;
  label: string;
  group: ReportDimensionGroup;
  minTier: ReportTier;
  /** Se puede usar como filtro (los de fecha se filtran con el período). */
  filterable: boolean;
  /** Compatible con el valor de inventario (foto actual, sin fecha ni pedido). */
  inventory: boolean;
}

export interface ReportMeasureMeta {
  id: ReportMeasureId;
  label: string;
  format: z.infer<typeof reportKpiFormatSchema>;
  minTier: ReportTier;
  description: string;
}

export const REPORT_DIMENSIONS: readonly ReportDimensionMeta[] = [
  { id: "DATE_DAY", label: "Día", group: "FECHA", minTier: "STANDARD", filterable: false, inventory: false },
  { id: "DATE_WEEK", label: "Semana", group: "FECHA", minTier: "STANDARD", filterable: false, inventory: false },
  { id: "DATE_MONTH", label: "Mes", group: "FECHA", minTier: "STANDARD", filterable: false, inventory: false },
  { id: "DATE_QUARTER", label: "Trimestre", group: "FECHA", minTier: "STANDARD", filterable: false, inventory: false },
  { id: "DATE_YEAR", label: "Año", group: "FECHA", minTier: "STANDARD", filterable: false, inventory: false },
  { id: "WEEKDAY", label: "Día de la semana", group: "FECHA", minTier: "ADVANCED", filterable: true, inventory: false },
  { id: "HOUR", label: "Hora del día", group: "FECHA", minTier: "ADVANCED", filterable: true, inventory: false },
  { id: "STORE", label: "Sucursal", group: "OPERACION", minTier: "STANDARD", filterable: true, inventory: true },
  { id: "CHANNEL", label: "Canal", group: "OPERACION", minTier: "STANDARD", filterable: true, inventory: false },
  { id: "FULFILLMENT", label: "Tipo de entrega", group: "OPERACION", minTier: "STANDARD", filterable: true, inventory: false },
  { id: "ORDER_STATUS", label: "Estado del pedido", group: "OPERACION", minTier: "STANDARD", filterable: true, inventory: false },
  { id: "PAYMENT_METHOD", label: "Método de pago", group: "OPERACION", minTier: "STANDARD", filterable: true, inventory: false },
  { id: "CATEGORY", label: "Categoría", group: "PRODUCTO", minTier: "STANDARD", filterable: true, inventory: true },
  { id: "PRODUCT", label: "Producto", group: "PRODUCTO", minTier: "STANDARD", filterable: true, inventory: true },
  { id: "BRAND", label: "Marca", group: "PRODUCTO", minTier: "STANDARD", filterable: true, inventory: true },
  { id: "SIZE", label: "Talla", group: "PRODUCTO", minTier: "STANDARD", filterable: true, inventory: true },
  { id: "COLOR", label: "Color", group: "PRODUCTO", minTier: "STANDARD", filterable: true, inventory: true },
  { id: "CUSTOMER", label: "Cliente", group: "CLIENTE", minTier: "ADVANCED", filterable: true, inventory: false },
];

export const REPORT_MEASURES: readonly ReportMeasureMeta[] = [
  { id: "NET_SALES", label: "Venta neta", format: "CURRENCY", minTier: "STANDARD", description: "Pagos confirmados menos reembolsos del período (misma definición del resumen)." },
  { id: "GROSS_SALES", label: "Venta bruta", format: "CURRENCY", minTier: "STANDARD", description: "Pagos confirmados en el período, antes de reembolsos." },
  { id: "REFUNDS", label: "Reembolsos", format: "CURRENCY", minTier: "STANDARD", description: "Importe reembolsado en el período." },
  { id: "DISCOUNT", label: "Descuento", format: "CURRENCY", minTier: "STANDARD", description: "Descuento otorgado en pedidos con pago confirmado en el período." },
  { id: "ORDERS", label: "Pedidos pagados", format: "COUNT", minTier: "STANDARD", description: "Pedidos distintos con pago confirmado en el período." },
  { id: "UNITS", label: "Unidades", format: "COUNT", minTier: "STANDARD", description: "Prendas de pedidos con pago confirmado (no reembolsado) en el período." },
  { id: "AVERAGE_TICKET", label: "Ticket promedio", format: "CURRENCY", minTier: "STANDARD", description: "Venta bruta dividida entre pedidos pagados." },
  { id: "CANCELLATION_RATE", label: "Tasa de cancelación", format: "PERCENT", minTier: "STANDARD", description: "Pedidos cancelados sobre pedidos creados en el período." },
  { id: "UNIQUE_CUSTOMERS", label: "Clientes únicos", format: "COUNT", minTier: "STANDARD", description: "Clientes distintos con pago confirmado en el período." },
  { id: "NEW_CUSTOMERS", label: "Clientes nuevos", format: "COUNT", minTier: "ADVANCED", description: "Clientes cuya primera compra pagada en la empresa ocurrió en el período." },
  { id: "RETURNING_CUSTOMERS", label: "Clientes recurrentes", format: "COUNT", minTier: "ADVANCED", description: "Clientes del período que ya habían comprado antes (únicos = nuevos + recurrentes)." },
  { id: "INVENTORY_VALUE", label: "Valor de inventario", format: "CURRENCY", minTier: "STANDARD", description: "Stock disponible actual valorizado a precio de lista (foto actual, sin fecha)." },
];

export const REPORT_BUILDER_LIMITS = { maxDimensions: 3, maxMeasures: 8, maxFilters: 10, maxFilterValues: 50, maxRows: 500, defaultRows: 100 } as const;

export const reportPeriodPresetSchema = z.enum(["LAST_7", "LAST_30", "LAST_90", "LAST_365", "THIS_MONTH", "THIS_YEAR", "ALL"]);
export type ReportPeriodPreset = z.infer<typeof reportPeriodPresetSchema>;

export const reportBuilderFilterSchema = z.object({
  dimension: reportDimensionIdSchema,
  values: z.array(z.string().trim().min(1).max(120)).min(1).max(REPORT_BUILDER_LIMITS.maxFilterValues),
}).strict();
export type ReportBuilderFilter = z.infer<typeof reportBuilderFilterSchema>;

export const reportBuilderSortSchema = z.object({
  by: z.union([reportDimensionIdSchema, reportMeasureIdSchema]),
  direction: z.enum(["ASC", "DESC"]),
}).strict();

const unique = (values: readonly string[]) => new Set(values).size === values.length;

/** Definición guardable: solo identificadores del catálogo y el período (preset o fechas). */
export const reportBuilderDefinitionSchema = z.object({
  dimensions: z.array(reportDimensionIdSchema).max(REPORT_BUILDER_LIMITS.maxDimensions).refine(unique, "Dimensiones repetidas."),
  measures: z.array(reportMeasureIdSchema).min(1, "Elige al menos una medida.").max(REPORT_BUILDER_LIMITS.maxMeasures).refine(unique, "Medidas repetidas."),
  filters: z.array(reportBuilderFilterSchema).max(REPORT_BUILDER_LIMITS.maxFilters).default([]),
  sort: reportBuilderSortSchema.optional(),
  limit: z.number().int().min(1).max(REPORT_BUILDER_LIMITS.maxRows).default(REPORT_BUILDER_LIMITS.defaultRows),
  compareWithPrevious: z.boolean().default(false),
  preset: reportPeriodPresetSchema.optional(),
  from: reportDateSchema.optional(),
  to: reportDateSchema.optional(),
}).strict();
export type ReportBuilderDefinition = z.infer<typeof reportBuilderDefinitionSchema>;
export type ReportBuilderDefinitionInput = z.input<typeof reportBuilderDefinitionSchema>;

export const adminReportBuilderQuerySchema = reportBuilderDefinitionSchema.extend({ companyId: reportEntityIdSchema }).strict();
export type AdminReportBuilderQuery = z.infer<typeof adminReportBuilderQuerySchema>;
export const managerReportBuilderQuerySchema = reportBuilderDefinitionSchema;
export type ManagerReportBuilderQuery = z.infer<typeof managerReportBuilderQuerySchema>;

export const reportExportFormatSchema = z.enum(["xlsx", "pdf"]);
export type ReportExportFormat = z.infer<typeof reportExportFormatSchema>;
export const reportExportQuerySchema = z.object({ format: reportExportFormatSchema });

const catalogAccess = { minTier: reportTierSchema, locked: z.boolean(), requiredPlan: planCodeSchema.nullable() };

export const reportSemanticCatalogSchema = z.object({
  tier: reportTierSchema,
  policy: reportPolicySchema,
  dimensions: z.array(z.object({ id: reportDimensionIdSchema, label: z.string(), group: z.string(), filterable: z.boolean(), inventory: z.boolean(), ...catalogAccess })),
  measures: z.array(z.object({ id: reportMeasureIdSchema, label: z.string(), format: reportKpiFormatSchema, description: z.string(), ...catalogAccess })),
  /** Valores sugeridos para filtros con dominio pequeño (sucursales, categorías, canales…). */
  filterOptions: z.record(z.string(), z.array(z.object({ value: z.string(), label: z.string() }))),
  limits: z.object({ maxDimensions: z.number(), maxMeasures: z.number(), maxFilters: z.number(), maxRows: z.number() }),
  presets: z.array(reportPeriodPresetSchema),
});
export type ReportSemanticCatalog = z.infer<typeof reportSemanticCatalogSchema>;

export const reportBuilderColumnSchema = z.object({
  id: z.string(), label: z.string(), kind: z.enum(["DIMENSION", "MEASURE"]), format: reportKpiFormatSchema.nullable(),
});
export type ReportBuilderColumn = z.infer<typeof reportBuilderColumnSchema>;

export const reportBuilderRowSchema = z.object({
  /** Clave estable por dimensión (id o valor) y su etiqueta legible. */
  keys: z.array(z.string()),
  labels: z.array(z.string()),
  values: z.array(z.number()),
  previous: z.array(z.number().nullable()).nullable(),
});
export type ReportBuilderRow = z.infer<typeof reportBuilderRowSchema>;

export const reportBuilderResultSchema = z.object({
  title: z.string(),
  scopeLabel: z.string(),
  from: reportDateSchema,
  to: reportDateSchema,
  previousFrom: reportDateSchema.nullable(),
  previousTo: reportDateSchema.nullable(),
  generatedAt: z.string().datetime(),
  columns: z.array(reportBuilderColumnSchema),
  rows: z.array(reportBuilderRowSchema),
  /** Totales del conjunto filtrado completo (no la suma de filas: los distintos no son aditivos). */
  totals: z.array(z.number()),
  previousTotals: z.array(z.number()).nullable(),
  truncated: z.boolean(),
  filtersApplied: z.array(z.object({ dimension: reportDimensionIdSchema, label: z.string(), values: z.array(z.string()) })),
  suggestedChart: reportChartSchema.nullable(),
  policy: reportPolicySchema,
  notes: z.array(z.string()),
});
export type ReportBuilderResult = z.infer<typeof reportBuilderResultSchema>;

export const reportDefinitionNameSchema = z.string().trim().min(2, "El nombre es muy corto.").max(80);

export const reportDefinitionSchema = z.object({
  id: reportEntityIdSchema,
  companyId: reportEntityIdSchema,
  name: z.string(),
  definition: reportBuilderDefinitionSchema,
  createdBy: reportEntityIdSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReportDefinition = z.infer<typeof reportDefinitionSchema>;

export const createReportDefinitionRequestSchema = z.object({
  companyId: reportEntityIdSchema, name: reportDefinitionNameSchema, definition: reportBuilderDefinitionSchema,
}).strict();
export type CreateReportDefinitionRequest = z.infer<typeof createReportDefinitionRequestSchema>;

export const updateReportDefinitionRequestSchema = z.object({
  name: reportDefinitionNameSchema.optional(), definition: reportBuilderDefinitionSchema.optional(),
}).strict();
export type UpdateReportDefinitionRequest = z.infer<typeof updateReportDefinitionRequestSchema>;

export const reportDefinitionsQuerySchema = z.object({ companyId: reportEntityIdSchema });
