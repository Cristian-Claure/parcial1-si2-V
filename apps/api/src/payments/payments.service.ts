import {
  Injectable,
} from "@nestjs/common";

import type {
  CreatePaymentRequest,
  PaymentActionRequest,
  PaymentHistoryResponse,
  PaymentResponse,
  StripeCheckoutResponse,
} from "@velora/contracts";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  AccessContextService,
  type ActorAccessContext,
} from "../common/authz/access-context.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  PaymentsRepository,
} from "./payments.repository.js";

import {
  StripeGatewayService,
} from "./stripe-gateway.service.js";

import { CustomerPushService } from "../push/customer-push.service.js";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly payments:
      PaymentsRepository,

    private readonly access:
      AccessContextService,

    private readonly stripe:
      StripeGatewayService,

    private readonly push?:
      CustomerPushService,
  ) {}

  async create(
    principal:
      AuthPrincipal,
    orderId:
      string,
    request:
      CreatePaymentRequest,
  ): Promise<PaymentResponse> {
    const customerId =
      await this.requireCustomer(
        principal,
      );

    const paymentId =
      await this.payments
        .create(
          customerId,
          orderId,
          request.method,
          this.trimToNull(
            request.notes,
          ),
        );

    return this.requireCustomerPayment(
      customerId,
      paymentId,
    );
  }

  async list(
    principal:
      AuthPrincipal,
    orderId:
      string,
  ): Promise<
    PaymentResponse[]
  > {
    const customerId =
      await this.requireCustomer(
        principal,
      );

    return this.payments
      .listForCustomerOrder(
        customerId,
        orderId,
      );
  }

  async get(
    principal:
      AuthPrincipal,
    paymentId:
      string,
  ): Promise<PaymentResponse> {
    const customerId =
      await this.requireCustomer(
        principal,
      );

    return this.requireCustomerPayment(
      customerId,
      paymentId,
    );
  }

  async history(
    principal:
      AuthPrincipal,
    paymentId:
      string,
  ): Promise<
    PaymentHistoryResponse[]
  > {
    const customerId =
      await this.requireCustomer(
        principal,
      );

    return this.payments
      .historyForCustomer(
        customerId,
        paymentId,
      );
  }

  async cancel(
    principal:
      AuthPrincipal,
    paymentId:
      string,
    request:
      PaymentActionRequest,
  ): Promise<PaymentResponse> {
    const customerId =
      await this.requireCustomer(
        principal,
      );

    const id =
      await this.payments
        .cancelPending(
          customerId,
          paymentId,
          this.normalizeReason(
            request.reason,
            "Pago cancelado por el cliente.",
          ),
          async (payment) =>
            this.stripe
              .expirePendingCheckoutIfNeeded(
                payment,
              ),
        );

    const payment = await this.requireCustomerPayment(
      customerId,
      id,
    );

    this.push?.paymentCancelled(payment.orderId);
    return payment;
  }

  async confirm(
    principal:
      AuthPrincipal,
    paymentId:
      string,
    request:
      PaymentActionRequest,
  ): Promise<PaymentResponse> {
    const actor =
      await this.requireOperational(
        principal,
      );

    const id =
      await this.payments
        .confirm(
          actor,
          paymentId,
          this.normalizeReason(
            request.reason,
            "Pago confirmado.",
          ),
        );

    const payment = await this.requirePayment(
      id,
    );

    this.push?.paymentConfirmed(payment.orderId);
    return payment;
  }

  async fail(
    principal:
      AuthPrincipal,
    paymentId:
      string,
    request:
      PaymentActionRequest,
  ): Promise<PaymentResponse> {
    const actor =
      await this.requireOperational(
        principal,
      );

    const id =
      await this.payments
        .fail(
          actor,
          paymentId,
          this.normalizeReason(
            request.reason,
            "Intento de pago fallido.",
          ),
        );

    const payment = await this.requirePayment(
      id,
    );

    this.push?.paymentFailed(payment.orderId);
    return payment;
  }

  async refund(
    principal:
      AuthPrincipal,
    paymentId:
      string,
    request:
      PaymentActionRequest,
  ): Promise<PaymentResponse> {
    const actor =
      await this.requireOperational(
        principal,
      );

    const id =
      await this.payments
        .refund(
          actor,
          paymentId,
          this.normalizeReason(
            request.reason,
            "Pago reembolsado.",
          ),
          async (payment) =>
            this.stripe
              .refundPaidPaymentIfNeeded(
                payment,
              ),
        );

    const payment = await this.requirePayment(
      id,
    );

    this.push?.paymentRefunded(payment.orderId);
    return payment;
  }

  async stripeCheckout(
    principal:
      AuthPrincipal,
    orderId:
      string,
    returnTarget:
      "WEB" |
      "MOBILE" =
        "WEB",
  ): Promise<StripeCheckoutResponse> {
    const customerId =
      await this.requireCustomer(
        principal,
      );

    const created =
      await this.payments
        .createStripeCheckout(
          customerId,
          orderId,
          (input) =>
            this.stripe
              .createCheckoutSession(
                input,
                returnTarget,
              ),
        );

    const payment =
      await this.requireCustomerPayment(
        customerId,
        created.paymentId,
      );

    return {
      payment,

      checkoutUrl:
        created.session.url,

      sessionId:
        created.session.id,

      expiresAt:
        created.session.expiresAt
          ?.toISOString() ??
        null,
    };
  }

  private async requireCustomerPayment(
    customerId:
      string,
    paymentId:
      string,
  ): Promise<PaymentResponse> {
    const payment =
      await this.payments
        .getForCustomer(
          customerId,
          paymentId,
        );

    if (!payment) {
      throw new ApiHttpError(
        404,
        "Pago no encontrado.",
      );
    }

    return payment;
  }

  private async requirePayment(
    paymentId:
      string,
  ): Promise<PaymentResponse> {
    const payment =
      await this.payments
        .get(
          paymentId,
        );

    if (!payment) {
      throw new ApiHttpError(
        404,
        "Pago no encontrado.",
      );
    }

    return payment;
  }

  private async requireCustomer(
    principal:
      AuthPrincipal,
  ): Promise<string> {
    const actor =
      await this.access
        .resolve(
          principal,
        );

    if (
      actor.role !==
      "CUSTOMER"
    ) {
      throw new ApiHttpError(
        403,
        "La operación está disponible únicamente para clientes.",
      );
    }

    return actor.userId;
  }

  private async requireOperational(
    principal:
      AuthPrincipal,
  ): Promise<ActorAccessContext> {
    const actor =
      await this.access
        .resolve(
          principal,
        );

    if (
      actor.role !==
        "ADMIN" &&
      actor.role !==
        "STORE_MANAGER"
    ) {
      throw new ApiHttpError(
        403,
        "No tiene permisos para procesar pagos.",
      );
    }

    return actor;
  }

  private normalizeReason(
    value:
      string |
      null |
      undefined,
    fallback:
      string,
  ): string {
    return this.trimToNull(
      value,
    ) ??
      fallback;
  }

  private trimToNull(
    value:
      string |
      null |
      undefined,
  ): string |
    null {
    if (
      value ===
        null ||
      value ===
        undefined ||
      value.trim()
        .length ===
        0
    ) {
      return null;
    }

    return value.trim();
  }
}
