import { randomInt, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  TRANSFER_PROOF_MAX_BYTES, type CreatePlanPaymentRequest, type PlanPayment, type PlanPaymentMethod, type PlanPaymentOptionsResponse, type PlanPaymentResponse,
} from "@velora/contracts";
import { appUsers, payments, paymentTransferProofs, plans, subscriptions, type PaymentRow, type PlanRow } from "@velora/database";
import { PaymentSettlementService, type BillingTransaction } from "../billing/payment-settlement.service.js";
import { QrChargeService } from "../billing/qr-charge.service.js";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { detectImageContentType } from "../common/media/image-validation.js";
import { DatabaseService } from "../database/database.service.js";
import { StripePaymentGateway } from "../payments/stripe-payment.gateway.js";
import { StripePlanService } from "../payments/stripe-plan.service.js";
import { PlanLimitsService } from "../plans/plan-limits.service.js";
import { ManagedAssetStorageService, type ManagedAssetContentType } from "../storage/managed-asset-storage.service.js";
import { PlatformBillingService } from "./platform-billing.service.js";
import { methodLabel, toProofDto } from "./plan-payment-dto.js";
import { renderPlanReceipt } from "./plan-receipt.js";

export interface UploadedProofFile { buffer: Buffer; mimetype: string; originalname: string; size: number }

const METHOD_FOR: Record<PlanPaymentMethod, PaymentRow["method"]> = { STRIPE: "WEB", QR: "QR", TRANSFER: "TRANSFER" };

/** Tipo real del comprobante por su firma de bytes (no por la extensión ni el tipo declarado). */
export function detectProofContentType(bytes: Buffer): ManagedAssetContentType {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return detectImageContentType(bytes, "El comprobante", 415);
}

