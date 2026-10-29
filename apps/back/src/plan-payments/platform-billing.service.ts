import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { PlatformBillingSettingsInput, PlatformBillingSettingsResponse, PlatformPayment, PlatformPaymentsQuery, ReviewPaymentRequest } from "@velora/contracts";
import { appUsers, payments, paymentTransferProofs, plans, platformBillingSettings, subscriptions } from "@velora/database";
import { PaymentSettlementService } from "../billing/payment-settlement.service.js";
import type { ActorAccessContext } from "../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { validateImageBuffer } from "../common/media/image-validation.js";
import { DatabaseService } from "../database/database.service.js";
import { ManagedAssetStorageService, type LoadedManagedAsset } from "../storage/managed-asset-storage.service.js";
import { toProofDto } from "./plan-payment-dto.js";

const QR_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Datos de cobro por transferencia, cola de revisión y acceso privado a comprobantes. */
@Injectable()
export class PlatformBillingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly settlement: PaymentSettlementService,
    private readonly storage: ManagedAssetStorageService,
  ) {}

  async settings(): Promise<PlatformBillingSettingsResponse> {
    const row = (await this.database.db.select().from(platformBillingSettings).where(eq(platformBillingSettings.id, 1)).limit(1))[0];
    if (!row) throw new ApiHttpError(500, "Faltan los datos de cobro de la plataforma.");
    return {
      bankName: row.bankName, accountHolder: row.accountHolder, accountType: row.accountType, accountNumber: row.accountNumber, taxId: row.taxId, instructions: row.instructions,
      qrImageUrl: row.qrStorageKey ? `/api/billing/transfer-qr/${row.qrStorageKey}` : null, isSample: row.isSample, updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateSettings(actorUserId: string, input: PlatformBillingSettingsInput): Promise<PlatformBillingSettingsResponse> {
    await this.database.db.update(platformBillingSettings).set({ ...input, isSample: false, updatedBy: actorUserId, updatedAt: new Date() }).where(eq(platformBillingSettings.id, 1));
    return this.settings();
  }

  async replaceQrImage(actorUserId: string, file: { buffer: Buffer; mimetype: string } | null): Promise<PlatformBillingSettingsResponse> {
    const previous = (await this.database.db.select({ key: platformBillingSettings.qrStorageKey }).from(platformBillingSettings).where(eq(platformBillingSettings.id, 1)).limit(1))[0]?.key ?? null;
    let key: string | null = null;
    if (file) {
      const image = validateImageBuffer(file.buffer, file.mimetype, "La imagen del QR", QR_IMAGE_MAX_BYTES);
      key = (await this.storage.store(image.bytes, image.contentType)).storageKey;
    }
    await this.database.db.update(platformBillingSettings).set({ qrStorageKey: key, updatedBy: actorUserId, updatedAt: new Date() }).where(eq(platformBillingSettings.id, 1));
    if (previous) await this.storage.delete(previous).catch(() => undefined);
    return this.settings();
  }

  /** El QR estático de la cuenta es público por diseño (se muestra a quien paga); solo se sirve la clave vigente. */
  async transferQrImage(storageKey: string): Promise<LoadedManagedAsset> {
    const current = (await this.database.db.select({ key: platformBillingSettings.qrStorageKey }).from(platformBillingSettings).where(eq(platformBillingSettings.id, 1)).limit(1))[0]?.key;
    if (!current || current !== storageKey) throw new ApiHttpError(404, "Imagen no encontrada.");
    return this.storage.load(storageKey);
  }

  async queue(query: PlatformPaymentsQuery, paymentId?: string): Promise<PlatformPayment[]> {
    const filters = [];
    if (query.status) filters.push(eq(payments.status, query.status));
    if (query.method) filters.push(eq(payments.method, query.method));
    if (paymentId) filters.push(eq(payments.id, paymentId));
    const rows = await this.database.db.select({
      payment: payments, planCode: plans.code, planName: plans.name, ownerUserId: subscriptions.ownerUserId,
      firstName: appUsers.firstName, lastName: appUsers.lastName, email: appUsers.email,
    }).from(payments).innerJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId)).innerJoin(plans, eq(plans.id, payments.planId))
      .innerJoin(appUsers, eq(appUsers.id, subscriptions.ownerUserId))
      .where(filters.length ? and(...filters) : undefined).orderBy(desc(payments.createdAt)).limit(200);
    const ids = rows.map((row) => row.payment.id);
    const proofs = ids.length ? await this.database.db.select().from(paymentTransferProofs).where(inArray(paymentTransferProofs.paymentId, ids)).orderBy(desc(paymentTransferProofs.submittedAt)) : [];
    return rows.map((row) => {
      const own = proofs.filter((proof) => proof.paymentId === row.payment.id);
      const lastRejected = row.payment.status === "PENDING" ? own.find((proof) => proof.decision === "REJECTED") ?? null : null;
      return {
        id: row.payment.id, planCode: row.planCode, planName: row.planName, method: row.payment.method, provider: row.payment.provider, status: row.payment.status,
        amount: Number(row.payment.amount), currency: row.payment.currency, reference: row.payment.paymentReference, createdAt: row.payment.createdAt.toISOString(),
        paidAt: row.payment.paidAt?.toISOString() ?? null, rejectionReason: lastRejected?.rejectionReason ?? null, proofs: own.map(toProofDto), receiptAvailable: row.payment.status === "PAID",
        ownerUserId: row.ownerUserId, ownerName: `${row.firstName} ${row.lastName}`.trim(), ownerEmail: row.email ?? "",
      };
    });
  }

  /** Aprobar → PAID y se activa el plan; rechazar → vuelve a PENDING con el motivo (el propietario reenvía). */
  async review(actorUserId: string, paymentId: string, request: ReviewPaymentRequest): Promise<PlatformPayment> {
    await this.database.db.transaction(async (tx) => {
      const payment = await this.settlement.lock(tx, paymentId);
      if (!payment.subscriptionId || payment.method !== "TRANSFER") throw new ApiHttpError(404, "Pago de transferencia no encontrado.");
      if (payment.status !== "PENDING_REVIEW") throw ApiHttpError.coded(409, "PAYMENT_STATE_CONFLICT", "Este pago no está en revisión.", { status: payment.status });
      const proof = (await tx.select().from(paymentTransferProofs).where(eq(paymentTransferProofs.paymentId, paymentId)).orderBy(desc(paymentTransferProofs.submittedAt)).limit(1))[0];
      if (!proof) throw new ApiHttpError(409, "El pago no tiene comprobante.");
      const now = new Date();
      if (request.decision === "APPROVE") {
        await this.settlement.markPaid(tx, paymentId, actorUserId, `Transferencia aprobada (operación ${proof.operationNumber}).`);
        await tx.update(paymentTransferProofs).set({ decision: "APPROVED", reviewedBy: actorUserId, reviewedAt: now }).where(eq(paymentTransferProofs.id, proof.id));
      } else {
        const reason = request.reason!.trim();
        await this.settlement.transition(tx, paymentId, ["PENDING_REVIEW"], "PENDING", actorUserId, `Transferencia rechazada: ${reason}`);
        await tx.update(paymentTransferProofs).set({ decision: "REJECTED", reviewedBy: actorUserId, reviewedAt: now, rejectionReason: reason }).where(eq(paymentTransferProofs.id, proof.id));
      }
    });
    const [updated] = await this.queue({}, paymentId);
    return updated!;
  }

  /**
   * Comprobante privado: solo el propietario del pago (ADMIN) o PLATFORM_ADMIN. Para cualquier otro,
   * 404 (no se revela que existe). El actor llega resuelto desde TenantScopeService.
   */
  async proof(actor: ActorAccessContext, paymentId: string, proofId?: string): Promise<LoadedManagedAsset> {
    const row = (await this.database.db.select({ ownerUserId: subscriptions.ownerUserId }).from(payments).innerJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId))
      .where(eq(payments.id, paymentId)).limit(1))[0];
    const allowed = row && (actor.role === "PLATFORM_ADMIN" || (actor.role === "ADMIN" && row.ownerUserId === actor.userId));
    if (!allowed) throw new ApiHttpError(404, "Comprobante no encontrado.");
    const filters = [eq(paymentTransferProofs.paymentId, paymentId)];
    if (proofId) filters.push(eq(paymentTransferProofs.id, proofId));
    const proof = (await this.database.db.select().from(paymentTransferProofs).where(and(...filters)).orderBy(desc(paymentTransferProofs.submittedAt)).limit(1))[0];
    if (!proof) throw new ApiHttpError(404, "Comprobante no encontrado.");
    return this.storage.load(proof.storageKey);
  }
}
