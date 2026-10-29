import {
  z,
} from "zod";
import { dbIdSchema } from "./shared.js";

export const paymentMethodSchema =
  z.enum([
    "COD",
    "CASH",
    "CARD",
    "WEB",
    "QR",
    "TRANSFER",
  ]);

export type PaymentMethod =
  z.infer<
    typeof paymentMethodSchema
  >;

export const paymentStatusSchema =
  z.enum([
    "PENDING",
    "PENDING_REVIEW",
    "PAID",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
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
      dbIdSchema,

    orderId:
      dbIdSchema,

    orderNumber:
      z.string(),

    storeId:
      dbIdSchema,

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
      dbIdSchema
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
      dbIdSchema,

    fromStatus:
      paymentStatusSchema
        .nullable(),

    toStatus:
      paymentStatusSchema,

    changedById:
      dbIdSchema,

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

// ---------------------------------------------------------------------------
// Fase 5 · QR, cobro de planes (Stripe, QR, transferencia) y revisión
// ---------------------------------------------------------------------------

export const QR_CHARGE_TTL_MINUTES = 10;
export const TRANSFER_PROOF_MAX_BYTES = 5 * 1024 * 1024;

export const qrProviderSchema = z.enum(["DEMO", "OPENBCB", "BCP"]);
export type QrProvider = z.infer<typeof qrProviderSchema>;

/** Cargo QR: monto y moneda los fija el servidor; `payUrl` abre el "Banco demo" (solo DEMO). */
export const qrChargeSchema = z.object({
  paymentId: dbIdSchema,
  reference: z.string().regex(/^[0-9]{8,24}$/),
  provider: qrProviderSchema,
  demo: z.boolean(),
  status: paymentStatusSchema,
  amount: z.number().positive(),
  currency: z.string(),
  expiresAt: z.string().datetime(),
  secondsRemaining: z.number().int().nonnegative(),
  payUrl: z.string().nullable(),
  qrSvg: z.string().nullable(),
  qrPngDataUrl: z.string().nullable(),
});
export type QrCharge = z.infer<typeof qrChargeSchema>;

export const customerQrPaymentResponseSchema = z.object({ payment: paymentResponseSchema, qr: qrChargeSchema });
export type CustomerQrPaymentResponse = z.infer<typeof customerQrPaymentResponseSchema>;

/** Pantalla pública del "Banco demo": solo lo necesario para pagar (sin datos del cliente). */
export const publicQrChargeSchema = z.object({
  reference: z.string(),
  merchantName: z.string(),
  concept: z.string(),
  amount: z.number().positive(),
  currency: z.string(),
  status: paymentStatusSchema,
  expiresAt: z.string().datetime(),
  secondsRemaining: z.number().int().nonnegative(),
  demo: z.boolean(),
});
export type PublicQrCharge = z.infer<typeof publicQrChargeSchema>;

export const qrTokenRequestSchema = z.object({ token: z.string().min(16).max(200) });
export type QrTokenRequest = z.infer<typeof qrTokenRequestSchema>;

export const qrActionResponseSchema = z.object({ reference: z.string(), status: paymentStatusSchema, alreadyProcessed: z.boolean() });
export type QrActionResponse = z.infer<typeof qrActionResponseSchema>;

export const planPaymentMethodSchema = z.enum(["STRIPE", "QR", "TRANSFER"]);
export type PlanPaymentMethod = z.infer<typeof planPaymentMethodSchema>;

export const platformBillingSettingsSchema = z.object({
  bankName: z.string().trim().min(2).max(120),
  accountHolder: z.string().trim().min(2).max(160),
  accountType: z.string().trim().min(2).max(40),
  accountNumber: z.string().trim().min(4).max(40),
  taxId: z.string().trim().max(30).nullable(),
  instructions: z.string().trim().max(1000).nullable(),
});
export type PlatformBillingSettingsInput = z.infer<typeof platformBillingSettingsSchema>;

export const platformBillingSettingsResponseSchema = platformBillingSettingsSchema.extend({
  qrImageUrl: z.string().nullable(),
  isSample: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type PlatformBillingSettingsResponse = z.infer<typeof platformBillingSettingsResponseSchema>;

export const planPaymentOptionSchema = z.object({
  method: planPaymentMethodSchema,
  label: z.string(),
  enabled: z.boolean(),
  reason: z.string().nullable(),
});
export type PlanPaymentOption = z.infer<typeof planPaymentOptionSchema>;

export const planPaymentOptionsResponseSchema = z.object({
  methods: z.array(planPaymentOptionSchema),
  qrProvider: qrProviderSchema,
  transfer: platformBillingSettingsResponseSchema.nullable(),
});
export type PlanPaymentOptionsResponse = z.infer<typeof planPaymentOptionsResponseSchema>;

export const createPlanPaymentRequestSchema = z.object({
  planCode: z.enum(["FREE", "PLUS", "MAX"]),
  method: planPaymentMethodSchema,
});
export type CreatePlanPaymentRequest = z.infer<typeof createPlanPaymentRequestSchema>;

export const transferProofSchema = z.object({
  id: dbIdSchema,
  operationNumber: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  submittedAt: z.string().datetime(),
  decision: z.enum(["APPROVED", "REJECTED"]).nullable(),
  reviewedAt: z.string().datetime().nullable(),
  rejectionReason: z.string().nullable(),
});
export type TransferProof = z.infer<typeof transferProofSchema>;

export const planPaymentSchema = z.object({
  id: dbIdSchema,
  planCode: z.string(),
  planName: z.string(),
  method: paymentMethodSchema,
  provider: z.string().nullable(),
  status: paymentStatusSchema,
  amount: z.number().positive(),
  currency: z.string(),
  reference: z.string().nullable(),
  createdAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable(),
  /** Último motivo de rechazo de la transferencia (el propietario puede reenviar). */
  rejectionReason: z.string().nullable(),
  proofs: z.array(transferProofSchema),
  receiptAvailable: z.boolean(),
});
export type PlanPayment = z.infer<typeof planPaymentSchema>;

export const planPaymentResponseSchema = z.object({
  payment: planPaymentSchema,
  checkoutUrl: z.string().url().nullable(),
  qr: qrChargeSchema.nullable(),
  transfer: platformBillingSettingsResponseSchema.nullable(),
});
export type PlanPaymentResponse = z.infer<typeof planPaymentResponseSchema>;

export const transferProofFieldsSchema = z.object({
  operationNumber: z.string().trim().min(3, "Ingrese el número de operación.").max(60),
});
export type TransferProofFields = z.infer<typeof transferProofFieldsSchema>;

export const reviewPaymentRequestSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(500).nullable().optional(),
}).refine((value) => value.decision === "APPROVE" || (value.reason?.length ?? 0) >= 5, { message: "Indique el motivo del rechazo.", path: ["reason"] });
export type ReviewPaymentRequest = z.infer<typeof reviewPaymentRequestSchema>;

export const platformPaymentSchema = planPaymentSchema.extend({
  ownerUserId: dbIdSchema,
  ownerName: z.string(),
  ownerEmail: z.string(),
});
export type PlatformPayment = z.infer<typeof platformPaymentSchema>;

export const platformPaymentsQuerySchema = z.object({
  status: paymentStatusSchema.optional(),
  method: z.enum(["WEB", "QR", "TRANSFER", "CARD"]).optional(),
});
export type PlatformPaymentsQuery = z.infer<typeof platformPaymentsQuerySchema>;