/** Glosa de transferencia: TRM + AAMMDD + 6 dígitos (única por índice). */
export function newTransferReference(now = new Date()): string {
  return `TRM${now.toISOString().slice(2, 10).replaceAll("-", "")}${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
}

/**
 * Cobro de planes (Fase 5): el propietario elige Tarjeta (Stripe Checkout), QR o transferencia.
 * El plan cambia ÚNICAMENTE cuando el pago llega a PAID (PaymentSettlementService).
 */
@Injectable()
export class PlanPaymentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly limits: PlanLimitsService,
    private readonly settlement: PaymentSettlementService,
    private readonly qr: QrChargeService,
    private readonly stripe: StripePaymentGateway,
    private readonly stripePlans: StripePlanService,
    private readonly storage: ManagedAssetStorageService,
    private readonly platformBilling: PlatformBillingService,
    private readonly config: RuntimeConfigService,
  ) {}

  async options(): Promise<PlanPaymentOptionsResponse> {
    const qr = this.qr.readiness();
    const stripeReady = await this.stripe.checkout.isUsable();
    return {
      methods: [
        { method: "STRIPE", label: "Tarjeta (Stripe)", enabled: stripeReady, reason: stripeReady ? null : "Tarjeta no configurada: falta una STRIPE_SECRET_KEY válida y vigente." },
        { method: "QR", label: this.qr.gateway.demo ? "QR (modo demostración)" : "QR", enabled: qr.ready, reason: qr.reason },
        { method: "TRANSFER", label: "Transferencia bancaria", enabled: true, reason: null },
      ],
      qrProvider: this.qr.gateway.provider,
      transfer: await this.platformBilling.settings(),
    };
  }

  async create(ownerUserId: string, request: CreatePlanPaymentRequest): Promise<PlanPaymentResponse> {
    const target = await this.limits.validatePlanChange(ownerUserId, request.planCode, { allowRenewal: true });
    if (Number(target.priceMonthly) <= 0) throw new ApiHttpError(400, "El plan gratuito no requiere pago: usa \"Cambiar\".");
    const option = (await this.options()).methods.find((entry) => entry.method === request.method)!;
    if (!option.enabled) throw ApiHttpError.coded(503, "PAYMENT_METHOD_NOT_CONFIGURED", option.reason ?? "Método de pago no disponible.");

    const paymentId = await this.database.db.transaction(async (tx) => {
      const subscriptionId = await this.ensureSubscription(tx, ownerUserId);
      const open = await tx.select({ id: payments.id, status: payments.status }).from(payments)
        .where(and(eq(payments.subscriptionId, subscriptionId), inArray(payments.status, ["PENDING", "PENDING_REVIEW"]))).for("update");
      if (open.some((row) => row.status === "PENDING_REVIEW")) {
        throw ApiHttpError.coded(409, "TRANSFER_IN_REVIEW", "Tienes una transferencia en revisión. Espera la respuesta antes de iniciar otro pago.");
      }
      for (const row of open) await this.settlement.transition(tx, row.id, ["PENDING"], "CANCELLED", ownerUserId, "Reemplazado por un nuevo intento de pago.");

      const now = new Date();
      const id = randomUUID();
      await tx.insert(payments).values({
        id, orderId: null, subscriptionId, planId: target.id, method: METHOD_FOR[request.method], status: "PENDING", amount: target.priceMonthly, currency: target.currency,
        provider: request.method === "TRANSFER" ? "TRANSFER" : null, externalReference: null,
        paymentReference: request.method === "TRANSFER" ? newTransferReference(now) : null,
        notes: `Plan ${target.name} · 30 días`, createdBy: ownerUserId, processedBy: null, paidAt: null, failedAt: null, cancelledAt: null, refundedAt: null, createdAt: now, updatedAt: now,
      });
      await this.settlement.history(tx, id, null, "PENDING", ownerUserId, `Pago del plan ${target.name} iniciado (${option.label}).`, now);
      if (request.method === "QR") await this.qr.createForPayment(tx, { id, amount: target.priceMonthly, currency: target.currency }, `Plan ${target.name}`);
      return id;
    });

    let checkoutUrl: string | null = null;
    if (request.method === "STRIPE") checkoutUrl = await this.startStripe(paymentId, target);
    return { ...(await this.response(ownerUserId, paymentId)), checkoutUrl };
  }

  async list(ownerUserId: string): Promise<PlanPayment[]> {
    const rows = await this.baseQuery().where(eq(subscriptions.ownerUserId, ownerUserId)).orderBy(desc(payments.createdAt)).limit(100);
    return this.toDtos(rows);
  }

  /** Estado de un pago del propietario; un PENDING se refresca (QR perezoso o consulta a Stripe). */
  async get(ownerUserId: string, paymentId: string): Promise<PlanPaymentResponse> {
    const payment = await this.requireOwned(ownerUserId, paymentId);
    if (payment.status === "PENDING") {
      if (payment.method === "QR") await this.qr.refresh(payment.id);
      if (payment.provider === "STRIPE" && payment.externalReference && this.stripe.checkout.isConfigured()) {
        await this.stripePlans.reconcile(payment.externalReference, "CONSULTA").catch(() => "PENDING");
      }
    }
    return this.response(ownerUserId, paymentId);
  }

  async cancel(ownerUserId: string, paymentId: string): Promise<PlanPaymentResponse> {
    await this.requireOwned(ownerUserId, paymentId);
    await this.database.db.transaction((tx) => this.settlement.transition(tx, paymentId, ["PENDING"], "CANCELLED", ownerUserId, "Pago cancelado por el propietario."));
    return this.response(ownerUserId, paymentId);
  }

  /** Comprobante de transferencia (imagen o PDF ≤ 5 MB, tipo real por firma) → PENDING_REVIEW. */
  async submitProof(ownerUserId: string, paymentId: string, file: UploadedProofFile | undefined, operationNumber: string): Promise<PlanPaymentResponse> {
    const payment = await this.requireOwned(ownerUserId, paymentId);
    if (payment.method !== "TRANSFER") throw new ApiHttpError(409, "Solo los pagos por transferencia llevan comprobante.");
    if (payment.status !== "PENDING") throw ApiHttpError.coded(409, "PAYMENT_STATE_CONFLICT", "Este pago no espera un comprobante.", { status: payment.status });
    if (!file || file.size === 0) throw new ApiHttpError(400, "Adjunte el comprobante (imagen o PDF).");
    if (file.size > TRANSFER_PROOF_MAX_BYTES) throw new ApiHttpError(413, "El comprobante supera 5 MB.");
    const contentType = detectProofContentType(file.buffer);
    const stored = await this.storage.store(file.buffer, contentType);
    try {
      await this.database.db.transaction(async (tx) => {
        await this.settlement.transition(tx, paymentId, ["PENDING"], "PENDING_REVIEW", ownerUserId, `Comprobante enviado (operación ${operationNumber}).`);
        await tx.insert(paymentTransferProofs).values({
          id: randomUUID(), paymentId, storageKey: stored.storageKey, contentType, sizeBytes: stored.sizeBytes, operationNumber,
          submittedBy: ownerUserId, submittedAt: new Date(), decision: null, reviewedBy: null, reviewedAt: null, rejectionReason: null,
        });
      });
    } catch (error) {
      await this.storage.delete(stored.storageKey).catch(() => undefined);
      throw error;
    }
    return this.response(ownerUserId, paymentId);
  }

  async receipt(ownerUserId: string, paymentId: string): Promise<{ filename: string; pdf: Buffer }> {
    await this.requireOwned(ownerUserId, paymentId);
    const row = (await this.baseQuery().where(eq(payments.id, paymentId)).limit(1))[0]!;
    if (row.payment.status !== "PAID") throw new ApiHttpError(409, "El comprobante solo existe para pagos confirmados.");
    const owner = (await this.database.db.select({ firstName: appUsers.firstName, lastName: appUsers.lastName, email: appUsers.email }).from(appUsers).where(eq(appUsers.id, ownerUserId)).limit(1))[0]!;
    const pdf = await renderPlanReceipt({
      number: row.payment.paymentReference ?? row.payment.id.slice(0, 8).toUpperCase(), paidAt: row.payment.paidAt!, ownerName: `${owner.firstName} ${owner.lastName}`.trim(), ownerEmail: owner.email ?? "",
      planName: row.planName, method: methodLabel(row.payment), amount: row.payment.amount, currency: row.payment.currency, paymentId: row.payment.id,
    });
    return { filename: `comprobante-${row.payment.paymentReference ?? row.payment.id.slice(0, 8)}.pdf`, pdf };
  }

  // ----------------------------------------------------------------------------------------------

  async response(ownerUserId: string, paymentId: string): Promise<PlanPaymentResponse> {
    const row = (await this.baseQuery().where(and(eq(payments.id, paymentId), eq(subscriptions.ownerUserId, ownerUserId))).limit(1))[0];
    if (!row) throw new ApiHttpError(404, "Pago no encontrado.");
    const [payment] = await this.toDtos([row]);
    const qrCharge = row.payment.method === "QR" ? await this.qr.findByPayment(row.payment.id) : null;
    return {
      payment: payment!,
      checkoutUrl: null,
      qr: qrCharge ? await this.qr.view(row.payment.id) : null,
      transfer: row.payment.method === "TRANSFER" ? await this.platformBilling.settings() : null,
    };
  }

  baseQuery() {
    return this.database.db.select({ payment: payments, planCode: plans.code, planName: plans.name, ownerUserId: subscriptions.ownerUserId })
      .from(payments).innerJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId)).innerJoin(plans, eq(plans.id, payments.planId)).$dynamic();
  }

  async toDtos(rows: { payment: PaymentRow; planCode: string; planName: string }[]): Promise<PlanPayment[]> {
    const ids = rows.map((row) => row.payment.id);
    const proofs = ids.length ? await this.database.db.select().from(paymentTransferProofs).where(inArray(paymentTransferProofs.paymentId, ids)).orderBy(desc(paymentTransferProofs.submittedAt)) : [];
    return rows.map(({ payment, planCode, planName }) => {
      const own = proofs.filter((proof) => proof.paymentId === payment.id);
      const lastRejected = payment.status === "PENDING" ? own.find((proof) => proof.decision === "REJECTED") ?? null : null;
      return {
        id: payment.id, planCode, planName, method: payment.method, provider: payment.provider, status: payment.status, amount: Number(payment.amount), currency: payment.currency,
        reference: payment.paymentReference, createdAt: payment.createdAt.toISOString(), paidAt: payment.paidAt?.toISOString() ?? null,
        rejectionReason: lastRejected?.rejectionReason ?? null, proofs: own.map(toProofDto), receiptAvailable: payment.status === "PAID",
      };
    });
  }

  private async startStripe(paymentId: string, plan: PlanRow): Promise<string> {
    const web = this.config.value.VELORA_PUBLIC_WEB_URL;
    try {
      const session = await this.stripe.checkout.createPlanCheckoutSession({
        paymentId, planName: plan.name, amount: plan.priceMonthly, currency: plan.currency,
        successUrl: `${web}/admin/mi-plan?pago=${paymentId}&stripe=ok`, cancelUrl: `${web}/admin/mi-plan?pago=${paymentId}&stripe=cancelado`,
      });
      await this.database.db.update(payments).set({ provider: "STRIPE", externalReference: session.id, updatedAt: new Date() }).where(eq(payments.id, paymentId));
      return session.url;
    } catch (error) {
      await this.database.db.transaction((tx) => this.settlement.transition(tx, paymentId, ["PENDING"], "FAILED", null, "No se pudo iniciar la sesión de Stripe."));
      throw error;
    }
  }

  private async requireOwned(ownerUserId: string, paymentId: string): Promise<PaymentRow> {
    const row = (await this.baseQuery().where(and(eq(payments.id, paymentId), eq(subscriptions.ownerUserId, ownerUserId))).limit(1))[0];
    if (!row) throw new ApiHttpError(404, "Pago no encontrado.");
    return row.payment;
  }

  /** Suscripción vigente del propietario; si no tiene, una FREE (equivale a no tener plan). */
  private async ensureSubscription(tx: BillingTransaction, ownerUserId: string): Promise<string> {
    await tx.execute(sql`select id from app_users where id = ${ownerUserId} for update`);
    const current = await tx.select({ id: subscriptions.id }).from(subscriptions)
      .where(and(eq(subscriptions.ownerUserId, ownerUserId), isNull(subscriptions.companyId), ne(subscriptions.status, "CANCELLED"))).limit(1);
    if (current[0]) return current[0].id;
    const free = (await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, "FREE")).limit(1))[0];
    if (!free) throw new ApiHttpError(500, "Falta el plan FREE.");
    const id = randomUUID();
    const now = new Date();
    await tx.insert(subscriptions).values({ id, ownerUserId, companyId: null, planId: free.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: null, grandfathered: false, cancelledAt: null, createdAt: now, updatedAt: now });
    return id;
  }
}
