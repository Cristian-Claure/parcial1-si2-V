import {
  z,
} from "zod";

export const paymentMethodSchema =
  z.enum([
    "COD",
    "CASH",
    "CARD",
    "WEB",
    "QR",
  ]);

export type PaymentMethod =
  z.infer<
    typeof paymentMethodSchema
  >;

export const paymentStatusSchema =
  z.enum([
    "PENDING",
    "PAID",
    "FAILED",
    "CANCELLED",
    "REFUNDED",
  ]);

export type PaymentStatus =
  z.infer<
    typeof paymentStatusSchema
  >;

export const createPaymentRequestSchema =
  z.object({
    method:
      paymentMethodSchema,

    notes:
      z.string()
        .max(
          500,
          "Las observaciones son demasiado largas.",
        )
        .nullable()
        .optional(),
  });

export type CreatePaymentRequest =
  z.infer<
    typeof createPaymentRequestSchema
  >;

export const paymentActionRequestSchema =
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

export type PaymentActionRequest =
  z.infer<
    typeof paymentActionRequestSchema
  >;

export const paymentResponseSchema =
  z.object({
    id:
      z.string().uuid(),

    orderId:
      z.string().uuid(),

    orderNumber:
      z.string(),

    storeId:
      z.string().uuid(),

    storeName:
      z.string(),

    method:
      paymentMethodSchema,

    status:
      paymentStatusSchema,

    amount:
      z.number()
        .positive(),

    currency:
      z.string(),

    provider:
      z.string()
        .nullable(),

    externalReference:
      z.string()
        .nullable(),

    notes:
      z.string()
        .nullable(),

    processedById:
      z.string()
        .uuid()
        .nullable(),

    processedByName:
      z.string()
        .nullable(),

    createdAt:
      z.string().datetime(),

    paidAt:
      z.string()
        .datetime()
        .nullable(),

    failedAt:
      z.string()
        .datetime()
        .nullable(),

    cancelledAt:
      z.string()
        .datetime()
        .nullable(),

    refundedAt:
      z.string()
        .datetime()
        .nullable(),
  });

export type PaymentResponse =
  z.infer<
    typeof paymentResponseSchema
  >;

export const paymentHistoryResponseSchema =
  z.object({
    id:
      z.string().uuid(),

    fromStatus:
      paymentStatusSchema
        .nullable(),

    toStatus:
      paymentStatusSchema,

    changedById:
      z.string().uuid(),

    changedByName:
      z.string(),

    reason:
      z.string()
        .nullable(),

    createdAt:
      z.string().datetime(),
  });

export type PaymentHistoryResponse =
  z.infer<
    typeof paymentHistoryResponseSchema
  >;

export const stripeCheckoutResponseSchema =
  z.object({
    payment:
      paymentResponseSchema,

    checkoutUrl:
      z.string().url(),

    sessionId:
      z.string(),

    expiresAt:
      z.string()
        .datetime()
        .nullable(),
  });

export type StripeCheckoutResponse =
  z.infer<
    typeof stripeCheckoutResponseSchema
  >;
