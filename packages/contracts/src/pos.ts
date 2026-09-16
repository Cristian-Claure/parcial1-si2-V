import {
  z,
} from "zod";

import {
  dbIdSchema,
} from "./shared.js";

import {
  orderItemResponseSchema,
  orderStatusSchema,
} from "./orders.js";

import {
  paymentStatusSchema,
} from "./payments.js";

export const posPaymentMethodSchema =
  z.enum([
    "CASH",
    "CARD",
    "QR",
  ]);

export type PosPaymentMethod =
  z.infer<
    typeof posPaymentMethodSchema
  >;

export const cashSessionStatusSchema =
  z.enum([
    "OPEN",
    "CLOSED",
  ]);

export type CashSessionStatus =
  z.infer<
    typeof cashSessionStatusSchema
  >;

export const cashMovementTypeSchema =
  z.enum([
    "CASH_IN",
    "CASH_OUT",
  ]);

export type CashMovementType =
  z.infer<
    typeof cashMovementTypeSchema
  >;

export const createPointOfSaleRequestSchema =
  z.object({
    storeId:
      dbIdSchema,

    warehouseId:
      dbIdSchema,

    code:
      z.string()
        .trim()
        .min(
          1,
          "El código es obligatorio.",
        )
        .max(
          40,
          "El código es demasiado largo.",
        ),

    name:
      z.string()
        .trim()
        .min(
          1,
          "El nombre es obligatorio.",
        )
        .max(
          120,
          "El nombre es demasiado largo.",
        ),
  });

export type CreatePointOfSaleRequest =
  z.infer<
    typeof createPointOfSaleRequestSchema
  >;

export const updatePointOfSaleRequestSchema =
  z.object({
    warehouseId:
      dbIdSchema,

    code:
      z.string()
        .trim()
        .min(
          1,
          "El código es obligatorio.",
        )
        .max(
          40,
          "El código es demasiado largo.",
        ),

    name:
      z.string()
        .trim()
        .min(
          1,
          "El nombre es obligatorio.",
        )
        .max(
          120,
          "El nombre es demasiado largo.",
        ),

    active:
      z.boolean(),
  });

export type UpdatePointOfSaleRequest =
  z.infer<
    typeof updatePointOfSaleRequestSchema
  >;

export const pointOfSaleResponseSchema =
  z.object({
    id:
      dbIdSchema,

    storeId:
      dbIdSchema,

    storeName:
      z.string(),

    warehouseId:
      dbIdSchema,

    warehouseName:
      z.string(),

    code:
      z.string(),

    name:
      z.string(),

    active:
      z.boolean(),

    createdAt:
      z.string().datetime(),

    updatedAt:
      z.string().datetime(),
  });

export type PointOfSaleResponse =
  z.infer<
    typeof pointOfSaleResponseSchema
  >;

export const openCashSessionRequestSchema =
  z.object({
    pointOfSaleId:
      dbIdSchema,

    openingAmount:
      z.number()
        .nonnegative(
          "El monto inicial no puede ser negativo.",
        ),

    openingNotes:
      z.string()
        .max(
          500,
          "Las observaciones son demasiado largas.",
        )
        .nullable()
        .optional(),
  });

export type OpenCashSessionRequest =
  z.infer<
    typeof openCashSessionRequestSchema
  >;

export const closeCashSessionRequestSchema =
  z.object({
    countedCashAmount:
      z.number()
        .nonnegative(
          "El efectivo contado no puede ser negativo.",
        ),

    closingNotes:
      z.string()
        .max(
          500,
          "Las observaciones son demasiado largas.",
        )
        .nullable()
        .optional(),
  });

export type CloseCashSessionRequest =
  z.infer<
    typeof closeCashSessionRequestSchema
  >;

export const cashSessionResponseSchema =
  z.object({
    id:
      dbIdSchema,

    sessionNumber:
      z.string(),

    pointOfSaleId:
      dbIdSchema,

    pointOfSaleCode:
      z.string(),

    pointOfSaleName:
      z.string(),

    storeId:
      dbIdSchema,

    storeName:
      z.string(),

    warehouseId:
      dbIdSchema,

    warehouseName:
      z.string(),

    openedBy:
      dbIdSchema,

    closedBy:
      dbIdSchema
        .nullable(),

    status:
      cashSessionStatusSchema,

    currency:
      z.string(),

    openingAmount:
      z.number()
        .nonnegative(),

    expectedCashAmount:
      z.number()
        .nonnegative()
        .nullable(),

    countedCashAmount:
      z.number()
        .nonnegative()
        .nullable(),

    cashDifference:
      z.number()
        .nullable(),

    openingNotes:
      z.string()
        .nullable(),

    closingNotes:
      z.string()
        .nullable(),

    openedAt:
      z.string().datetime(),

    closedAt:
      z.string()
        .datetime()
        .nullable(),

    version:
      z.number()
        .int()
        .nonnegative(),
  });

