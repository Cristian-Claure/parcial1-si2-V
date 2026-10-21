import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DEMO_DECLINED_CARD } from "@velora/contracts";

/**
 * Abstracción de pasarelas de pago. Cada implementación declara qué flujos soporta:
 * - Stripe: checkout de pedidos (redirección + webhook), sin cambios respecto a la Fase 0.
 * - Demo: cobro inmediato de suscripciones hasta que llegue el pago por QR (Fase 5).
 */
export interface PaymentGatewayCapabilities {
  orderCheckout: boolean;
  subscriptionCharge: boolean;
}

export interface SubscriptionChargeInput {
  amount: number;
  currency: string;
  description: string;
  reference: string;
  card: { cardNumber: string; holderName: string };
}

export type GatewayChargeResult =
  | { status: "PAID"; externalReference: string; cardLast4: string }
  | { status: "FAILED"; externalReference: string; cardLast4: string; reason: string };

export interface PaymentGateway {
  readonly provider: "STRIPE" | "DEMO";
  readonly capabilities: PaymentGatewayCapabilities;
  chargeSubscription(input: SubscriptionChargeInput): Promise<GatewayChargeResult>;
}

export const PAYMENT_GATEWAY_PROVIDERS = ["STRIPE", "DEMO"] as const;

/** Aprueba cualquier tarjeta salvo la de rechazo de prueba (4000 0000 0000 0002). Nunca guarda el número. */
@Injectable()
export class DemoPaymentGateway implements PaymentGateway {
  readonly provider = "DEMO" as const;
  readonly capabilities = { orderCheckout: false, subscriptionCharge: true };

  async chargeSubscription(input: SubscriptionChargeInput): Promise<GatewayChargeResult> {
    const cardLast4 = input.card.cardNumber.slice(-4);
    const externalReference = `demo_${randomUUID()}`;
    if (input.card.cardNumber === DEMO_DECLINED_CARD) {
      return { status: "FAILED", externalReference, cardLast4, reason: "La tarjeta DEMO fue rechazada." };
    }
    return { status: "PAID", externalReference, cardLast4 };
  }
}
