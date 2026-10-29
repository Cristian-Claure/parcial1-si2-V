import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { auditEvents, orders, paymentStatusHistory, payments, plans, subscriptions, type DatabasePaymentStatus, type PaymentRow } from "@velora/database";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { DatabaseService } from "../database/database.service.js";

export type BillingTransaction = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];

/** Periodo de un plan pagado (Fase 5): 30 días; una renovación anticipada suma desde el vencimiento. */
export const PLAN_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlanPeriod { start: Date; end: Date }

/** Regla pura del periodo: mismo plan vigente → se suma al vencimiento; cambio o vencido → empieza hoy. */
export function nextPlanPeriod(current: { planId: string; status: string; currentPeriodStart: Date; currentPeriodEnd: Date | null } | null, planId: string, now: Date): PlanPeriod {
  if (current && current.planId === planId && current.status === "ACTIVE" && current.currentPeriodEnd && current.currentPeriodEnd > now) {
    return { start: current.currentPeriodStart, end: new Date(current.currentPeriodEnd.getTime() + PLAN_PERIOD_DAYS * DAY_MS) };
  }
  return { start: now, end: new Date(now.getTime() + PLAN_PERIOD_DAYS * DAY_MS) };
}

/**
 * Único punto donde un pago cambia de estado por QR, Stripe (planes) o transferencia.
 * Bloquea el pago (FOR UPDATE), es idempotente (un pago PAID no se vuelve a liquidar) y, si es
 * de suscripción, activa el plan en la MISMA transacción y deja un evento de auditoría.
 */
@Injectable()
export class PaymentSettlementService {
  constructor(private readonly database: DatabaseService) {}

  async lock(tx: BillingTransaction, paymentId: string): Promise<PaymentRow> {
    await tx.execute(sql`select id from payments where id = ${paymentId} for update`);
    const row = (await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1))[0];
    if (!row) throw new ApiHttpError(404, "Pago no encontrado.");
    return row;
  }

  /** Marca PAID. Devuelve false si ya estaba PAID (idempotente). */
  async markPaid(tx: BillingTransaction, paymentId: string, actorUserId: string | null, reason: string): Promise<boolean> {
    const payment = await this.lock(tx, paymentId);
    if (payment.status === "PAID") return false;
    if (payment.status !== "PENDING" && payment.status !== "PENDING_REVIEW") {
      throw ApiHttpError.coded(409, "PAYMENT_NOT_PAYABLE", "Este pago ya no puede confirmarse.", { status: payment.status });
    }
    if (payment.orderId) await this.assertOrderPayable(tx, payment);
    const now = new Date();
    const actor = actorUserId ?? payment.createdBy;
    await tx.update(payments).set({ status: "PAID", processedBy: actor, paidAt: now, updatedAt: now }).where(eq(payments.id, payment.id));
    await this.history(tx, payment.id, payment.status, "PAID", actor, reason, now);
    if (payment.subscriptionId && payment.planId) await this.activatePlan(tx, payment, actor, now);
    return true;
  }

  /** Transición a un estado terminal (CANCELLED, FAILED, EXPIRED) desde los estados permitidos. */
  async transition(tx: BillingTransaction, paymentId: string, from: DatabasePaymentStatus[], to: DatabasePaymentStatus, actorUserId: string | null, reason: string): Promise<PaymentRow> {
    const payment = await this.lock(tx, paymentId);
    if (payment.status === to) return payment;
    if (!from.includes(payment.status)) throw ApiHttpError.coded(409, "PAYMENT_STATE_CONFLICT", "El pago cambió de estado; actualice la pantalla.", { status: payment.status });
    const now = new Date();
    const actor = actorUserId ?? payment.createdBy;
    const patch: Partial<PaymentRow> = { status: to, updatedAt: now };
    if (to === "FAILED") patch.failedAt = now;
    if (to === "CANCELLED") patch.cancelledAt = now;
    const rows = await tx.update(payments).set(patch).where(eq(payments.id, payment.id)).returning();
    await this.history(tx, payment.id, payment.status, to, actor, reason, now);
    return rows[0]!;
  }

  async history(tx: BillingTransaction, paymentId: string, from: DatabasePaymentStatus | null, to: DatabasePaymentStatus, changedBy: string, reason: string, createdAt: Date): Promise<void> {
    await tx.insert(paymentStatusHistory).values({ id: randomUUID(), paymentId, fromStatus: from, toStatus: to, changedBy, reason, createdAt });
  }

  private async assertOrderPayable(tx: BillingTransaction, payment: PaymentRow): Promise<void> {
    const order = (await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, payment.orderId!)).limit(1))[0];
    if (!order || order.status === "CANCELLED") throw ApiHttpError.coded(409, "ORDER_NOT_PAYABLE", "El pedido fue cancelado; el pago no se confirmó.");
    const paid = await tx.select({ id: payments.id }).from(payments).where(and(eq(payments.orderId, payment.orderId!), eq(payments.status, "PAID"))).limit(1);
    if (paid[0]) throw ApiHttpError.coded(409, "ORDER_ALREADY_PAID", "El pedido ya tiene un pago confirmado.");
  }

  private async activatePlan(tx: BillingTransaction, payment: PaymentRow, actorUserId: string, now: Date): Promise<void> {
    await tx.execute(sql`select id from subscriptions where id = ${payment.subscriptionId} for update`);
    const current = (await tx.select().from(subscriptions).where(eq(subscriptions.id, payment.subscriptionId!)).limit(1))[0];
    if (!current) throw new ApiHttpError(404, "Suscripción no encontrada.");
    const plan = (await tx.select({ code: plans.code }).from(plans).where(eq(plans.id, payment.planId!)).limit(1))[0];
    const period = nextPlanPeriod(current, payment.planId!, now);
    await tx.update(subscriptions).set({
      planId: payment.planId!, status: "ACTIVE", currentPeriodStart: period.start, currentPeriodEnd: period.end, grandfathered: false, cancelledAt: null, updatedAt: now,
    }).where(eq(subscriptions.id, current.id));
    await tx.insert(auditEvents).values({
      id: randomUUID(), occurredAt: now, actorUserId, actorEmail: null, actorName: null, actorRole: "SYSTEM", category: "BILLING",
      httpMethod: "POST", routePattern: `billing:plan-activated:${plan?.code ?? "?"}:${payment.method}`, requestPath: `/billing/payments/${payment.id}`,
      statusCode: 200, success: true, requestId: null,
    });
  }
}