export type CashSessionResponse =
  z.infer<
    typeof cashSessionResponseSchema
  >;

export const cashMovementRequestSchema =
  z.object({
    movementType:
      cashMovementTypeSchema,

    amount:
      z.number()
        .positive(
          "El monto debe ser mayor a cero.",
        ),

    reason:
      z.string()
        .trim()
        .min(
          1,
          "El motivo es obligatorio.",
        )
        .max(
          500,
          "El motivo es demasiado largo.",
        ),
  });

export type CashMovementRequest =
  z.infer<
    typeof cashMovementRequestSchema
  >;

export const cashMovementResponseSchema =
  z.object({
    id:
      dbIdSchema,

    cashSessionId:
      dbIdSchema,

    movementType:
      cashMovementTypeSchema,

    amount:
      z.number()
        .positive(),

    reason:
      z.string(),

    createdBy:
      dbIdSchema,

    createdAt:
      z.string().datetime(),
  });

export type CashMovementResponse =
  z.infer<
    typeof cashMovementResponseSchema
  >;

export const posSaleItemRequestSchema =
  z.object({
    variantId:
      dbIdSchema,

    quantity:
      z.number()
        .int()
        .min(
          1,
          "La cantidad debe ser mayor a cero.",
        )
        .max(
          99,
          "La cantidad máxima por línea es 99.",
        ),
  });

export type PosSaleItemRequest =
  z.infer<
    typeof posSaleItemRequestSchema
  >;

export const createPosSaleRequestSchema =
  z.object({
    clientOperationId:
      z.string().uuid(),

    clientCreatedAt:
      z.string()
        .datetime({
          offset:
            true,
        })
        .nullable()
        .optional(),

    cashSessionId:
      dbIdSchema,

    customerId:
      dbIdSchema
        .nullable()
        .optional(),

    paymentMethod:
      posPaymentMethodSchema,

    items:
      z.array(
        posSaleItemRequestSchema,
      )
        .min(
          1,
          "La venta debe contener productos.",
        )
        .max(
          100,
          "La venta contiene demasiadas líneas.",
        ),

    notes:
      z.string()
        .max(
          500,
          "Las observaciones son demasiado largas.",
        )
        .nullable()
        .optional(),
  });

export type CreatePosSaleRequest =
  z.infer<
    typeof createPosSaleRequestSchema
  >;

export const posSaleResponseSchema =
  z.object({
    orderId:
      dbIdSchema,

    orderNumber:
      z.string(),

    clientOperationId:
      z.string().uuid(),

    clientCreatedAt:
      z.string()
        .datetime()
        .nullable(),

    syncedAt:
      z.string().datetime(),

    orderChannel:
      z.literal("POS"),

    orderStatus:
      orderStatusSchema,

    pointOfSaleId:
      dbIdSchema,

    pointOfSaleCode:
      z.string(),

    cashSessionId:
      dbIdSchema,

    cashSessionNumber:
      z.string(),

    customerId:
      dbIdSchema
        .nullable(),

    paymentMethod:
      posPaymentMethodSchema,

    paymentId:
      dbIdSchema,

    paymentStatus:
      paymentStatusSchema,

    currency:
      z.string(),

    subtotal:
      z.number()
        .nonnegative(),

    total:
      z.number()
        .nonnegative(),

    createdAt:
      z.string().datetime(),

    items:
      z.array(
        orderItemResponseSchema,
      ),
  });

export type PosSaleResponse =
  z.infer<
    typeof posSaleResponseSchema
  >;

export const confirmPosPaymentRequestSchema =
  z.object({
    reason:
      z.string()
        .max(
          500,
          "El motivo es demasiado largo.",
        )
        .nullable()
        .optional(),
  });

export type ConfirmPosPaymentRequest =
  z.infer<
    typeof confirmPosPaymentRequestSchema
  >;

export const posPaymentResolutionResponseSchema =
  z.object({
    orderId:
      dbIdSchema,

    orderNumber:
      z.string(),

    orderStatus:
      orderStatusSchema,

    paymentId:
      dbIdSchema,

    paymentMethod:
      posPaymentMethodSchema,

    paymentStatus:
      paymentStatusSchema,

    total:
      z.number()
        .nonnegative(),

    currency:
      z.string(),

    resolvedAt:
      z.string().datetime(),
  });

export type PosPaymentResolutionResponse =
  z.infer<
    typeof posPaymentResolutionResponseSchema
  >;
