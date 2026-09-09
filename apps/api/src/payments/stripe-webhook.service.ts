import {
  Injectable,
} from "@nestjs/common";

import {
  PaymentsRepository,
} from "./payments.repository.js";

import {
  StripeGatewayService,
} from "./stripe-gateway.service.js";

@Injectable()
export class StripeWebhookService {
  constructor(
    private readonly stripe:
      StripeGatewayService,

    private readonly payments:
      PaymentsRepository,
  ) {}

  async handle(
    payload:
      string,
    signature:
      string,
  ): Promise<void> {
    const event =
      this.stripe
        .verifyWebhook(
          payload,
          signature,
        );

    const session =
      this.session(
        event.data.object,
      );

    if (!session) {
      return;
    }

    switch (
      event.type
    ) {
      case "checkout.session.completed":
        if (
          session.paymentStatus
            .toLowerCase() ===
          "paid"
        ) {
          await this.payments
            .stripePaid(
              session.id,
              "Pago confirmado por webhook firmado de Stripe.",
            );
        }

        return;

      case "checkout.session.async_payment_succeeded":
        await this.payments
          .stripePaid(
            session.id,
            "Pago confirmado por webhook firmado de Stripe.",
          );

        return;

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await this.payments
          .stripeFailed(
            session.id,
            "Stripe informó que la sesión expiró o el pago asíncrono falló.",
          );

        return;

      default:
        return;
    }
  }

  private session(
    value:
      unknown,
  ): {
    id:
      string;

    paymentStatus:
      string;
  } |
    null {
    if (
      typeof value !==
        "object" ||
      value ===
        null
    ) {
      return null;
    }

    const session =
      value as {
        id?:
          unknown;

        payment_status?:
          unknown;
      };

    if (
      typeof session.id !==
        "string"
    ) {
      return null;
    }

    return {
      id:
        session.id,

      paymentStatus:
        typeof session.payment_status ===
          "string"
          ? session.payment_status
          : "",
    };
  }
}
