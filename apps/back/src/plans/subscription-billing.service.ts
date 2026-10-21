import { Injectable } from "@nestjs/common";
import { demoCardSchema, type AdminPlanResponse, type DemoCard } from "@velora/contracts";
import type { PlanRow } from "@velora/database";
import { DemoPaymentGateway } from "../billing/payment-gateway.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { PlanLimitsService } from "./plan-limits.service.js";
import type { SubscriptionPaymentInput } from "./plans.repository.js";
import { PlansRepository } from "./plans.repository.js";

/** Cobro de suscripciones por la pasarela DEMO (Fase 5: QR) y cambio de plan pagado. */
@Injectable()
export class SubscriptionBillingService {
  constructor(
    private readonly limits: PlanLimitsService,
    private readonly plans: PlansRepository,
    private readonly gateway: DemoPaymentGateway,
  ) {}

  /** Cobra el primer periodo de un plan pago; nada se persiste si la tarjeta se rechaza. */
  async charge(plan: PlanRow, card: DemoCard | null | undefined, reference: string): Promise<SubscriptionPaymentInput | null> {
    const amount = Number(plan.priceMonthly);
    if (amount <= 0) return null;
    if (!card) throw ApiHttpError.coded(402, "PAYMENT_REQUIRED", `Ingrese una tarjeta DEMO para pagar el plan ${plan.name}.`, { amount, currency: plan.currency });
    const parsed = demoCardSchema.parse(card);
    const result = await this.gateway.chargeSubscription({ amount, currency: plan.currency, description: `Suscripción ${plan.name}`, reference, card: parsed });
    if (result.status === "FAILED") throw ApiHttpError.coded(402, "PAYMENT_DECLINED", result.reason, { cardLast4: result.cardLast4 });
    return { amount, currency: plan.currency, provider: this.gateway.provider, externalReference: result.externalReference, notes: `Suscripción ${plan.name} · DEMO •••• ${result.cardLast4}` };
  }

  async changePlan(ownerUserId: string, planCode: string, card: DemoCard | null | undefined): Promise<AdminPlanResponse> {
    const target = await this.limits.validatePlanChange(ownerUserId, planCode);
    const payment = await this.charge(target, card, `plan:${ownerUserId}:${target.code}`);
    const now = new Date();
    await this.plans.changeOwnerPlan({ ownerUserId, planId: target.id, status: "ACTIVE", periodStart: now, periodEnd: this.limits.periodEndFor(target, now), payment });
    return this.limits.adminPlan(ownerUserId);
  }
}
