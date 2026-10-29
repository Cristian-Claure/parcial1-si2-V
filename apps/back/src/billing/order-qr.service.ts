import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { orders, payments, qrCharges } from "@velora/database";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { DatabaseService } from "../database/database.service.js";
import { PaymentSettlementService } from "./payment-settlement.service.js";
import { QrChargeService } from "./qr-charge.service.js";

/**
 * Pago QR de un pedido de cliente (web y móvil). El monto es el total del pedido en el servidor.
 * Si el pedido ya tiene un QR pendiente y vigente se devuelve el mismo (idempotente).
 */
@Injectable()
export class OrderQrService {
  constructor(
    private readonly database: DatabaseService,
    private readonly settlement: PaymentSettlementService,
    private readonly qr: QrChargeService,
  ) {}

  async create(customerId: string, orderId: string): Promise<string> {
    // Vencimiento perezoso de un QR anterior antes de decidir si se reutiliza.
    const previous = await this.database.db.select({ id: payments.id }).from(payments).innerJoin(qrCharges, eq(qrCharges.paymentId, payments.id))
      .where(and(eq(payments.orderId, orderId), eq(payments.status, "PENDING")));
    for (const row of previous) await this.qr.refresh(row.id);

    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select id from orders where id = ${orderId} for update`);
      const order = (await tx.select({ id: orders.id, customerId: orders.customerId, status: orders.status, total: orders.total, currency: orders.currency, orderNumber: orders.orderNumber })
        .from(orders).where(eq(orders.id, orderId)).limit(1))[0];
      if (!order || order.customerId !== customerId) throw new ApiHttpError(404, "Pedido no encontrado.");
      if (order.status !== "RESERVED") throw new ApiHttpError(409, "Solo pueden pagarse pedidos reservados.");
      const open = await tx.select({ id: payments.id, status: payments.status, chargeId: qrCharges.id }).from(payments).leftJoin(qrCharges, eq(qrCharges.paymentId, payments.id))
        .where(and(eq(payments.orderId, order.id), inArray(payments.status, ["PENDING", "PAID"])));
      if (open.some((row) => row.status === "PAID")) throw new ApiHttpError(409, "El pedido ya tiene un pago confirmado.");
      const pending = open.find((row) => row.status === "PENDING");
      if (pending?.chargeId) return pending.id;
      if (pending) throw ApiHttpError.coded(409, "PAYMENT_ALREADY_PENDING", "Ya hay un pago pendiente con otro método. Cancélelo para pagar con QR.");

      const now = new Date();
      const paymentId = randomUUID();
      await tx.insert(payments).values({
        id: paymentId, orderId: order.id, subscriptionId: null, planId: null, method: "QR", status: "PENDING", amount: order.total, currency: order.currency,
        provider: null, externalReference: null, paymentReference: null, notes: "Pago QR generado por el cliente.", createdBy: customerId, processedBy: null,
        paidAt: null, failedAt: null, cancelledAt: null, refundedAt: null, createdAt: now, updatedAt: now,
      });
      await this.settlement.history(tx, paymentId, null, "PENDING", customerId, "QR de pago generado por el cliente.", now);
      await this.qr.createForPayment(tx, { id: paymentId, amount: order.total, currency: order.currency }, `Pedido ${order.orderNumber}`);
      return paymentId;
    });
  }
}
