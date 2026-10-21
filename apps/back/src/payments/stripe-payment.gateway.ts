import { Injectable } from "@nestjs/common";
import { ApiHttpError } from "../common/http/api-http.error.js";
import type { GatewayChargeResult, PaymentGateway } from "../billing/payment-gateway.js";
import { StripeGatewayService } from "./stripe-gateway.service.js";

/**
 * Stripe detrás de la abstracción PaymentGateway. El checkout de pedidos sigue usando
 * StripeGatewayService tal cual (sin cambios de comportamiento); los cobros de suscripción
 * por Stripe no están habilitados en la Fase 1 (se usan Demo y, en la Fase 5, QR).
 */
@Injectable()
export class StripePaymentGateway implements PaymentGateway {
  readonly provider = "STRIPE" as const;
  readonly capabilities = { orderCheckout: true, subscriptionCharge: false };

  constructor(readonly checkout: StripeGatewayService) {}

  chargeSubscription(): Promise<GatewayChargeResult> {
    throw new ApiHttpError(501, "Stripe no está habilitado para cobrar suscripciones en esta fase.");
  }
}
