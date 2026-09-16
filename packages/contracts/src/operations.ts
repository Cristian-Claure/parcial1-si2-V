import { z } from "zod";
import { dbIdSchema } from "./shared.js";
import { companyIdSchema } from "./companies.js";
import { fulfillmentTypeSchema, orderStatusSchema } from "./orders.js";
import { paymentMethodSchema, paymentStatusSchema } from "./payments.js";

export const operationalOrdersQuerySchema = z.object({
  companyId: companyIdSchema.optional(),
});
export type OperationalOrdersQuery = z.infer<typeof operationalOrdersQuerySchema>;

export const operationalPaymentSummarySchema = z.object({
  id: dbIdSchema,
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  amount: z.number().positive(),
  currency: z.string(),
  provider: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type OperationalPaymentSummary = z.infer<typeof operationalPaymentSummarySchema>;

export const operationalOrderListItemSchema = z.object({
  id: dbIdSchema,
  orderNumber: z.string(),
  customerId: dbIdSchema.nullable(),
  customerName: z.string(),
  customerEmail: z.string().nullable(),
  companyId: companyIdSchema,
  storeId: dbIdSchema,
  storeName: z.string(),
  warehouseId: dbIdSchema,
  warehouseName: z.string(),
  orderChannel: z.enum(["ECOMMERCE", "POS"]),
  fulfillmentType: fulfillmentTypeSchema,
  status: orderStatusSchema,
  currency: z.string(),
  total: z.number().nonnegative(),
  createdAt: z.string().datetime(),
  fulfilledAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  payments: z.array(operationalPaymentSummarySchema),
});
export type OperationalOrderListItem = z.infer<typeof operationalOrderListItemSchema>;
