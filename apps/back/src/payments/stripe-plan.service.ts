import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { payments } from "@velora/database";
import { PaymentSettlementService } from "../billing/payment-settlement.service.js";
import { DatabaseService } from "../database/database.service.js";
import { StripeGatewayService } from "./stripe-gateway.service.js";

export type StripePlanOutcome = "NOT_PLAN" | "PAID" | "PENDING" | "EXPIRED" | "UNCHANGED";

/**
 * Pagos de plan por Stripe Checkout. Antes de activar un plan SIEMPRE se revalida la sesión contra
 * la API de Stripe (estado pagado, monto en centavos y moneda iguales a los del servidor), tanto si
 * avisa el webhook firmado como si el propietario consulta un pago PENDING (sin URL pública en local).
 */
@Injectable()
export class StripePlanService {
  constructor(
    private readonly database: DatabaseService,
    private readonly stripe: StripeGatewayService,
    private readonly settlement: PaymentSettlementService,
  ) {}

  async reconcile(sessionId: string, source: "WEBHOOK" | "CONSULTA"): Promise<StripePlanOutcome> {
    const payment = (await this.database.db.select().from(payments).where(and(eq(payments.provider, "STRIPE"), eq(payments.externalReference, sessionId))).limit(1))[0];
    if (!payment?.subscriptionId) return "NOT_PLAN";
    if (payment.status !== "PENDING") return "UNCHANGED";
    const summary = await this.stripe.retrieveCheckoutSummary(sessionId);
    const amountMatches = summary.amountTotal === this.stripe.toMinorUnitsPublic(payment.amount) && summary.currency?.toUpperCase() === payment.currency.toUpperCase();
    if (summary.paymentStatus === "paid" && amountMatches) {
      await this.database.db.transaction((tx) => this.settlement.markPaid(tx, payment.id, null, `Pago Stripe revalidado contra la API (${source.toLowerCase()}).`));
      return "PAID";
    }
    if (summary.status === "expired") {
      await this.database.db.transaction((tx) => this.settlement.transition(tx, payment.id, ["PENDING"], "EXPIRED", null, "La sesión de Stripe venció sin pago."));
      return "EXPIRED";
    }
    return "PENDING";
  }
}
