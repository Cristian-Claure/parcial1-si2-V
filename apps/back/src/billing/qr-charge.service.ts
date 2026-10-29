import { createHash, randomInt, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { QR_CHARGE_TTL_MINUTES, type PublicQrCharge, type QrActionResponse, type QrCharge } from "@velora/contracts";
import { payments, qrCharges, type PaymentRow, type QrChargeRow } from "@velora/database";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { DatabaseService } from "../database/database.service.js";
import { PaymentSettlementService, type BillingTransaction } from "./payment-settlement.service.js";
import { constantTimeEquals, DemoQrGateway, QR_PAYMENT_GATEWAY, type QrChargeContext, type QrPaymentGateway } from "./qr/qr-gateway.js";
import { renderQrPngDataUrl, renderQrSvg } from "./qr/qr-image.js";

const MAX_POLL_DELAY_MS = 30_000;
const PAY_WINDOW_SECONDS = 600;
const PAY_MAX_ATTEMPTS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Backoff exponencial de la consulta de estado al banco: 2 s, 4 s, 8 s… hasta 30 s. */
export function pollDelayMs(attempts: number): number {
  return Math.min(MAX_POLL_DELAY_MS, 2000 * 2 ** Math.max(0, attempts));
}

/** Referencia numérica única: AAMMDD + 8 dígitos aleatorios. */
export function newQrReference(now = new Date()): string {
  const date = now.toISOString().slice(2, 10).replaceAll("-", "");
  return `${date}${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
}

/** Límite de intentos por IP en las rutas públicas del QR (en memoria, por proceso). */
export class PayAttemptLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();
  constructor(private readonly max = PAY_MAX_ATTEMPTS, private readonly windowSeconds = PAY_WINDOW_SECONDS) {}

  register(ip: string): void {
    const now = Math.floor(Date.now() / 1000);
    const current = this.windows.get(ip);
    if (!current || now - current.startedAt >= this.windowSeconds) {
      this.windows.set(ip, { startedAt: now, count: 1 });
      if (this.windows.size > 5000) for (const [key, value] of this.windows) if (now - value.startedAt >= this.windowSeconds) this.windows.delete(key);
      return;
    }
    current.count += 1;
    if (current.count > this.max) {
      throw ApiHttpError.coded(429, "QR_RATE_LIMITED", "Demasiados intentos. Espere unos minutos.", { retryAfterSeconds: this.windowSeconds - (now - current.startedAt) });
    }
  }
}

interface ChargeWithPayment { charge: QrChargeRow; payment: PaymentRow }

@Injectable()
export class QrChargeService {
  readonly limiter = new PayAttemptLimiter();

  constructor(
    private readonly database: DatabaseService,
    private readonly settlement: PaymentSettlementService,
    @Inject(QR_PAYMENT_GATEWAY) readonly gateway: QrPaymentGateway,
  ) {}

  readiness() {
    return this.gateway.readiness();
  }

  /** Crea el cargo QR de un pago PENDING (dentro de la transacción que crea el pago). */
  async createForPayment(tx: BillingTransaction, payment: { id: string; amount: string; currency: string }, description: string, reference = newQrReference()): Promise<QrChargeRow> {
    const readiness = this.gateway.readiness();
    if (!readiness.ready) throw ApiHttpError.coded(503, "QR_PROVIDER_NOT_READY", readiness.reason ?? "QR no disponible.");
    const now = new Date();
    const context: QrChargeContext = {
      chargeId: randomUUID(), reference, amount: payment.amount, currency: payment.currency,
      expiresAt: new Date(now.getTime() + QR_CHARGE_TTL_MINUTES * 60_000), description,
    };
    const created = await this.gateway.createCharge(context);
    const tokenHash = this.gateway instanceof DemoQrGateway ? hashToken(this.gateway.token(context)) : hashToken(randomUUID());
    const rows = await tx.insert(qrCharges).values({
      id: context.chargeId, paymentId: payment.id, provider: this.gateway.provider, reference, amount: payment.amount, currency: payment.currency,
      tokenHash, expiresAt: context.expiresAt, consumedAt: null, providerChargeId: created.providerChargeId, providerQrPayload: created.providerQrPayload,
      pollAttempts: 0, nextPollAt: this.gateway.demo ? null : now, createdAt: now, updatedAt: now,
    }).returning();
    await tx.update(payments).set({ provider: `QR_${this.gateway.provider}`, externalReference: reference, paymentReference: reference, updatedAt: now }).where(eq(payments.id, payment.id));
    return rows[0]!;
  }

  /** Estado del cargo para su dueño: aplica vencimiento perezoso y, con banco real, consulta con backoff. */
  async view(paymentId: string): Promise<QrCharge> {
    await this.refresh(paymentId);
    const found = await this.byPayment(paymentId);
    if (!found) throw new ApiHttpError(404, "El pago no tiene un QR.");
    return this.toDto(found);
  }

  async findByPayment(paymentId: string): Promise<QrChargeRow | null> {
    return (await this.database.db.select().from(qrCharges).where(eq(qrCharges.paymentId, paymentId)).limit(1))[0] ?? null;
  }

  /** Vence (perezoso) o consulta al proveedor un cargo PENDING. Seguro de llamar en cada lectura. */
  async refresh(paymentId: string): Promise<void> {
    const found = await this.byPayment(paymentId);
    if (!found || found.payment.status !== "PENDING") return;
    const now = new Date();
    if (found.charge.expiresAt <= now) {
      await this.database.db.transaction(async (tx) => {
        const locked = await this.settlement.lock(tx, paymentId);
        if (locked.status === "PENDING") await this.settlement.transition(tx, paymentId, ["PENDING"], "EXPIRED", null, `QR vencido (${QR_CHARGE_TTL_MINUTES} minutos sin pago).`);
      });
      return;
    }
    if (this.gateway.demo || !found.charge.providerChargeId || (found.charge.nextPollAt && found.charge.nextPollAt > now)) return;
    const attempts = found.charge.pollAttempts + 1;
    await this.database.db.update(qrCharges).set({ pollAttempts: attempts, nextPollAt: new Date(now.getTime() + pollDelayMs(attempts)), updatedAt: now }).where(eq(qrCharges.id, found.charge.id));
    const remote = await this.gateway.queryStatus(found.charge.providerChargeId).catch(() => "PENDING" as const);
    if (remote === "PENDING") return;
    await this.database.db.transaction(async (tx) => {
      if (remote === "PAID") {
        await this.settlement.markPaid(tx, paymentId, null, `Pago confirmado por consulta de estado a ${this.gateway.provider}.`);
        await tx.update(qrCharges).set({ consumedAt: now, updatedAt: now }).where(eq(qrCharges.id, found.charge.id));
      } else {
        await this.settlement.transition(tx, paymentId, ["PENDING"], remote, null, `${this.gateway.provider} informó ${remote}.`);
      }
    });
  }

  // ---------------------------------------------------------------- Banco demo (público, con token)

  async publicView(reference: string, token: string, ip: string): Promise<PublicQrCharge> {
    this.limiter.register(ip);
    const found = await this.byReference(reference);
    this.assertToken(found, token);
    await this.refresh(found.payment.id);
    const fresh = (await this.byReference(reference))!;
    if (fresh.payment.status === "EXPIRED") throw ApiHttpError.coded(410, "QR_EXPIRED", "Este QR venció. Genere uno nuevo desde la tienda.");
    const label = await this.labels(fresh.payment);
    return {
      reference, merchantName: label.merchant, concept: label.concept, amount: Number(fresh.charge.amount), currency: fresh.charge.currency,
      status: fresh.payment.status, expiresAt: fresh.charge.expiresAt.toISOString(), secondsRemaining: this.secondsRemaining(fresh.charge), demo: true,
    };
  }

  /** Confirma (Pagar) o rechaza (Cancelar) desde el Banco demo. Token de un solo uso, idempotente. */
  async act(reference: string, token: string, ip: string, action: "PAY" | "CANCEL"): Promise<QrActionResponse> {
    this.limiter.register(ip);
    const found = await this.byReference(reference);
    this.assertToken(found, token);
    // El vencimiento perezoso se confirma en su propia transacción antes de responder 410.
    await this.refresh(found.payment.id);
    return this.database.db.transaction(async (tx) => {
      const payment = await this.settlement.lock(tx, found.payment.id);
      const charge = (await tx.select().from(qrCharges).where(eq(qrCharges.id, found.charge.id)).limit(1))[0]!;
      const target = action === "PAY" ? "PAID" : "CANCELLED";
      if (charge.consumedAt) {
        if (payment.status === target) return { reference, status: payment.status, alreadyProcessed: true };
        throw ApiHttpError.coded(409, "QR_ALREADY_USED", "Este QR ya fue utilizado.", { status: payment.status });
      }
      if (payment.status !== "PENDING") {
        if (payment.status === "EXPIRED") throw ApiHttpError.coded(410, "QR_EXPIRED", "Este QR venció. Genere uno nuevo desde la tienda.");
        throw ApiHttpError.coded(409, "QR_ALREADY_USED", "Este pago ya no está pendiente.", { status: payment.status });
      }
      const now = new Date();
      if (charge.expiresAt <= now) throw ApiHttpError.coded(410, "QR_EXPIRED", "Este QR venció. Genere uno nuevo desde la tienda.");
      if (action === "PAY") await this.settlement.markPaid(tx, payment.id, null, "Pago QR confirmado en el Banco demo.");
      else await this.settlement.transition(tx, payment.id, ["PENDING"], "CANCELLED", null, "Pago QR rechazado en el Banco demo.");
      await tx.update(qrCharges).set({ consumedAt: now, updatedAt: now }).where(eq(qrCharges.id, charge.id));
      return { reference, status: target, alreadyProcessed: false };
    });
  }

  /** Reembolso simulado (DEMO) o del proveedor. */
  async refund(paymentId: string): Promise<{ refundId: string }> {
    const found = await this.byPayment(paymentId);
    if (!found || found.payment.status !== "PAID") throw new ApiHttpError(409, "Solo se reembolsan pagos QR confirmados.");
    return this.gateway.refund(found.charge.providerChargeId, found.charge.amount);
  }

  toDto({ charge, payment }: ChargeWithPayment): QrCharge {
    const pending = payment.status === "PENDING";
    const context = this.context(charge);
    const text = pending ? this.gateway.qrText(context, charge.providerQrPayload) : null;
    return {
      paymentId: payment.id, reference: charge.reference, provider: charge.provider, demo: charge.provider === "DEMO", status: payment.status,
      amount: Number(charge.amount), currency: charge.currency, expiresAt: charge.expiresAt.toISOString(), secondsRemaining: pending ? this.secondsRemaining(charge) : 0,
      payUrl: text && charge.provider === "DEMO" ? text : null,
      qrSvg: text ? renderQrSvg(text) : null,
      qrPngDataUrl: text ? renderQrPngDataUrl(text) : null,
    };
  }

  // ----------------------------------------------------------------------------------------------

  private context(charge: QrChargeRow): QrChargeContext {
    return { chargeId: charge.id, reference: charge.reference, amount: charge.amount, currency: charge.currency, expiresAt: charge.expiresAt, description: "" };
  }

  private secondsRemaining(charge: QrChargeRow): number {
    return Math.max(0, Math.floor((charge.expiresAt.getTime() - Date.now()) / 1000));
  }

  /** 403 si el token no corresponde al cargo (firma HMAC recalculada + hash guardado, ambos en tiempo constante). */
  private assertToken(found: ChargeWithPayment | null, token: string): asserts found is ChargeWithPayment {
    if (!found || found.charge.provider !== "DEMO" || !(this.gateway instanceof DemoQrGateway)) throw ApiHttpError.coded(403, "QR_TOKEN_INVALID", "El enlace de pago no es válido.");
    const signatureOk = this.gateway.verifyToken(this.context(found.charge), token);
    const hashOk = constantTimeEquals(hashToken(token), found.charge.tokenHash);
    if (!signatureOk || !hashOk) throw ApiHttpError.coded(403, "QR_TOKEN_INVALID", "El enlace de pago no es válido.");
  }

  private async byPayment(paymentId: string): Promise<ChargeWithPayment | null> {
    const rows = await this.database.db.select({ charge: qrCharges, payment: payments }).from(qrCharges).innerJoin(payments, eq(payments.id, qrCharges.paymentId)).where(eq(qrCharges.paymentId, paymentId)).limit(1);
    return rows[0] ?? null;
  }

  private async byReference(reference: string): Promise<ChargeWithPayment | null> {
    if (!/^[0-9]{8,24}$/.test(reference)) return null;
    const rows = await this.database.db.select({ charge: qrCharges, payment: payments }).from(qrCharges).innerJoin(payments, eq(payments.id, qrCharges.paymentId)).where(eq(qrCharges.reference, reference)).limit(1);
    return rows[0] ?? null;
  }

  private async labels(payment: PaymentRow): Promise<{ merchant: string; concept: string }> {
    if (payment.orderId) {
      const rows = await this.database.db.execute<{ merchant: string; order_number: string }>(sql`
        select coalesce(c.display_name, c.name) as merchant, o.order_number
        from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id join companies c on c.id = s.company_id where o.id = ${payment.orderId}`);
      const row = rows.rows[0];
      return { merchant: row?.merchant ?? "Tienda", concept: `Pedido ${row?.order_number ?? ""}`.trim() };
    }
    const rows = await this.database.db.execute<{ name: string }>(sql`select name from plans where id = ${payment.planId}`);
    return { merchant: "Trama", concept: `Plan ${rows.rows[0]?.name ?? ""} · 30 días`.trim() };
  }
}
